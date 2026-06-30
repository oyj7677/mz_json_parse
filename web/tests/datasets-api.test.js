import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import adminDatasetsApi, { createAdminDatasetsRoute } from '../api/admin/datasets.js';
import adminDatasetDeleteApi, { createAdminDatasetDeleteRoute } from '../api/admin/datasets/[id].js';
import adminDatasetActiveApi, { createAdminDatasetActiveRoute } from '../api/admin/datasets/[id]/active.js';
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

  it('normalizes non-plain dataset metadata to an empty object', async () => {
    const repository = {
      async createDataset(payload) {
        assert.deepEqual(payload.metadata, {});
        return {
          id: 'dataset-array-metadata',
          ...payload
        };
      }
    };

    const response = await handleAdminDatasetsRequest(new Request('https://example.com/api/admin/datasets', {
      body: JSON.stringify({
        metadata: ['not', 'plain'],
        name: 'Array metadata',
        toolType: 'json'
      }),
      headers: { 'x-admin-key': 'secret' },
      method: 'POST'
    }), {
      env: { JSON_ADMIN_KEY: 'secret' },
      repository
    });

    assert.equal(response.status, 200);
  });

  it('lists admin datasets by tool type when authorized', async () => {
    const repository = {
      async listDatasets(toolType) {
        assert.equal(toolType, 'string_resource');
        return [{
          id: 'dataset-string-resource',
          name: 'String workbook',
          toolType
        }];
      }
    };

    const response = await handleAdminDatasetsRequest(
      new Request('https://example.com/api/admin/datasets?tool=string_resource', {
        headers: { authorization: 'Bearer secret' }
      }),
      {
        env: { JSON_ADMIN_KEY: 'secret' },
        repository
      }
    );
    const body = await response.json();

    assert.equal(response.status, 200);
    assert.equal(body.datasets[0].id, 'dataset-string-resource');
  });

  it('returns 503 when dataset repository is missing', async () => {
    const publicResponse = await handleDatasetsRequest(
      new Request('https://example.com/api/datasets?tool=json')
    );
    const activeResponse = await handleActiveDatasetRequest(
      new Request('https://example.com/api/datasets/active?tool=json')
    );
    const adminResponse = await handleAdminDatasetsRequest(
      new Request('https://example.com/api/admin/datasets?tool=json', {
        headers: { 'x-admin-key': 'secret' }
      }),
      { env: { JSON_ADMIN_KEY: 'secret' } }
    );
    const adminActiveResponse = await handleAdminDatasetActiveRequest(
      new Request('https://example.com/api/admin/datasets/dataset-1/active', {
        headers: { 'x-admin-key': 'secret' },
        method: 'PATCH'
      }),
      {
        env: { JSON_ADMIN_KEY: 'secret' },
        id: 'dataset-1'
      }
    );
    const adminDeleteResponse = await handleAdminDatasetDeleteRequest(
      new Request('https://example.com/api/admin/datasets/dataset-1', {
        headers: { 'x-admin-key': 'secret' },
        method: 'DELETE'
      }),
      {
        env: { JSON_ADMIN_KEY: 'secret' },
        id: 'dataset-1'
      }
    );
    const publicBody = await publicResponse.json();
    const activeBody = await activeResponse.json();
    const adminBody = await adminResponse.json();
    const adminActiveBody = await adminActiveResponse.json();
    const adminDeleteBody = await adminDeleteResponse.json();

    assert.equal(publicResponse.status, 503);
    assert.equal(activeResponse.status, 503);
    assert.equal(adminResponse.status, 503);
    assert.equal(adminActiveResponse.status, 503);
    assert.equal(adminDeleteResponse.status, 503);
    assert.equal(publicBody.error, 'DATABASE_URL is not configured.');
    assert.equal(activeBody.error, 'DATABASE_URL is not configured.');
    assert.equal(adminBody.error, 'DATABASE_URL is not configured.');
    assert.equal(adminActiveBody.error, 'DATABASE_URL is not configured.');
    assert.equal(adminDeleteBody.error, 'DATABASE_URL is not configured.');
  });

  it('returns 400 for invalid dataset tool types', async () => {
    const repository = {
      async listDatasets() {
        assert.fail('invalid tool type should not call listDatasets');
      }
    };

    const publicResponse = await handleDatasetsRequest(
      new Request('https://example.com/api/datasets?tool=unknown'),
      { repository }
    );
    const activeResponse = await handleActiveDatasetRequest(
      new Request('https://example.com/api/datasets/active?tool=unknown'),
      { repository }
    );
    const adminResponse = await handleAdminDatasetsRequest(
      new Request('https://example.com/api/admin/datasets?tool=unknown', {
        headers: { 'x-admin-key': 'secret' }
      }),
      {
        env: { JSON_ADMIN_KEY: 'secret' },
        repository
      }
    );
    const createResponse = await handleAdminDatasetsRequest(new Request('https://example.com/api/admin/datasets', {
      body: JSON.stringify({ name: 'Bad tool', toolType: 'unknown' }),
      headers: { 'x-admin-key': 'secret' },
      method: 'POST'
    }), {
      env: { JSON_ADMIN_KEY: 'secret' },
      repository
    });

    assert.equal(publicResponse.status, 400);
    assert.equal(activeResponse.status, 400);
    assert.equal(adminResponse.status, 400);
    assert.equal(createResponse.status, 400);
    assert.equal((await publicResponse.json()).error, 'Invalid tool type.');
    assert.equal((await activeResponse.json()).error, 'Invalid tool type.');
    assert.equal((await adminResponse.json()).error, 'Invalid tool type.');
    assert.equal((await createResponse.json()).error, 'Invalid tool type.');
  });

  it('returns 405 for wrong dataset methods after valid admin authentication', async () => {
    const repository = {};
    const env = { JSON_ADMIN_KEY: 'secret' };
    const headers = { 'x-admin-key': 'secret' };

    const publicResponse = await handleDatasetsRequest(
      new Request('https://example.com/api/datasets?tool=json', { method: 'POST' }),
      { repository }
    );
    const adminListResponse = await handleAdminDatasetsRequest(
      new Request('https://example.com/api/admin/datasets?tool=json', { headers, method: 'PUT' }),
      { env, repository }
    );
    const activeResponse = await handleAdminDatasetActiveRequest(
      new Request('https://example.com/api/admin/datasets/dataset-1/active', { headers, method: 'GET' }),
      { env, id: 'dataset-1', repository }
    );
    const deleteResponse = await handleAdminDatasetDeleteRequest(
      new Request('https://example.com/api/admin/datasets/dataset-1', { headers, method: 'GET' }),
      { env, id: 'dataset-1', repository }
    );

    assert.equal(publicResponse.status, 405);
    assert.equal(adminListResponse.status, 405);
    assert.equal(activeResponse.status, 405);
    assert.equal(deleteResponse.status, 405);
    assert.equal((await publicResponse.json()).error, 'Method not allowed.');
    assert.equal((await adminListResponse.json()).error, 'Method not allowed.');
    assert.equal((await activeResponse.json()).error, 'Method not allowed.');
    assert.equal((await deleteResponse.json()).error, 'Method not allowed.');
  });

  it('authenticates admin dataset handlers before method validation', async () => {
    const env = { JSON_ADMIN_KEY: 'secret' };
    const repository = {};

    const adminListResponse = await handleAdminDatasetsRequest(
      new Request('https://example.com/api/admin/datasets?tool=json', { method: 'PUT' }),
      { env, repository }
    );
    const activeResponse = await handleAdminDatasetActiveRequest(
      new Request('https://example.com/api/admin/datasets/dataset-1/active', { method: 'GET' }),
      { env, id: 'dataset-1', repository }
    );
    const deleteResponse = await handleAdminDatasetDeleteRequest(
      new Request('https://example.com/api/admin/datasets/dataset-1', { method: 'GET' }),
      { env, id: 'dataset-1', repository }
    );

    assert.equal(adminListResponse.status, 401);
    assert.equal(activeResponse.status, 401);
    assert.equal(deleteResponse.status, 401);
  });

  it('does not authenticate empty or whitespace admin key configuration', async () => {
    const repository = {
      async listDatasets() {
        return [];
      }
    };

    const emptyKeyResponse = await handleAdminDatasetsRequest(
      new Request('https://example.com/api/admin/datasets?tool=json'),
      {
        env: { JSON_ADMIN_KEY: '' },
        repository
      }
    );
    const whitespaceKeyResponse = await handleAdminDatasetsRequest(
      new Request('https://example.com/api/admin/datasets?tool=json', {
        headers: { 'x-admin-key': '   ' }
      }),
      {
        env: { JSON_ADMIN_KEY: '   ' },
        repository
      }
    );

    assert.equal(emptyKeyResponse.status, 401);
    assert.equal((await emptyKeyResponse.json()).error, 'Unauthorized.');
    assert.equal(whitespaceKeyResponse.status, 401);
    assert.equal((await whitespaceKeyResponse.json()).error, 'Unauthorized.');
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

  it('routes admin dataset wrapper wrong methods through core authentication', async () => {
    await withAdminKey('secret', async () => {
      const unauthorizedResponse = await adminDatasetsApi.fetch(
        new Request('https://example.com/api/admin/datasets?tool=json', {
          method: 'PUT'
        })
      );
      const authorizedResponse = await adminDatasetsApi.fetch(
        new Request('https://example.com/api/admin/datasets?tool=json', {
          headers: { 'x-admin-key': 'secret' },
          method: 'PUT'
        })
      );

      assert.equal(unauthorizedResponse.status, 401);
      assert.equal((await unauthorizedResponse.json()).error, 'Unauthorized.');
      assert.equal(authorizedResponse.status, 405);
      assert.equal((await authorizedResponse.json()).error, 'Method not allowed.');
    });
  });

  it('routes admin dataset delete wrapper wrong methods through core authentication', async () => {
    await withAdminKey('secret', async () => {
      const unauthorizedResponse = await adminDatasetDeleteApi.fetch(
        new Request('https://example.com/api/admin/datasets/dataset-1', {
          method: 'GET'
        })
      );
      const authorizedResponse = await adminDatasetDeleteApi.fetch(
        new Request('https://example.com/api/admin/datasets/dataset-1', {
          headers: { 'x-admin-key': 'secret' },
          method: 'GET'
        })
      );

      assert.equal(unauthorizedResponse.status, 401);
      assert.equal((await unauthorizedResponse.json()).error, 'Unauthorized.');
      assert.equal(authorizedResponse.status, 405);
      assert.equal((await authorizedResponse.json()).error, 'Method not allowed.');
    });
  });

  it('routes admin dataset active wrapper wrong methods through core authentication', async () => {
    await withAdminKey('secret', async () => {
      const unauthorizedResponse = await adminDatasetActiveApi.fetch(
        new Request('https://example.com/api/admin/datasets/dataset-1/active', {
          method: 'GET'
        })
      );
      const authorizedResponse = await adminDatasetActiveApi.fetch(
        new Request('https://example.com/api/admin/datasets/dataset-1/active', {
          headers: { 'x-admin-key': 'secret' },
          method: 'GET'
        })
      );

      assert.equal(unauthorizedResponse.status, 401);
      assert.equal((await unauthorizedResponse.json()).error, 'Unauthorized.');
      assert.equal(authorizedResponse.status, 405);
      assert.equal((await authorizedResponse.json()).error, 'Method not allowed.');
    });
  });

  it('keeps admin datasets wrapper auth-first for unauthenticated GET requests', async () => {
    await withAdminKey('secret', async () => {
      let repositoryCalls = 0;
      const route = createAdminDatasetsRoute({
        async getRepository() {
          repositoryCalls += 1;
          return {
            async listDatasets() {
              return [];
            }
          };
        }
      });

      const response = await route.handler.fetch(
        new Request('https://example.com/api/admin/datasets?tool=json')
      );

      assert.equal(response.status, 401);
      assert.equal((await response.json()).error, 'Unauthorized.');
      assert.equal(repositoryCalls, 0);
    });
  });

  it('keeps admin datasets wrapper auth-first for unauthenticated POST requests', async () => {
    await withAdminKey('secret', async () => {
      let repositoryCalls = 0;
      const route = createAdminDatasetsRoute({
        async getRepository() {
          repositoryCalls += 1;
          return {
            async createDataset() {
              return {};
            }
          };
        }
      });

      const response = await route.handler.fetch(
        new Request('https://example.com/api/admin/datasets', {
          body: JSON.stringify({ name: 'Unauthorized dataset', toolType: 'json' }),
          method: 'POST'
        })
      );

      assert.equal(response.status, 401);
      assert.equal((await response.json()).error, 'Unauthorized.');
      assert.equal(repositoryCalls, 0);
    });
  });

  it('keeps admin dataset id wrapper auth-first for unauthenticated DELETE requests', async () => {
    await withAdminKey('secret', async () => {
      let repositoryCalls = 0;
      const route = createAdminDatasetDeleteRoute({
        async getRepository() {
          repositoryCalls += 1;
          return {
            async deleteDataset() {
              return { deletedCount: 1 };
            }
          };
        }
      });

      const response = await route.handler.fetch(
        new Request('https://example.com/api/admin/datasets/dataset-1', {
          method: 'DELETE'
        })
      );

      assert.equal(response.status, 401);
      assert.equal((await response.json()).error, 'Unauthorized.');
      assert.equal(repositoryCalls, 0);
    });
  });

  it('keeps admin active wrapper auth-first for unauthenticated PATCH requests', async () => {
    await withAdminKey('secret', async () => {
      let repositoryCalls = 0;
      const route = createAdminDatasetActiveRoute({
        async getRepository() {
          repositoryCalls += 1;
          return {
            async setActiveDataset() {
              return {};
            }
          };
        }
      });

      const response = await route.handler.fetch(
        new Request('https://example.com/api/admin/datasets/dataset-1/active', {
          method: 'PATCH'
        })
      );

      assert.equal(response.status, 401);
      assert.equal((await response.json()).error, 'Unauthorized.');
      assert.equal(repositoryCalls, 0);
    });
  });

  it('keeps admin active wrapper auth-first for unauthenticated POST requests', async () => {
    await withAdminKey('secret', async () => {
      let repositoryCalls = 0;
      const route = createAdminDatasetActiveRoute({
        async getRepository() {
          repositoryCalls += 1;
          return {
            async setActiveDataset() {
              return {};
            }
          };
        }
      });

      const response = await route.handler.fetch(
        new Request('https://example.com/api/admin/datasets/dataset-1/active', {
          method: 'POST'
        })
      );

      assert.equal(response.status, 401);
      assert.equal((await response.json()).error, 'Unauthorized.');
      assert.equal(repositoryCalls, 0);
    });
  });
});

async function withAdminKey(value, callback) {
  const previousValue = process.env.JSON_ADMIN_KEY;
  process.env.JSON_ADMIN_KEY = value;

  try {
    await callback();
  } finally {
    if (previousValue === undefined) {
      delete process.env.JSON_ADMIN_KEY;
    } else {
      process.env.JSON_ADMIN_KEY = previousValue;
    }
  }
}
