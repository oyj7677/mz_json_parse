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
        assert.equal(payload.records.length, 1);
        return {
          batch: { id: 'batch-1', recordCount: 1 },
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
          files: [{ filename: 'weather.json', text: '{"recognitionText":"Weather"}' }]
        }),
        headers: { 'x-admin-key': 'secret' },
        method: 'POST'
      });
      const importBody = await importResponse.json();

      assert.equal(searchResponse.status, 200);
      assert.equal(searchBody.records[0].recognitionText, 'Weather');
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

  it('rejects non-POST Vercel requests', async () => {
    const response = await translateFilenameApi.fetch(
      new Request('https://example.com/api/translate-filename', { method: 'GET' })
    );
    const body = await response.json();

    assert.equal(response.status, 405);
    assert.equal(body.error, 'Method not allowed.');
  });
});
