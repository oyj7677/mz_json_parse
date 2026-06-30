import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createAdminMappingImportRoute } from '../server-api/admin/mapping-table/import.js';
import { createMappingRowsRoute } from '../server-api/mapping-rows.js';
import {
  handleAdminMappingImportRequest,
  handleMappingRowsRequest
} from '../server-api/mapping-table-core.js';

const DATASET_ID = '00000000-0000-4000-8000-000000000101';

describe('mapping table API handlers', () => {
  it('serves public mapping rows without an admin key', async () => {
    const repository = {
      async listRows(datasetId, options) {
        assert.equal(datasetId, DATASET_ID);
        assert.deepEqual(options, { limit: 25, offset: 5, query: 'weather' });
        return {
          rows: [{
            id: 'row-1',
            datasetId,
            sourceFilename: 'mapping.xlsx',
            sheetName: 'Sheet1',
            rowNumber: 7,
            domainText: 'Weather',
            values: { A: 'Weather' }
          }],
          total: 1
        };
      }
    };

    const response = await handleMappingRowsRequest(
      new Request(`https://example.com/api/mapping-rows?datasetId=${DATASET_ID}&q=weather&limit=25&offset=5`),
      { repository }
    );
    const body = await response.json();

    assert.equal(response.status, 200);
    assert.equal(body.total, 1);
    assert.equal(body.rows[0].domainText, 'Weather');
    assert.deepEqual(body.rows[0].values, { A: 'Weather' });
  });

  it('rejects missing and malformed public dataset ids before loading the repository', async () => {
    let repositoryLoads = 0;
    const repository = async () => {
      repositoryLoads += 1;
      return {
        async listRows() {
          throw new Error('should not list rows');
        }
      };
    };

    const missingResponse = await handleMappingRowsRequest(
      new Request('https://example.com/api/mapping-rows'),
      { repository }
    );
    const invalidResponse = await handleMappingRowsRequest(
      new Request('https://example.com/api/mapping-rows?datasetId=not-a-uuid'),
      { repository }
    );

    assert.equal(missingResponse.status, 400);
    assert.equal(invalidResponse.status, 400);
    assert.equal(repositoryLoads, 0);
  });

  it('keeps the public Vercel wrapper validation-first before loading repositories', async () => {
    let repositoryLoads = 0;
    const route = createMappingRowsRoute({
      getRepository: async () => {
        repositoryLoads += 1;
        return {
          async listRows() {
            throw new Error('should not list with invalid datasetId');
          }
        };
      }
    });

    const response = await route.handler.fetch(
      new Request('https://example.com/api/mapping-rows?datasetId=not-a-uuid')
    );

    assert.equal(response.status, 400);
    assert.equal(repositoryLoads, 0);
  });

  it('authenticates admin import before loading the repository', async () => {
    let repositoryLoads = 0;
    const response = await handleAdminMappingImportRequest(new Request('https://example.com/api/admin/mapping-table/import', {
      body: JSON.stringify({ datasetId: DATASET_ID, rows: [mappingRow()] }),
      method: 'POST'
    }), {
      env: { JSON_ADMIN_KEY: 'secret' },
      repository: async () => {
        repositoryLoads += 1;
        return {
          async importRows() {
            throw new Error('should not import without auth');
          }
        };
      }
    });

    assert.equal(response.status, 401);
    assert.equal(repositoryLoads, 0);
  });

  it('rejects invalid admin import payloads before loading the repository after auth', async () => {
    let repositoryLoads = 0;
    const options = {
      env: { JSON_ADMIN_KEY: 'secret' },
      repository: async () => {
        repositoryLoads += 1;
        return {
          async importRows() {
            throw new Error('should not import invalid payload');
          }
        };
      }
    };
    const headers = { 'x-admin-key': 'secret' };

    const invalidDatasetResponse = await handleAdminMappingImportRequest(new Request('https://example.com/api/admin/mapping-table/import', {
      body: JSON.stringify({ datasetId: 'nope', rows: [mappingRow()] }),
      headers,
      method: 'POST'
    }), options);
    const emptyRowsResponse = await handleAdminMappingImportRequest(new Request('https://example.com/api/admin/mapping-table/import', {
      body: JSON.stringify({ datasetId: DATASET_ID, rows: [] }),
      headers,
      method: 'POST'
    }), options);

    assert.equal(invalidDatasetResponse.status, 400);
    assert.equal(emptyRowsResponse.status, 400);
    assert.equal(repositoryLoads, 0);
  });

  it('imports normalized rows when the admin key is valid', async () => {
    const repository = {
      async importRows(payload) {
        assert.equal(payload.datasetId, DATASET_ID);
        assert.equal(payload.rows.length, 1);
        assert.equal(payload.rows[0].sourceFilename, 'mapping.xlsx');
        assert.equal(payload.rows[0].rowNumber, 7);
        assert.equal(payload.rows[0].domainText, 'Weather');
        assert.deepEqual(payload.rows[0].values, { A: 'Weather' });
        assert.deepEqual(payload.summary, { source: 'upload' });
        return {
          datasetId: payload.datasetId,
          insertedCount: 1,
          skippedCount: 0
        };
      }
    };

    const response = await handleAdminMappingImportRequest(new Request('https://example.com/api/admin/mapping-table/import', {
      body: JSON.stringify({
        datasetId: DATASET_ID,
        rows: [mappingRow()],
        summary: { source: 'upload' }
      }),
      headers: { 'x-admin-key': 'secret' },
      method: 'POST'
    }), {
      env: { JSON_ADMIN_KEY: 'secret' },
      repository
    });
    const body = await response.json();

    assert.equal(response.status, 200);
    assert.equal(body.datasetId, DATASET_ID);
    assert.equal(body.insertedCount, 1);
  });

  it('keeps the admin Vercel wrapper auth-first before loading repositories', async () => {
    await withAdminKey('secret', async () => {
      let repositoryLoads = 0;
      const route = createAdminMappingImportRoute({
        getRepository: async () => {
          repositoryLoads += 1;
          return {
            async importRows() {
              return { insertedCount: 0, skippedCount: 0 };
            }
          };
        }
      });

      const response = await route.handler.fetch(new Request('https://example.com/api/admin/mapping-table/import', {
        body: JSON.stringify({ datasetId: DATASET_ID, rows: [mappingRow()] }),
        method: 'POST'
      }));

      assert.equal(response.status, 401);
      assert.equal(repositoryLoads, 0);
    });
  });
});

function mappingRow(overrides = {}) {
  return {
    id: 'row-1',
    sourceFilename: 'mapping.xlsx',
    sheetName: 'Sheet1',
    rowNumber: 7,
    domainText: 'Weather',
    intentionText: 'Forecast',
    mappingIntent: 'weather.forecast',
    slotText: 'city',
    utteranceText: 'weather in Seoul',
    primaryText: 'Weather',
    noteText: 'note',
    values: { A: 'Weather' },
    ...overrides
  };
}

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
