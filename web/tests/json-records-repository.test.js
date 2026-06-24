import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  createJsonRecordsRepository,
  resolveDatabaseUrl
} from '../api/json-records-repository.js';

describe('JSON records Neon repository', () => {
  it('resolves DATABASE_URL without exposing it to callers', () => {
    assert.equal(resolveDatabaseUrl({ DATABASE_URL: 'postgres://main' }), 'postgres://main');
    assert.equal(resolveDatabaseUrl({ POSTGRES_URL: 'postgres://fallback' }), 'postgres://fallback');
    assert.equal(resolveDatabaseUrl({}), '');
  });

  it('searches records with parameterized SQL', async () => {
    const calls = [];
    const sql = {
      async query(text, params) {
        calls.push({ params, text });
        return [{
          id: 'record-1',
          source_filename: 'weather.json',
          recognition_text: 'Weather',
          total_count: '1'
        }];
      }
    };
    const repository = createJsonRecordsRepository(sql);
    const result = await repository.searchRecords({ limit: 10, offset: 5, query: 'weather' });

    assert.equal(result.total, 1);
    assert.equal(result.records[0].id, 'record-1');
    assert.match(calls[0].text, /from json_records/);
    assert.deepEqual(calls[0].params, ['weather', '%weather%', 10, 5]);
  });

  it('imports records into a batch and skips duplicate hashes', async () => {
    const calls = [];
    const sql = {
      async query(text, params = []) {
        calls.push({ params, text });
        if (text.includes('insert into json_import_batches')) {
          return [{ id: 'batch-1', name: params[0], record_count: 0 }];
        }
        if (text.includes('insert into json_records')) {
          return params[9] === 'duplicate-hash'
            ? []
            : [{ id: 'record-1' }];
        }
        if (text.includes('update json_import_batches')) {
          return [{ id: 'batch-1', record_count: params[0] }];
        }
        return [];
      }
    };
    const repository = createJsonRecordsRepository(sql);
    const result = await repository.importRecords({
      batch: { description: '', name: 'June logs', sourceType: 'admin_upload' },
      records: [
        {
          contentHash: 'new-hash',
          contentType: 'Weather',
          language: 'en_AU',
          rawJson: { recognitionText: 'Weather' },
          rawText: '',
          recognitionText: 'Weather',
          slotSummary: '',
          sourceFilename: 'weather.json',
          tableVersion: '3.3.21',
          valueKind: 'json'
        },
        {
          contentHash: 'duplicate-hash',
          contentType: '',
          language: '',
          rawJson: null,
          rawText: 'raw',
          recognitionText: 'Raw',
          slotSummary: '',
          sourceFilename: 'raw.json',
          tableVersion: '',
          valueKind: 'raw-string'
        }
      ]
    });

    assert.equal(result.batch.id, 'batch-1');
    assert.equal(result.insertedCount, 1);
    assert.equal(result.skippedCount, 1);
    assert.equal(calls.filter((call) => call.text.includes('insert into json_records')).length, 2);
  });
});
