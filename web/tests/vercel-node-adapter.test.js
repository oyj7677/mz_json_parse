import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { Readable } from 'node:stream';
import { createNodeCompatibleHandler } from '../api/vercel-node-adapter.js';

describe('Vercel Node compatibility adapter', () => {
  it('keeps fetch-style handlers callable through a default Node handler', async () => {
    const handler = createNodeCompatibleHandler(async (request) => {
      const body = await request.json();
      return new Response(JSON.stringify({
        body,
        method: request.method,
        pathname: new URL(request.url).pathname
      }), {
        headers: { 'Content-Type': 'application/json' },
        status: 201
      });
    });

    const request = Readable.from([JSON.stringify({ ok: true })]);
    request.headers = {
      'content-type': 'application/json',
      host: 'example.com'
    };
    request.method = 'POST';
    request.url = '/api/example';

    const response = {
      body: '',
      headers: {},
      statusCode: 0,
      end(chunk) {
        this.body = Buffer.isBuffer(chunk) ? chunk.toString('utf8') : String(chunk ?? '');
      },
      setHeader(key, value) {
        this.headers[key.toLowerCase()] = value;
      }
    };

    await handler(request, response);

    assert.equal(response.statusCode, 201);
    assert.equal(response.headers['content-type'], 'application/json');
    assert.deepEqual(JSON.parse(response.body), {
      body: { ok: true },
      method: 'POST',
      pathname: '/api/example'
    });

    const fetchResponse = await handler.fetch(new Request('https://example.com/api/example', {
      body: JSON.stringify({ ok: 'fetch' }),
      method: 'POST'
    }));
    assert.equal(fetchResponse.status, 201);
  });
});
