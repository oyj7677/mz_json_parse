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
    assert.deepEqual(calls[0].params, ['', '', 'weather', '%weather%', 10, 5]);
  });

  it('imports records into a dataset country and skips duplicate hashes', async () => {
    const calls = [];
    const sql = {
      async query(text, params = []) {
        calls.push({ params, text });
        if (text.includes('insert into json_records')) {
          return params[10] === 'duplicate-hash'
            ? []
            : [{ id: 'record-1' }];
        }
        if (text.includes('update datasets')) {
          return [{ id: params[2], record_count: params[0], error_count: params[1] }];
        }
        return [];
      }
    };
    const repository = createJsonRecordsRepository(sql);
    const result = await repository.importRecords({
      countryRegion: 'AU',
      datasetId: 'dataset-1',
      records: [
        {
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
          valueKind: 'json'
        },
        {
          contentHash: 'duplicate-hash',
          contentType: '',
          countryRegion: 'AU',
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

    assert.equal(result.datasetId, 'dataset-1');
    assert.equal(result.countryRegion, 'AU');
    assert.equal(result.insertedCount, 1);
    assert.equal(result.skippedCount, 1);
    assert.equal(calls.some((call) => call.text.includes('json_import_batches')), false);
    assert.equal(calls.filter((call) => call.text.includes('insert into json_records')).length, 2);
  });

  it('imports JSON records with dataset and country columns', async () => {
    const calls = [];
    const sql = {
      async query(text, params = []) {
        calls.push({ params, text });
        if (text.includes('insert into json_records')) {
          return [{ id: 'record-1' }];
        }
        if (text.includes('update datasets')) {
          return [{ id: params[2], record_count: params[0], error_count: params[1] }];
        }
        return [];
      }
    };
    const repository = createJsonRecordsRepository(sql);
    const result = await repository.importRecords({
      countryRegion: 'AU',
      datasetId: 'dataset-1',
      records: [{
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
        valueKind: 'json'
      }]
    });
    const insertCall = calls.find((call) => call.text.includes('insert into json_records'));

    assert.equal(result.insertedCount, 1);
    assert.deepEqual(insertCall.params.slice(0, 2), ['dataset-1', 'AU']);
  });

  it('filters JSON search by dataset and country', async () => {
    const calls = [];
    const sql = {
      async query(text, params = []) {
        calls.push({ params, text });
        return [{
          id: 'record-1',
          country_region: 'AU',
          dataset_id: 'dataset-1',
          source_filename: 'weather.json',
          recognition_text: 'Weather',
          total_count: '1'
        }];
      }
    };
    const repository = createJsonRecordsRepository(sql);
    const result = await repository.searchRecords({
      countryRegion: 'AU',
      datasetId: 'dataset-1',
      limit: 10,
      offset: 5,
      query: 'weather'
    });

    assert.equal(result.total, 1);
    assert.match(calls[0].text, /dataset_id = \$1::uuid/);
    assert.match(calls[0].text, /country_region = \$2/);
    assert.deepEqual(calls[0].params, ['dataset-1', 'AU', 'weather', '%weather%', 10, 5]);
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
    const countries = await repository.listCountries('dataset-1');

    assert.match(calls[0].text, /from json_records/);
    assert.deepEqual(calls[0].params, ['dataset-1']);
    assert.deepEqual(countries, [
      { countryRegion: 'AU', count: 2 },
      { countryRegion: 'US', count: 1 }
    ]);
  });
});
