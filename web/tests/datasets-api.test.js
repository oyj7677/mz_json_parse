import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  handleActiveDatasetRequest,
  handleAdminDatasetActiveRequest,
  handleAdminDatasetDeleteRequest,
  handleAdminDatasetsRequest,
  handleDatasetsRequest
} from '../api/datasets-core.js';

describe('datasets API handlers', () => {
  it('lists public datasets by tool type', async () => {
    const repository = {
      async listDatasets(toolType) {
        assert.equal(toolType, 'json');
        return [{
          id: 'dataset-1',
          name: 'JSON uploads',
          toolType
        }];
      }
    };

    const response = await handleDatasetsRequest(
      new Request('https://example.com/api/datasets?tool=json'),
      { repository }
    );
    const body = await response.json();

    assert.equal(response.status, 200);
    assert.deepEqual(body.datasets, [{
      id: 'dataset-1',
      name: 'JSON uploads',
      toolType: 'json'
    }]);
  });

  it('returns the active public dataset by tool type', async () => {
    const repository = {
      async getActiveDataset(toolType) {
        assert.equal(toolType, 'mapping_table');
        return {
          id: 'dataset-2',
          isActive: true,
          name: 'Mapping workbook',
          toolType
        };
      }
    };

    const response = await handleActiveDatasetRequest(
      new Request('https://example.com/api/datasets/active?tool=mapping_table'),
      { repository }
    );
    const body = await response.json();

    assert.equal(response.status, 200);
    assert.deepEqual(body.dataset, {
      id: 'dataset-2',
      isActive: true,
      name: 'Mapping workbook',
      toolType: 'mapping_table'
    });
  });

  it('creates admin datasets when the admin key matches', async () => {
    const repository = {
      async createDataset(payload) {
        assert.deepEqual(payload, {
          description: 'June JSON files',
          metadata: { source: 'manual' },
          name: 'June uploads',
          toolType: 'json'
        });
        return {
          id: 'dataset-3',
          ...payload
        };
      }
    };

    const response = await handleAdminDatasetsRequest(new Request('https://example.com/api/admin/datasets', {
      body: JSON.stringify({
        description: ' June JSON files ',
        metadata: { source: 'manual' },
        name: ' June uploads ',
        toolType: 'json'
      }),
      headers: { 'x-admin-key': 'secret' },
      method: 'POST'
    }), {
      env: { JSON_ADMIN_KEY: 'secret' },
      repository
    });
    const body = await response.json();

    assert.equal(response.status, 200);
    assert.equal(body.dataset.id, 'dataset-3');
    assert.equal(body.dataset.name, 'June uploads');
  });

  it('protects admin active and delete mutations and calls the repository with the route id', async () => {
    const calls = [];
    const repository = {
      async deleteDataset(id) {
        calls.push(['delete', id]);
        return { deletedCount: 1 };
      },
      async setActiveDataset(id) {
        calls.push(['active', id]);
        return {
          id,
          isActive: true,
          name: 'Active dataset'
        };
      }
    };
    const options = {
      env: { JSON_ADMIN_KEY: 'secret' },
      id: 'dataset-4',
      repository
    };

    const unauthorizedActive = await handleAdminDatasetActiveRequest(
      new Request('https://example.com/api/admin/datasets/dataset-4/active', { method: 'PATCH' }),
      options
    );
    const unauthorizedDelete = await handleAdminDatasetDeleteRequest(
      new Request('https://example.com/api/admin/datasets/dataset-4', { method: 'DELETE' }),
      options
    );
    const activeResponse = await handleAdminDatasetActiveRequest(
      new Request('https://example.com/api/admin/datasets/dataset-4/active', {
        headers: { authorization: 'Bearer secret' },
        method: 'PATCH'
      }),
      options
    );
    const deleteResponse = await handleAdminDatasetDeleteRequest(
      new Request('https://example.com/api/admin/datasets/dataset-4', {
        headers: { 'x-admin-key': 'secret' },
        method: 'DELETE'
      }),
      options
    );
    const activeBody = await activeResponse.json();
    const deleteBody = await deleteResponse.json();

    assert.equal(unauthorizedActive.status, 401);
    assert.equal(unauthorizedDelete.status, 401);
    assert.equal(activeResponse.status, 200);
    assert.equal(deleteResponse.status, 200);
    assert.equal(activeBody.dataset.id, 'dataset-4');
    assert.equal(deleteBody.deletedCount, 1);
    assert.deepEqual(calls, [
      ['active', 'dataset-4'],
      ['delete', 'dataset-4']
    ]);
  });

  it('returns 404 when activating a missing dataset', async () => {
    const repository = {
      async setActiveDataset(id) {
        assert.equal(id, 'missing');
        return undefined;
      }
    };

    const response = await handleAdminDatasetActiveRequest(
      new Request('https://example.com/api/admin/datasets/missing/active', {
        headers: { 'x-admin-key': 'secret' },
        method: 'POST'
      }),
      {
        env: { JSON_ADMIN_KEY: 'secret' },
        id: 'missing',
        repository
      }
    );
    const body = await response.json();

    assert.equal(response.status, 404);
    assert.equal(body.error, 'Dataset not found.');
  });
});
