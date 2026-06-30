import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  handleAdminBatchDeleteRequest,
  handleAdminImportRequest,
  handleAdminRecordDeleteRequest,
  handleAdminStatusRequest,
  handleJsonRecordDetailRequest,
  handleJsonRecordsRequest
} from '../api/json-records-core.js';

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
        assert.equal(payload.batch.name, 'June logs');
        assert.equal(payload.records.length, 1);
        assert.equal(payload.records[0].recognitionText, 'A');
        return {
          batch: { id: 'batch-1', recordCount: 1 },
          insertedCount: 1,
          skippedCount: 0
        };
      }
    };
    const response = await handleAdminImportRequest(new Request('https://example.com/api/admin/json-records/import', {
      body: JSON.stringify({
        batchName: 'June logs',
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
    assert.equal(body.batch.id, 'batch-1');
    assert.equal(body.insertedCount, 1);
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
});
