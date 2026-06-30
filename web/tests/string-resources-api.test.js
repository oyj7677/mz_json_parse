import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createAdminStringResourcesImportRoute } from '../api/admin/string-resources/import.js';
import { createStringResourceLocalesRoute } from '../api/string-resource-locales.js';
import { createStringResourceRowsRoute } from '../api/string-resource-rows.js';
import { createStringResourceDetailRoute } from '../api/string-resource-rows/[id].js';
import {
  handleAdminStringResourcesImportRequest,
  handleStringResourceDetailRequest,
  handleStringResourceLocalesRequest,
  handleStringResourceRowsRequest
} from '../api/string-resources-core.js';

const DATASET_ID = '00000000-0000-4000-8000-000000000201';
const ROW_ID = '00000000-0000-4000-8000-000000000301';

describe('string resources API handlers', () => {
  it('serves public string resource rows without an admin key', async () => {
    const repository = {
      async searchRows(options) {
        assert.deepEqual(options, {
          datasetId: DATASET_ID,
          limit: 25,
          offset: 5,
          query: 'weather'
        });
        return {
          rows: [stringResourceRow({ id: ROW_ID, datasetId: DATASET_ID })],
          total: 1
        };
      }
    };

    const response = await handleStringResourceRowsRequest(
      new Request(`https://example.com/api/string-resource-rows?datasetId=${DATASET_ID}&q=weather&limit=25&offset=5`),
      { repository }
    );
    const body = await response.json();

    assert.equal(response.status, 200);
    assert.equal(body.total, 1);
    assert.equal(body.rows[0].resourceId, 'weather_title');
    assert.deepEqual(body.rows[0].languages, { ko: '날씨', 'en-rUS': 'Weather' });
  });

  it('serves public string resource locales without an admin key', async () => {
    const repository = {
      async listLocales(datasetId) {
        assert.equal(datasetId, DATASET_ID);
        return ['ko', 'en-rUS'];
      }
    };

    const response = await handleStringResourceLocalesRequest(
      new Request(`https://example.com/api/string-resource-locales?datasetId=${DATASET_ID}`),
      { repository }
    );
    const body = await response.json();

    assert.equal(response.status, 200);
    assert.deepEqual(body.locales, ['ko', 'en-rUS']);
  });

  it('serves public string resource detail rows without an admin key', async () => {
    const repository = {
      async getRowById(id) {
        assert.equal(id, ROW_ID);
        return stringResourceRow({ id, datasetId: DATASET_ID });
      }
    };

    const response = await handleStringResourceDetailRequest(
      new Request(`https://example.com/api/string-resource-rows/${ROW_ID}`),
      { id: ROW_ID, repository }
    );
    const body = await response.json();

    assert.equal(response.status, 200);
    assert.equal(body.row.id, ROW_ID);
    assert.equal(body.row.resourceId, 'weather_title');
  });

  it('rejects malformed public dataset ids before loading the repository', async () => {
    let repositoryLoads = 0;
    const repository = async () => {
      repositoryLoads += 1;
      return {
        async searchRows() {
          throw new Error('should not search rows');
        },
        async listLocales() {
          throw new Error('should not list locales');
        }
      };
    };

    const rowsResponse = await handleStringResourceRowsRequest(
      new Request('https://example.com/api/string-resource-rows?datasetId=not-a-uuid'),
      { repository }
    );
    const localesResponse = await handleStringResourceLocalesRequest(
      new Request('https://example.com/api/string-resource-locales?datasetId=not-a-uuid'),
      { repository }
    );

    assert.equal(rowsResponse.status, 400);
    assert.equal(localesResponse.status, 400);
    assert.equal(repositoryLoads, 0);
  });

  it('rejects empty detail ids before loading the repository', async () => {
    let repositoryLoads = 0;
    const emptyResponse = await handleStringResourceDetailRequest(
      new Request('https://example.com/api/string-resource-rows/'),
      {
        id: '',
        repository: async () => {
          repositoryLoads += 1;
          return {
            async getRowById() {
              throw new Error('should not load detail');
            }
          };
        }
      }
    );
    const malformedResponse = await handleStringResourceDetailRequest(
      new Request('https://example.com/api/string-resource-rows/not-a-uuid'),
      {
        id: 'not-a-uuid',
        repository: async () => {
          repositoryLoads += 1;
          return {
            async getRowById() {
              throw new Error('should not load malformed detail');
            }
          };
        }
      }
    );

    assert.equal(emptyResponse.status, 400);
    assert.equal(malformedResponse.status, 400);
    assert.equal(repositoryLoads, 0);
  });

  it('authenticates admin import before loading the repository', async () => {
    let repositoryLoads = 0;
    const response = await handleAdminStringResourcesImportRequest(new Request('https://example.com/api/admin/string-resources/import', {
      body: JSON.stringify({ datasetId: DATASET_ID, rows: [stringResourceRow()] }),
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

    const invalidDatasetResponse = await handleAdminStringResourcesImportRequest(new Request('https://example.com/api/admin/string-resources/import', {
      body: JSON.stringify({ datasetId: 'nope', rows: [stringResourceRow()] }),
      headers,
      method: 'POST'
    }), options);
    const emptyRowsResponse = await handleAdminStringResourcesImportRequest(new Request('https://example.com/api/admin/string-resources/import', {
      body: JSON.stringify({ datasetId: DATASET_ID, rows: [] }),
      headers,
      method: 'POST'
    }), options);

    assert.equal(invalidDatasetResponse.status, 400);
    assert.equal(emptyRowsResponse.status, 400);
    assert.equal(repositoryLoads, 0);
  });

  it('imports normalized string resource rows when the admin key is valid', async () => {
    const repository = {
      async importRows(payload) {
        assert.equal(payload.datasetId, DATASET_ID);
        assert.equal(payload.rows.length, 1);
        assert.equal(payload.rows[0].fileName, 'strings.xlsx');
        assert.equal(payload.rows[0].sourceFilename, 'strings.xlsx');
        assert.equal(payload.rows[0].rowNumber, 7);
        assert.equal(payload.rows[0].resourceId, 'weather_title');
        assert.deepEqual(payload.rows[0].languages, { ko: '날씨', 'en-rUS': 'Weather' });
        assert.deepEqual(payload.rows[0].localeValues, { ko: '날씨', 'en-rUS': 'Weather' });
        assert.deepEqual(payload.summary, { source: 'upload' });
        return {
          datasetId: payload.datasetId,
          insertedCount: 1,
          skippedCount: 0
        };
      }
    };

    const response = await handleAdminStringResourcesImportRequest(new Request('https://example.com/api/admin/string-resources/import', {
      body: JSON.stringify({
        datasetId: DATASET_ID,
        rows: [stringResourceRow({ sourceFilename: 'strings.xlsx' })],
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

  it('keeps Vercel wrappers validation-first and auth-first before loading repositories', async () => {
    await withAdminKey('secret', async () => {
      let repositoryLoads = 0;
      const getRepository = async () => {
        repositoryLoads += 1;
        return {
          async getRowById() {
            return undefined;
          },
          async importRows() {
            return { insertedCount: 0, skippedCount: 0 };
          },
          async listLocales() {
            return [];
          },
          async searchRows() {
            return { rows: [], total: 0 };
          }
        };
      };

      const rowsRoute = createStringResourceRowsRoute({ getRepository });
      const localesRoute = createStringResourceLocalesRoute({ getRepository });
      const detailRoute = createStringResourceDetailRoute({ getRepository });
      const importRoute = createAdminStringResourcesImportRoute({ getRepository });

      const rowsResponse = await rowsRoute.handler.fetch(
        new Request('https://example.com/api/string-resource-rows?datasetId=not-a-uuid')
      );
      const localesResponse = await localesRoute.handler.fetch(
        new Request('https://example.com/api/string-resource-locales?datasetId=not-a-uuid')
      );
      const detailResponse = await detailRoute.handler.fetch(
        new Request('https://example.com/api/string-resource-rows/')
      );
      const malformedDetailResponse = await detailRoute.handler.fetch(
        new Request('https://example.com/api/string-resource-rows/not-a-uuid')
      );
      const importResponse = await importRoute.handler.fetch(new Request('https://example.com/api/admin/string-resources/import', {
        body: JSON.stringify({ datasetId: DATASET_ID, rows: [stringResourceRow()] }),
        method: 'POST'
      }));

      assert.equal(rowsResponse.status, 400);
      assert.equal(localesResponse.status, 400);
      assert.equal(detailResponse.status, 400);
      assert.equal(malformedDetailResponse.status, 400);
      assert.equal(importResponse.status, 401);
      assert.equal(repositoryLoads, 0);
    });
  });
});

function stringResourceRow(overrides = {}) {
  return {
    id: 'strings.xlsx:Strings:7',
    fileName: 'strings.xlsx',
    sheetName: 'Strings',
    rowNumber: 7,
    resourceId: 'weather_title',
    idFields: { LID: 'weather_title' },
    languages: { ko: '날씨', 'en-rUS': 'Weather' },
    duplicateLanguages: {},
    metadata: { screen: 'home' },
    originalValues: { LID: 'weather_title', Korean: '날씨' },
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
