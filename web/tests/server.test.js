import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  POST,
  default as translateFilenameApi,
  buildGoogleTranslateUrl,
  extractGoogleTranslateText,
  translateFilenameText
} from '../api/translate-filename.js';

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

  it('rejects non-POST Vercel requests', async () => {
    const response = await translateFilenameApi.fetch(
      new Request('https://example.com/api/translate-filename', { method: 'GET' })
    );
    const body = await response.json();

    assert.equal(response.status, 405);
    assert.equal(body.error, 'Method not allowed.');
  });
});
