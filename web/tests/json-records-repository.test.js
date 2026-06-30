import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  createJsonRecordsRepository,
  resolveDatabaseUrl
} from '../server-api/json-records-repository.js';

const JSON_DATASET_ID = '00000000-0000-4000-8000-000000000001';
const SECOND_JSON_DATASET_ID = '00000000-0000-4000-8000-000000000002';

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
    assert.deepEqual(calls[0].params, ['', '', 'weather', '%weather%', 10, 5]);
  });

  it('imports records into a dataset country and skips duplicate hashes', async () => {
    const { calls, sql } = createTransactionSql((text, params = []) => {
      if (text.includes('with live_dataset')) {
        const importRecords = JSON.parse(params[1]);
        assert.equal(importRecords.length, 2);
        assert.deepEqual(importRecords.map((record) => record.content_hash), ['new-hash', 'duplicate-hash']);
        return [{
          dataset_found: true,
          inserted_count: 1,
          skipped_count: 1,
          record_count: 7
        }];
      }
      return [];
    });
    const repository = createJsonRecordsRepository(sql);
    const result = await repository.importRecords({
      countryRegion: 'AU',
      datasetId: JSON_DATASET_ID,
      records: [
        createRecord({
          contentHash: 'new-hash',
          rawJson: { recognitionText: 'Weather' }
        }),
        createRecord({
          contentHash: 'duplicate-hash',
          contentType: '',
          language: '',
          rawJson: null,
          rawText: 'raw',
          recognitionText: 'Raw',
          sourceFilename: 'raw.json',
          tableVersion: '',
          valueKind: 'raw-string'
        })
      ]
    });

    assert.equal(result.datasetId, JSON_DATASET_ID);
    assert.equal(result.countryRegion, 'AU');
    assert.equal(result.insertedCount, 1);
    assert.equal(result.skippedCount, 1);
    assert.equal(calls.some((call) => call.text?.includes('json_import_batches')), false);
    assert.equal(calls.filter((call) => call.text?.includes('insert into json_records')).length, 1);
    assert.equal(calls[0].type, 'transaction');
  });

  it('imports JSON records with dataset and country columns', async () => {
    const { calls, sql } = createTransactionSql((text, params = []) => {
      if (text.includes('with live_dataset')) {
        return [{
          dataset_found: true,
          inserted_count: 1,
          skipped_count: 0,
          record_count: 1
        }];
      }
      return [];
    });
    const repository = createJsonRecordsRepository(sql);
    const result = await repository.importRecords({
      countryRegion: 'AU',
      datasetId: JSON_DATASET_ID,
      records: [createRecord({
        contentHash: 'new-hash',
        rawJson: { recognitionText: 'Weather' }
      })]
    });
    const insertCall = calls.find((call) => call.text?.includes('insert into json_records'));
    const [datasetId, recordsJson] = insertCall.params;
    const importRecords = JSON.parse(recordsJson);

    assert.equal(result.insertedCount, 1);
    assert.equal(datasetId, JSON_DATASET_ID);
    assert.equal(importRecords[0].country_region, 'AU');
  });

  it('rejects imports without a transaction-capable SQL client', async () => {
    const repository = createJsonRecordsRepository({
      async query() {
        throw new Error('importRecords should not call query without a transaction');
      }
    });

    await assert.rejects(
      () => repository.importRecords({
        countryRegion: 'AU',
        datasetId: JSON_DATASET_ID,
        records: [createRecord()]
      }),
      /importRecords requires a transaction-capable SQL client/
    );
  });

  it('validates a live JSON dataset before import inserts', async () => {
    const { calls, sql } = createTransactionSql((text) => {
      if (text.includes('with live_dataset')) {
        return [{
          dataset_found: false,
          inserted_count: 0,
          skipped_count: 1,
          record_count: 0
        }];
      }
      return [];
    });
    const repository = createJsonRecordsRepository(sql);

    await assert.rejects(
      () => repository.importRecords({
        countryRegion: 'AU',
        datasetId: JSON_DATASET_ID,
        records: [createRecord()]
      }),
      (error) => error?.status === 404 && error.message === 'JSON dataset not found.'
    );

    const queries = calls.filter((call) => call.type === 'query');
    const importQuery = queries[0];
    assert.match(importQuery.text, /from datasets/);
    assert.match(importQuery.text, /tool_type = 'json'/);
    assert.match(importQuery.text, /is_active = true/);
    assert.match(importQuery.text, /deleted_at is null/);
    assert.match(importQuery.text, /insert into json_records/);
    assert.match(importQuery.text, /from live_dataset\s+cross join input_records/);
    assert.ok(
      importQuery.text.indexOf('live_dataset as') < importQuery.text.indexOf('inserted_records as'),
      'dataset validation should be declared before insert queries'
    );
  });

  it('uses transaction-shaped import queries and updates dataset counts inside the transaction', async () => {
    const { calls, sql } = createTransactionSql((text, params = []) => {
      if (text.includes('with live_dataset')) {
        assert.equal(params[0], JSON_DATASET_ID);
        assert.equal(JSON.parse(params[1]).length, 1);
        return [{
          dataset_found: true,
          inserted_count: 1,
          skipped_count: 0,
          record_count: 3
        }];
      }
      return [];
    });
    const repository = createJsonRecordsRepository(sql);

    await repository.importRecords({
      countryRegion: 'AU',
      datasetId: JSON_DATASET_ID,
      records: [createRecord()]
    });

    const queries = calls.filter((call) => call.type === 'query');
    assert.equal(calls[0].type, 'transaction');
    assert.equal(queries.length, 1);
    assert.match(queries[0].text, /from datasets/);
    assert.match(queries[0].text, /insert into json_records/);
    assert.match(queries[0].text, /select count\(\*\)::int as count/);
    assert.match(queries[0].text, /update datasets/);
    assert.match(queries[0].text, /is_active = true/);
    assert.match(queries[0].text, /record_count =/);
  });

  it('filters JSON search by dataset and country', async () => {
    const calls = [];
    const sql = {
      async query(text, params = []) {
        calls.push({ params, text });
        return [{
          id: 'record-1',
          country_region: 'AU',
          dataset_id: JSON_DATASET_ID,
          source_filename: 'weather.json',
          recognition_text: 'Weather',
          total_count: '1'
        }];
      }
    };
    const repository = createJsonRecordsRepository(sql);
    const result = await repository.searchRecords({
      countryRegion: 'AU',
      datasetId: JSON_DATASET_ID,
      limit: 10,
      offset: 5,
      query: 'weather'
    });

    assert.equal(result.total, 1);
    assert.match(calls[0].text, /dataset_id = \$1::uuid/);
    assert.match(calls[0].text, /country_region = \$2/);
    assert.deepEqual(calls[0].params, [JSON_DATASET_ID, 'AU', 'weather', '%weather%', 10, 5]);
  });

  it('lists countries for a dataset', async () => {
    const calls = [];
    const sql = {
      async query(text, params = []) {
        calls.push({ params, text });
        return [
          { country_region: 'AU', count: '2' },
          { country_region: 'US', count: 1 }
        ];
      }
    };
    const repository = createJsonRecordsRepository(sql);
    const countries = await repository.listCountries(JSON_DATASET_ID);

    assert.match(calls[0].text, /from json_records/);
    assert.deepEqual(calls[0].params, [JSON_DATASET_ID]);
    assert.deepEqual(countries, [
      { countryRegion: 'AU', count: 2 },
      { countryRegion: 'US', count: 1 }
    ]);
  });

  it('recomputes the affected dataset count after deleting one record', async () => {
    const calls = [];
    const sql = {
      async query(text, params = []) {
        calls.push({ params, text });
        if (text.includes('update json_records')) {
          return [{ id: 'record-1', dataset_id: JSON_DATASET_ID }];
        }
        if (text.includes('select count(*)::int as count')) {
          return [{ count: '4' }];
        }
        if (text.includes('update datasets')) {
          return [{ id: params[0], record_count: params[1] }];
        }
        return [];
      }
    };
    const repository = createJsonRecordsRepository(sql);
    const result = await repository.deleteRecord('record-1');

    const deleteCall = calls.find((call) => call.text.includes('update json_records'));
    const updateCall = calls.find((call) => call.text.includes('update datasets'));

    assert.equal(result.deletedCount, 1);
    assert.match(deleteCall.text, /returning id, dataset_id/);
    assert.deepEqual(updateCall.params, [JSON_DATASET_ID, 4]);
    assert.match(updateCall.text, /tool_type = 'json'/);
    assert.doesNotMatch(updateCall.text, /is_active = true/);
  });

  it('recomputes affected dataset counts after deleting a batch', async () => {
    const calls = [];
    const sql = {
      async query(text, params = []) {
        calls.push({ params, text });
        if (text.includes('update json_records')) {
          return [
            { id: 'record-1', dataset_id: JSON_DATASET_ID },
            { id: 'record-2', dataset_id: JSON_DATASET_ID },
            { id: 'record-3', dataset_id: SECOND_JSON_DATASET_ID },
            { id: 'record-4', dataset_id: null }
          ];
        }
        if (text.includes('select count(*)::int as count')) {
          return [{ count: params[0] === JSON_DATASET_ID ? '2' : '5' }];
        }
        if (text.includes('update datasets')) {
          return [{ id: params[0], record_count: params[1] }];
        }
        return [];
      }
    };
    const repository = createJsonRecordsRepository(sql);
    const result = await repository.deleteBatch('batch-1');

    const batchDeleteCall = calls.find((call) => call.text.includes('update json_import_batches'));
    const updateCalls = calls.filter((call) => call.text.includes('update datasets'));

    assert.equal(result.deletedCount, 4);
    assert.ok(batchDeleteCall);
    assert.deepEqual(updateCalls.map((call) => call.params), [
      [JSON_DATASET_ID, 2],
      [SECOND_JSON_DATASET_ID, 5]
    ]);
    for (const updateCall of updateCalls) {
      assert.match(updateCall.text, /tool_type = 'json'/);
      assert.doesNotMatch(updateCall.text, /is_active = true/);
    }
  });
});

function createRecord(overrides = {}) {
  return {
    contentHash: 'new-hash',
    contentType: 'Weather',
    countryRegion: 'AU',
    language: 'en_AU',
    rawJson: { recognitionText: 'Weather' },
    rawText: '',
    recognitionText: 'Weather',
    slotSummary: '',
    sourceFilename: 'weather.json',
    tableVersion: '3.3.21',
    valueKind: 'json',
    ...overrides
  };
}

function createTransactionSql(handler) {
  const calls = [];
  const sql = {
    async query() {
      throw new Error('importRecords should use sql.transaction');
    },
    async transaction(callback) {
      calls.push({ type: 'transaction' });
      const tx = {
        query(text, params = []) {
          const query = { params, text, type: 'query' };
          calls.push(query);
          return query;
        }
      };
      const queries = callback(tx);
      return queries.map((query) => handler(query.text, query.params));
    }
  };

  return { calls, sql };
}
