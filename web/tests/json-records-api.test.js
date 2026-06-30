import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createAdminJsonBatchDeleteRoute } from '../server-api/admin/json-batches/[id].js';
import { createAdminJsonImportRoute } from '../server-api/admin/json-records/import.js';
import { createAdminJsonRecordDeleteRoute } from '../server-api/admin/json-records/[id].js';
import { createAdminJsonStatusRoute } from '../server-api/admin/json-records/status.js';
import { createJsonCountriesRoute } from '../server-api/json-countries.js';
import { createJsonRecordsRoute } from '../server-api/json-records.js';
import {
  handleAdminBatchDeleteRequest,
  handleAdminImportRequest,
  handleAdminRecordDeleteRequest,
  handleAdminStatusRequest,
  handleJsonCountriesRequest,
  handleJsonRecordDetailRequest,
  handleJsonRecordsRequest
} from '../server-api/json-records-core.js';

const JSON_DATASET_ID = '00000000-0000-4000-8000-000000000001';

describe('JSON records API handlers', () => {
  it('serves public search results without an admin key', async () => {
    const repository = {
      async searchRecords(params) {
        assert.equal(params.query, 'weather');
        return {
          records: [{
            id: 'record-1',
            source_filename: 'weather.json',
            recognition_text: 'What is the weather',
            content_type: 'Weather',
            table_version: '3.3.21',
            created_at: '2026-06-22T00:00:00.000Z'
          }],
          total: 1
        };
      }
    };

    const response = await handleJsonRecordsRequest(
      new Request('https://example.com/api/json-records?q=weather'),
      { repository }
    );
    const body = await response.json();

    assert.equal(response.status, 200);
    assert.equal(body.total, 1);
    assert.equal(body.records[0].sourceFilename, 'weather.json');
    assert.equal(body.records[0].recognitionText, 'What is the weather');
  });

  it('serves public detail records without an admin key', async () => {
    const repository = {
      async getRecordById(id) {
        assert.equal(id, 'record-1');
        return {
          id,
          source_filename: 'weather.json',
          recognition_text: 'What is the weather',
          raw_json: { recognitionText: 'What is the weather' },
          raw_text: ''
        };
      }
    };

    const response = await handleJsonRecordDetailRequest(
      new Request('https://example.com/api/json-records/record-1'),
      { id: 'record-1', repository }
    );
    const body = await response.json();

    assert.equal(response.status, 200);
    assert.equal(body.record.rawJson.recognitionText, 'What is the weather');
  });

  it('uses 1313 as the default admin key when no environment key is configured', async () => {
    const repository = {
      async getStatus() {
        return { batchCount: 0, recordCount: 0 };
      }
    };

    const response = await handleAdminStatusRequest(new Request('https://example.com/api/admin/json-records/status', {
      headers: { 'x-admin-key': '1313' }
    }), {
      env: {},
      repository
    });
    const body = await response.json();

    assert.equal(response.status, 200);
    assert.equal(body.status.recordCount, 0);
  });

  it('does not authenticate empty or whitespace admin key configuration', async () => {
    const repository = {
      async getStatus() {
        return { batchCount: 0, recordCount: 0 };
      }
    };

    const emptyKeyResponse = await handleAdminStatusRequest(
      new Request('https://example.com/api/admin/json-records/status'),
      {
        env: { JSON_ADMIN_KEY: '' },
        repository
      }
    );
    const whitespaceKeyResponse = await handleAdminStatusRequest(
      new Request('https://example.com/api/admin/json-records/status', {
        headers: { 'x-admin-key': '   ' }
      }),
      {
        env: { JSON_ADMIN_KEY: '   ' },
        repository
      }
    );

    assert.equal(emptyKeyResponse.status, 401);
    assert.equal(whitespaceKeyResponse.status, 401);
  });

  it('rejects admin imports when the admin key is missing or wrong', async () => {
    const request = new Request('https://example.com/api/admin/json-records/import', {
      body: JSON.stringify({ files: [{ filename: 'a.json', text: '{"recognitionText":"A"}' }] }),
      method: 'POST'
    });

    const missingConfig = await handleAdminImportRequest(request.clone(), {
      env: {},
      repository: {}
    });
    assert.equal(missingConfig.status, 401);

    const wrongKey = await handleAdminImportRequest(request.clone(), {
      env: { JSON_ADMIN_KEY: 'secret' },
      repository: {}
    });
    assert.equal(wrongKey.status, 401);
  });

  it('imports JSON files when the admin key is valid', async () => {
    const repository = {
      async importRecords(payload) {
        assert.equal(payload.datasetId, JSON_DATASET_ID);
        assert.equal(payload.countryRegion, 'AU');
        assert.equal(payload.records.length, 1);
        assert.equal(payload.records[0].countryRegion, 'AU');
        assert.equal(payload.records[0].recognitionText, 'A');
        return {
          datasetId: payload.datasetId,
          countryRegion: payload.countryRegion,
          insertedCount: 1,
          skippedCount: 0
        };
      }
    };
    const response = await handleAdminImportRequest(new Request('https://example.com/api/admin/json-records/import', {
      body: JSON.stringify({
        batchName: 'June logs',
        countryRegion: 'AU',
        datasetId: JSON_DATASET_ID,
        files: [{ filename: 'a.json', text: '{"recognitionText":"A"}' }]
      }),
      headers: { 'x-admin-key': 'secret' },
      method: 'POST'
    }), {
      env: { JSON_ADMIN_KEY: 'secret' },
      repository
    });
    const body = await response.json();

    assert.equal(response.status, 200);
    assert.equal(body.datasetId, JSON_DATASET_ID);
    assert.equal(body.countryRegion, 'AU');
    assert.equal(body.insertedCount, 1);
  });

  it('rejects invalid admin import dataset ids before loading the repository', async () => {
    let repositoryLoads = 0;
    const response = await handleAdminImportRequest(new Request('https://example.com/api/admin/json-records/import', {
      body: JSON.stringify({
        countryRegion: 'AU',
        datasetId: 'not-a-uuid',
        files: [{ filename: 'a.json', text: '{"recognitionText":"A"}' }]
      }),
      headers: { 'x-admin-key': 'secret' },
      method: 'POST'
    }), {
      env: { JSON_ADMIN_KEY: 'secret' },
      repository: async () => {
        repositoryLoads += 1;
        return {
          async importRecords() {
            throw new Error('should not import with an invalid datasetId');
          }
        };
      }
    });
    const body = await response.json();

    assert.equal(response.status, 400);
    assert.match(body.error, /valid UUID/);
    assert.equal(repositoryLoads, 0);
  });

  it('requires countryRegion for JSON admin imports', async () => {
    const repository = {
      async importRecords() {
        throw new Error('should not import without countryRegion');
      }
    };
    const response = await handleAdminImportRequest(new Request('https://example.com/api/admin/json-records/import', {
      body: JSON.stringify({
        datasetId: JSON_DATASET_ID,
        files: [{ filename: 'a.json', text: '{"recognitionText":"A"}' }]
      }),
      headers: { 'x-admin-key': 'secret' },
      method: 'POST'
    }), {
      env: { JSON_ADMIN_KEY: 'secret' },
      repository
    });
    const body = await response.json();

    assert.equal(response.status, 400);
    assert.match(body.error, /countryRegion/);
  });

  it('imports JSON files into a dataset country', async () => {
    const repository = {
      async importRecords(payload) {
        assert.equal(payload.datasetId, JSON_DATASET_ID);
        assert.equal(payload.countryRegion, 'AU');
        assert.equal(payload.records.length, 1);
        assert.equal(payload.records[0].countryRegion, 'AU');
        assert.equal(payload.records[0].recognitionText, 'A');
        return {
          datasetId: payload.datasetId,
          countryRegion: payload.countryRegion,
          insertedCount: 1,
          skippedCount: 0
        };
      }
    };
    const response = await handleAdminImportRequest(new Request('https://example.com/api/admin/json-records/import', {
      body: JSON.stringify({
        countryRegion: 'AU',
        datasetId: JSON_DATASET_ID,
        files: [{ filename: 'a.json', text: '{"recognitionText":"A"}' }]
      }),
      headers: { 'x-admin-key': 'secret' },
      method: 'POST'
    }), {
      env: { JSON_ADMIN_KEY: 'secret' },
      repository
    });
    const body = await response.json();

    assert.equal(response.status, 200);
    assert.equal(body.datasetId, JSON_DATASET_ID);
    assert.equal(body.countryRegion, 'AU');
    assert.equal(body.insertedCount, 1);
  });

  it('passes dataset and country filters to public search', async () => {
    const repository = {
      async searchRecords(params) {
        assert.equal(params.datasetId, JSON_DATASET_ID);
        assert.equal(params.countryRegion, 'AU');
        assert.equal(params.query, 'weather');
        return {
          records: [],
          total: 0
        };
      }
    };

    const response = await handleJsonRecordsRequest(
      new Request(`https://example.com/api/json-records?datasetId=${JSON_DATASET_ID}&country=AU&q=weather`),
      { repository }
    );
    const body = await response.json();

    assert.equal(response.status, 200);
    assert.equal(body.total, 0);
  });

  it('rejects invalid public search dataset ids before loading the repository', async () => {
    let repositoryLoads = 0;
    const response = await handleJsonRecordsRequest(
      new Request('https://example.com/api/json-records?datasetId=not-a-uuid&q=weather'),
      {
        repository: async () => {
          repositoryLoads += 1;
          return {
            async searchRecords() {
              throw new Error('should not search with an invalid datasetId');
            }
          };
        }
      }
    );
    const body = await response.json();

    assert.equal(response.status, 400);
    assert.match(body.error, /valid UUID/);
    assert.equal(repositoryLoads, 0);
  });

  it('lists JSON countries for a dataset', async () => {
    const countries = [
      { countryRegion: 'AU', count: 2 },
      { countryRegion: 'US', count: 1 }
    ];
    const repository = {
      async listCountries(datasetId) {
        assert.equal(datasetId, JSON_DATASET_ID);
        return countries;
      }
    };

    const response = await handleJsonCountriesRequest(
      new Request(`https://example.com/api/json-countries?datasetId=${JSON_DATASET_ID}`),
      { repository }
    );
    const body = await response.json();

    assert.equal(response.status, 200);
    assert.deepEqual(body.countries, countries);
  });

  it('rejects missing and invalid countries dataset ids before loading the repository', async () => {
    let repositoryLoads = 0;
    const getRepository = async () => {
      repositoryLoads += 1;
      return {
        async listCountries() {
          throw new Error('should not list countries without a valid datasetId');
        }
      };
    };

    const missingDatasetResponse = await handleJsonCountriesRequest(
      new Request('https://example.com/api/json-countries'),
      { repository: getRepository }
    );
    const missingDatasetBody = await missingDatasetResponse.json();
    const invalidDatasetResponse = await handleJsonCountriesRequest(
      new Request('https://example.com/api/json-countries?datasetId=not-a-uuid'),
      { repository: getRepository }
    );
    const invalidDatasetBody = await invalidDatasetResponse.json();

    assert.equal(missingDatasetResponse.status, 400);
    assert.match(missingDatasetBody.error, /datasetId/);
    assert.equal(invalidDatasetResponse.status, 400);
    assert.match(invalidDatasetBody.error, /valid UUID/);
    assert.equal(repositoryLoads, 0);
  });

  it('keeps public JSON records Vercel wrapper validation-first before loading repositories', async () => {
    let repositoryLoads = 0;
    const route = createJsonRecordsRoute({
      getRepository: async () => {
        repositoryLoads += 1;
        return {
          async searchRecords() {
            throw new Error('should not search with an invalid datasetId');
          }
        };
      }
    });

    const response = await route.handler.fetch(
      new Request('https://example.com/api/json-records?datasetId=not-a-uuid&q=weather')
    );
    const body = await response.json();

    assert.equal(response.status, 400);
    assert.match(body.error, /valid UUID/);
    assert.equal(repositoryLoads, 0);
  });

  it('keeps public JSON countries Vercel wrapper validation-first before loading repositories', async () => {
    let repositoryLoads = 0;
    const route = createJsonCountriesRoute({
      getRepository: async () => {
        repositoryLoads += 1;
        return {
          async listCountries() {
            throw new Error('should not list countries with an invalid datasetId');
          }
        };
      }
    });

    const response = await route.handler.fetch(
      new Request('https://example.com/api/json-countries?datasetId=not-a-uuid')
    );
    const body = await response.json();

    assert.equal(response.status, 400);
    assert.match(body.error, /valid UUID/);
    assert.equal(repositoryLoads, 0);
  });

  it('protects admin status and delete operations with the admin key', async () => {
    const calls = [];
    const repository = {
      async deleteBatch(id) {
        calls.push(['batch', id]);
        return { deletedCount: 3 };
      },
      async deleteRecord(id) {
        calls.push(['record', id]);
        return { deletedCount: 1 };
      },
      async getStatus() {
        calls.push(['status']);
        return { recordCount: 7, batchCount: 2 };
      }
    };
    const options = { env: { JSON_ADMIN_KEY: 'secret' }, repository };
    const headers = { 'x-admin-key': 'secret' };

    const statusResponse = await handleAdminStatusRequest(
      new Request('https://example.com/api/admin/json-records/status', { headers }),
      options
    );
    const recordDeleteResponse = await handleAdminRecordDeleteRequest(
      new Request('https://example.com/api/admin/json-records/record-1', { headers, method: 'DELETE' }),
      { ...options, id: 'record-1' }
    );
    const batchDeleteResponse = await handleAdminBatchDeleteRequest(
      new Request('https://example.com/api/admin/json-batches/batch-1', { headers, method: 'DELETE' }),
      { ...options, id: 'batch-1' }
    );

    assert.equal(statusResponse.status, 200);
    assert.equal(recordDeleteResponse.status, 200);
    assert.equal(batchDeleteResponse.status, 200);
    assert.deepEqual(calls, [
      ['status'],
      ['record', 'record-1'],
      ['batch', 'batch-1']
    ]);
  });

  it('keeps JSON admin Vercel wrappers auth-first before loading repositories', async () => {
    await withAdminKey('secret', async () => {
      let repositoryLoads = 0;
      const getRepository = async () => {
        repositoryLoads += 1;
        return {
          async deleteBatch() {
            return { deletedCount: 1 };
          },
          async deleteRecord() {
            return { deletedCount: 1 };
          },
          async getStatus() {
            return { batchCount: 0, recordCount: 0 };
          },
          async importRecords() {
            return { insertedCount: 0, skippedCount: 0 };
          }
        };
      };
      const routes = [
        {
          request: new Request('https://example.com/api/admin/json-records/status'),
          route: createAdminJsonStatusRoute({ getRepository })
        },
        {
          request: new Request('https://example.com/api/admin/json-records/import', {
            body: JSON.stringify({ files: [] }),
            method: 'POST'
          }),
          route: createAdminJsonImportRoute({ getRepository })
        },
        {
          request: new Request('https://example.com/api/admin/json-records/record-1', {
            method: 'DELETE'
          }),
          route: createAdminJsonRecordDeleteRoute({ getRepository })
        },
        {
          request: new Request('https://example.com/api/admin/json-batches/batch-1', {
            method: 'DELETE'
          }),
          route: createAdminJsonBatchDeleteRoute({ getRepository })
        }
      ];

      const responses = await Promise.all(
        routes.map(({ request, route }) => route.handler.fetch(request))
      );

      assert.deepEqual(responses.map((response) => response.status), [401, 401, 401, 401]);
      assert.equal(repositoryLoads, 0);
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
