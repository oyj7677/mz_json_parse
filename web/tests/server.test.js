import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  POST,
  default as translateFilenameApi,
  buildGoogleTranslateUrl,
  extractGoogleTranslateText,
  translateFilenameText
} from '../api/translate-filename.js';
import { createAppServer } from '../server.js';

const JSON_DATASET_ID = '00000000-0000-4000-8000-000000000001';
const MAPPING_DATASET_ID = '00000000-0000-4000-8000-000000000101';
const STRING_RESOURCE_DATASET_ID = '00000000-0000-4000-8000-000000000201';
const STRING_RESOURCE_ROW_ID = '00000000-0000-4000-8000-000000000301';

describe('translation server helpers', () => {
  it('builds a keyless Google Translate URL for English filename translation', () => {
    const url = buildGoogleTranslateUrl('안녕하세요 세계');

    assert.equal(url.origin, 'https://translate.googleapis.com');
    assert.equal(url.searchParams.get('client'), 'gtx');
    assert.equal(url.searchParams.get('sl'), 'auto');
    assert.equal(url.searchParams.get('tl'), 'en');
    assert.equal(url.searchParams.get('q'), '안녕하세요 세계');
  });

  it('extracts translated text from Google Translate response segments', () => {
    const responseJson = [
      [
        ['Hello ', '안녕하세요 ', null, null, 1],
        ['World', '세계', null, null, 1]
      ]
    ];

    assert.equal(extractGoogleTranslateText(responseJson), 'Hello World');
  });

  it('does not call the network for empty text', async () => {
    let calls = 0;
    const result = await translateFilenameText('   ', {
      fetchImpl: async () => {
        calls += 1;
        return { ok: true };
      }
    });

    assert.equal(calls, 0);
    assert.equal(result.ok, false);
    assert.equal(result.status, 400);
  });

  it('calls Google Translate without API keys', async () => {
    let requestUrl;
    const result = await translateFilenameText('안녕하세요 세계', {
      fetchImpl: async (url) => {
        requestUrl = new URL(url);
        return {
          ok: true,
          status: 200,
          json: async () => ([[['Hello World', '안녕하세요 세계', null, null, 1]]])
        };
      }
    });

    assert.equal(result.ok, true);
    assert.equal(result.translatedText, 'Hello World');
    assert.equal(requestUrl.searchParams.get('q'), '안녕하세요 세계');
    assert.equal(requestUrl.searchParams.get('tl'), 'en');
  });

  it('handles Vercel POST requests', async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = async () => ({
      json: async () => ([[['Hello World', 'Hola Mundo', null, null, 1]]]),
      ok: true,
      status: 200
    });

    try {
      const response = await POST(new Request('https://example.com/api/translate-filename', {
        body: JSON.stringify({ text: 'Hola Mundo' }),
        headers: { 'Content-Type': 'application/json' },
        method: 'POST'
      }));
      const body = await response.json();

      assert.equal(response.status, 200);
      assert.equal(body.translatedText, 'Hello World');
    } finally {
      globalThis.fetch = originalFetch;
    }
  });


  it('serves the app shell for tool-specific local paths', async () => {
    const server = createAppServer();
    await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));

    try {
      const { port } = server.address();
      const response = await fetch(`http://127.0.0.1:${port}/explorer`);
      const body = await response.text();

      assert.equal(response.status, 200);
      assert.match(body, /id="explorerApp"/);
      assert.match(body, /id="toolHub"/);
    } finally {
      await new Promise((resolve, reject) => {
        server.close((error) => {
          if (error) {
            reject(error);
            return;
          }

          resolve();
        });
      });
    }
  });

  it('serves local JSON records API routes with injected repository dependencies', async () => {
    const repository = {
      async importRecords(payload) {
        assert.equal(payload.datasetId, JSON_DATASET_ID);
        assert.equal(payload.countryRegion, 'AU');
        assert.equal(payload.records.length, 1);
        assert.equal(payload.records[0].countryRegion, 'AU');
        return {
          countryRegion: payload.countryRegion,
          datasetId: payload.datasetId,
          insertedCount: 1,
          skippedCount: 0
        };
      },
      async searchRecords({ query }) {
        assert.equal(query, 'weather');
        return {
          records: [{
            id: 'record-1',
            source_filename: 'weather.json',
            recognition_text: 'Weather'
          }],
          total: 1
        };
      },
      async listCountries(datasetId) {
        assert.equal(datasetId, JSON_DATASET_ID);
        return [{ countryRegion: 'AU', count: 1 }];
      }
    };
    const server = createAppServer({
      env: { JSON_ADMIN_KEY: 'secret' },
      jsonRecordsRepository: repository
    });
    await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));

    try {
      const { port } = server.address();
      const searchResponse = await fetch(`http://127.0.0.1:${port}/api/json-records?q=weather`);
      const searchBody = await searchResponse.json();

      const importResponse = await fetch(`http://127.0.0.1:${port}/api/admin/json-records/import`, {
        body: JSON.stringify({
          countryRegion: 'AU',
          datasetId: JSON_DATASET_ID,
          files: [{ filename: 'weather.json', text: '{"recognitionText":"Weather"}' }]
        }),
        headers: { 'x-admin-key': 'secret' },
        method: 'POST'
      });
      const importBody = await importResponse.json();
      const countriesResponse = await fetch(`http://127.0.0.1:${port}/api/json-countries?datasetId=${JSON_DATASET_ID}`);
      const countriesBody = await countriesResponse.json();

      assert.equal(searchResponse.status, 200);
      assert.equal(searchBody.records[0].recognitionText, 'Weather');
      assert.equal(importResponse.status, 200);
      assert.equal(importBody.insertedCount, 1);
      assert.equal(countriesResponse.status, 200);
      assert.deepEqual(countriesBody.countries, [{ countryRegion: 'AU', count: 1 }]);
    } finally {
      await new Promise((resolve, reject) => {
        server.close((error) => {
          if (error) {
            reject(error);
            return;
          }

          resolve();
        });
      });
    }
  });

  it('serves local mapping table API routes with injected repository dependencies', async () => {
    const repository = {
      async importRows(payload) {
        assert.equal(payload.datasetId, MAPPING_DATASET_ID);
        assert.equal(payload.rows.length, 1);
        assert.equal(payload.rows[0].domainText, 'Weather');
        return {
          datasetId: payload.datasetId,
          insertedCount: 1,
          skippedCount: 0
        };
      },
      async listRows(datasetId, { query }) {
        assert.equal(datasetId, MAPPING_DATASET_ID);
        assert.equal(query, 'weather');
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
    const server = createAppServer({
      env: { JSON_ADMIN_KEY: 'secret' },
      mappingTableRepository: repository
    });
    await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));

    try {
      const { port } = server.address();
      const searchResponse = await fetch(`http://127.0.0.1:${port}/api/mapping-rows?datasetId=${MAPPING_DATASET_ID}&q=weather`);
      const searchBody = await searchResponse.json();

      const importResponse = await fetch(`http://127.0.0.1:${port}/api/admin/mapping-table/import`, {
        body: JSON.stringify({
          datasetId: MAPPING_DATASET_ID,
          rows: [{
            sourceFilename: 'mapping.xlsx',
            sheetName: 'Sheet1',
            rowNumber: 7,
            domainText: 'Weather',
            values: { A: 'Weather' }
          }]
        }),
        headers: { 'x-admin-key': 'secret' },
        method: 'POST'
      });
      const importBody = await importResponse.json();

      assert.equal(searchResponse.status, 200);
      assert.equal(searchBody.rows[0].domainText, 'Weather');
      assert.equal(importResponse.status, 200);
      assert.equal(importBody.insertedCount, 1);
    } finally {
      await new Promise((resolve, reject) => {
        server.close((error) => {
          if (error) {
            reject(error);
            return;
          }

          resolve();
        });
      });
    }
  });

  it('serves local string resource API routes with injected repository dependencies', async () => {
    const repository = {
      async importRows(payload) {
        assert.equal(payload.datasetId, STRING_RESOURCE_DATASET_ID);
        assert.equal(payload.rows.length, 1);
        assert.equal(payload.rows[0].resourceId, 'weather_title');
        return {
          datasetId: payload.datasetId,
          insertedCount: 1,
          skippedCount: 0
        };
      },
      async searchRows({ datasetId, query }) {
        assert.equal(datasetId, STRING_RESOURCE_DATASET_ID);
        assert.equal(query, 'weather');
        return {
          rows: [stringResourceRow({ id: STRING_RESOURCE_ROW_ID, datasetId })],
          total: 1
        };
      },
      async listLocales(datasetId) {
        assert.equal(datasetId, STRING_RESOURCE_DATASET_ID);
        return ['ko', 'en-rUS'];
      },
      async getRowById(id) {
        assert.equal(id, STRING_RESOURCE_ROW_ID);
        return stringResourceRow({ id, datasetId: STRING_RESOURCE_DATASET_ID });
      }
    };
    const server = createAppServer({
      env: { JSON_ADMIN_KEY: 'secret' },
      stringResourcesRepository: repository
    });
    await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));

    try {
      const { port } = server.address();
      const baseUrl = `http://127.0.0.1:${port}`;
      const searchResponse = await fetch(`${baseUrl}/api/string-resource-rows?datasetId=${STRING_RESOURCE_DATASET_ID}&q=weather`);
      const searchBody = await searchResponse.json();

      const localesResponse = await fetch(`${baseUrl}/api/string-resource-locales?datasetId=${STRING_RESOURCE_DATASET_ID}`);
      const localesBody = await localesResponse.json();

      const detailResponse = await fetch(`${baseUrl}/api/string-resource-rows/${STRING_RESOURCE_ROW_ID}`);
      const detailBody = await detailResponse.json();

      const importResponse = await fetch(`${baseUrl}/api/admin/string-resources/import`, {
        body: JSON.stringify({
          datasetId: STRING_RESOURCE_DATASET_ID,
          rows: [stringResourceRow()]
        }),
        headers: { 'x-admin-key': 'secret' },
        method: 'POST'
      });
      const importBody = await importResponse.json();

      assert.equal(searchResponse.status, 200);
      assert.equal(searchBody.rows[0].resourceId, 'weather_title');
      assert.equal(localesResponse.status, 200);
      assert.deepEqual(localesBody.locales, ['ko', 'en-rUS']);
      assert.equal(detailResponse.status, 200);
      assert.equal(detailBody.row.id, STRING_RESOURCE_ROW_ID);
      assert.equal(importResponse.status, 200);
      assert.equal(importBody.insertedCount, 1);
    } finally {
      await new Promise((resolve, reject) => {
        server.close((error) => {
          if (error) {
            reject(error);
            return;
          }

          resolve();
        });
      });
    }
  });

  it('keeps local JSON admin routes auth-first before loading repository dependencies', async () => {
    let repositoryLoads = 0;
    const server = createAppServer({
      env: { JSON_ADMIN_KEY: 'secret' },
      jsonRecordsRepository: async () => {
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
      }
    });
    await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));

    try {
      const { port } = server.address();
      const baseUrl = `http://127.0.0.1:${port}`;
      const responses = await Promise.all([
        fetch(`${baseUrl}/api/admin/json-records/status`),
        fetch(`${baseUrl}/api/admin/json-records/import`, {
          body: JSON.stringify({ files: [] }),
          method: 'POST'
        }),
        fetch(`${baseUrl}/api/admin/json-records/record-1`, { method: 'DELETE' }),
        fetch(`${baseUrl}/api/admin/json-batches/batch-1`, { method: 'DELETE' })
      ]);

      assert.deepEqual(responses.map((response) => response.status), [401, 401, 401, 401]);
      assert.equal(repositoryLoads, 0);

      const authorizedResponse = await fetch(`${baseUrl}/api/admin/json-records/status`, {
        headers: { 'x-admin-key': 'secret' }
      });
      const authorizedBody = await authorizedResponse.json();

      assert.equal(authorizedResponse.status, 200);
      assert.equal(authorizedBody.status.recordCount, 0);
      assert.equal(repositoryLoads, 1);
    } finally {
      await new Promise((resolve, reject) => {
        server.close((error) => {
          if (error) {
            reject(error);
            return;
          }

          resolve();
        });
      });
    }
  });

  it('serves local dataset API routes with injected repository dependencies', async () => {
    const calls = [];
    const repository = {
      async listDatasets(toolType) {
        calls.push(['list', toolType]);
        return [{
          id: 'dataset-1',
          name: 'JSON uploads',
          toolType
        }];
      },
      async createDataset(payload) {
        calls.push(['create', payload]);
        return {
          id: 'dataset-created',
          ...payload
        };
      },
      async deleteDataset(id) {
        calls.push(['delete', id]);
        return { deletedCount: 1 };
      },
      async setActiveDataset(id) {
        calls.push(['active', id]);
        return {
          id,
          isActive: true,
          name: 'JSON uploads',
          toolType: 'json'
        };
      }
    };
    const server = createAppServer({
      datasetsRepository: repository,
      env: { JSON_ADMIN_KEY: 'secret' }
    });
    await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));

    try {
      const { port } = server.address();
      const listResponse = await fetch(`http://127.0.0.1:${port}/api/datasets?tool=json`);
      const listBody = await listResponse.json();

      const createResponse = await fetch(`http://127.0.0.1:${port}/api/admin/datasets`, {
        body: JSON.stringify({
          description: ' Local JSON uploads ',
          metadata: { source: 'server-test' },
          name: ' Local JSON ',
          toolType: 'json'
        }),
        headers: { 'x-admin-key': 'secret' },
        method: 'POST'
      });
      const createBody = await createResponse.json();

      const activeResponse = await fetch(`http://127.0.0.1:${port}/api/admin/datasets/dataset%20active%2042/active`, {
        headers: { 'x-admin-key': 'secret' },
        method: 'PATCH'
      });
      const activeBody = await activeResponse.json();

      const deleteResponse = await fetch(`http://127.0.0.1:${port}/api/admin/datasets/dataset%20delete%2042`, {
        headers: { 'x-admin-key': 'secret' },
        method: 'DELETE'
      });
      const deleteBody = await deleteResponse.json();

      assert.equal(listResponse.status, 200);
      assert.equal(listBody.datasets[0].toolType, 'json');
      assert.equal(createResponse.status, 200);
      assert.equal(createBody.dataset.id, 'dataset-created');
      assert.equal(createBody.dataset.name, 'Local JSON');
      assert.equal(activeResponse.status, 200);
      assert.equal(activeBody.dataset.id, 'dataset active 42');
      assert.equal(deleteResponse.status, 200);
      assert.equal(deleteBody.deletedCount, 1);
      assert.deepEqual(calls, [
        ['list', 'json'],
        ['create', {
          description: 'Local JSON uploads',
          metadata: { source: 'server-test' },
          name: 'Local JSON',
          toolType: 'json'
        }],
        ['active', 'dataset active 42'],
        ['delete', 'dataset delete 42']
      ]);
    } finally {
      await new Promise((resolve, reject) => {
        server.close((error) => {
          if (error) {
            reject(error);
            return;
          }

          resolve();
        });
      });
    }
  });

  it('rejects non-POST Vercel requests', async () => {
    const response = await translateFilenameApi.fetch(
      new Request('https://example.com/api/translate-filename', { method: 'GET' })
    );
    const body = await response.json();

    assert.equal(response.status, 405);
    assert.equal(body.error, 'Method not allowed.');
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
