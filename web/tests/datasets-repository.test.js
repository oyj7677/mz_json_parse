import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
  createDatasetsRepository,
  resolveDatabaseUrl
} from '../server-api/datasets-repository.js';

describe('datasets repository', () => {
  it('resolves database url from supported env vars', () => {
    assert.equal(resolveDatabaseUrl({ DATABASE_URL: 'postgres://main' }), 'postgres://main');
    assert.equal(resolveDatabaseUrl({ POSTGRES_URL: 'postgres://fallback' }), 'postgres://fallback');
    assert.equal(resolveDatabaseUrl({}), '');
  });

  it('creates datasets with parameterized SQL', async () => {
    const calls = [];
    const sql = {
      async query(text, params = []) {
        calls.push({ text, params });
        return [{
          id: 'dataset-1',
          tool_type: params[0],
          name: params[1],
          description: params[2],
          is_active: false,
          record_count: 0,
          error_count: 0,
          metadata: {},
          created_at: '2026-06-30T00:00:00.000Z'
        }];
      }
    };
    const repository = createDatasetsRepository(sql);
    const dataset = await repository.createDataset({
      description: 'June JSON logs',
      name: '2026-06-30 logs',
      toolType: 'json'
    });

    assert.equal(dataset.id, 'dataset-1');
    assert.equal(dataset.toolType, 'json');
    assert.match(calls[0].text, /insert into datasets/);
    assert.deepEqual(calls[0].params, ['json', '2026-06-30 logs', 'June JSON logs', 'admin_upload', '{}']);
  });

  it('sets one active dataset per tool in a transaction', async () => {
    const calls = [];
    const sql = {
      async query() {
        throw new Error('setActiveDataset should use a transaction when available');
      },
      async transaction(callback) {
        calls.push({ type: 'transaction' });
        const tx = {
          query(text, params = []) {
            calls.push({ text, params });
            if (text.includes('select tool_type')) {
              return Promise.resolve([{ tool_type: 'json' }]);
            }
            if (text.includes('update datasets') && text.includes('is_active = false')) {
              return Promise.resolve([]);
            }
            if (text.includes('update datasets') && text.includes('is_active = true')) {
              return Promise.resolve([{
                id: params[0],
                tool_type: 'json',
                name: 'Active JSON',
                description: '',
                is_active: true,
                record_count: 12,
                error_count: 0,
                metadata: {},
                created_at: '2026-06-30T00:00:00.000Z'
              }]);
            }
            return Promise.resolve([]);
          }
        };
        return Promise.all(callback(tx));
      }
    };
    const repository = createDatasetsRepository(sql);
    const dataset = await repository.setActiveDataset('dataset-1');

    assert.equal(dataset.isActive, true);
    assert.equal(calls[0].type, 'transaction');
    assert.match(calls[1].text, /select tool_type/);
    assert.match(calls[2].text, /is_active = false/);
    assert.match(calls[2].text, /select tool_type/);
    assert.match(calls[3].text, /is_active = true/);
    assert.deepEqual(calls.slice(1).map((call) => call.params), [
      ['dataset-1'],
      ['dataset-1'],
      ['dataset-1']
    ]);
  });

  it('returns undefined when activating a missing dataset in a transaction', async () => {
    const calls = [];
    const sql = {
      async transaction(callback) {
        const tx = {
          query(text, params = []) {
            calls.push({ text, params });
            return Promise.resolve([]);
          }
        };
        return Promise.all(callback(tx));
      }
    };
    const repository = createDatasetsRepository(sql);

    assert.equal(await repository.setActiveDataset('missing-dataset'), undefined);
    assert.equal(calls.length, 3);
    assert.match(calls[0].text, /select tool_type/);
    assert.match(calls[1].text, /is_active = false/);
    assert.match(calls[1].text, /where tool_type = \(/);
    assert.match(calls[2].text, /is_active = true/);
  });

  it('rejects active switching without a transaction-capable SQL client', async () => {
    const repository = createDatasetsRepository({
      async query() {
        return [];
      }
    });

    await assert.rejects(
      () => repository.setActiveDataset('dataset-1'),
      /setActiveDataset requires a transaction-capable SQL client/
    );
  });

  it('soft-deletes a dataset and its tool rows with one parameterized query', async () => {
    const calls = [];
    const sql = {
      async query(text, params = []) {
        calls.push({ text, params });
        return [{
          dataset_count: 1,
          json_count: 0,
          mapping_count: 1992,
          string_resource_count: 0
        }];
      }
    };
    const repository = createDatasetsRepository(sql);
    const result = await repository.deleteDataset('dataset-1');

    assert.deepEqual(result, {
      deletedCount: 1,
      rowDeletedCount: 1992
    });
    assert.match(calls[0].text, /with deleted_dataset as/);
    assert.match(calls[0].text, /update datasets/);
    assert.match(calls[0].text, /update json_records/);
    assert.match(calls[0].text, /update mapping_rows/);
    assert.match(calls[0].text, /update string_resource_rows/);
    assert.deepEqual(calls[0].params, ['dataset-1']);
  });

  it('updates dataset counts without overwriting metadata by default', async () => {
    const calls = [];
    const sql = {
      async query(text, params = []) {
        calls.push({ text, params });
        return [{
          id: params[0],
          tool_type: 'json',
          name: 'JSON logs',
          description: '',
          source_type: 'admin_upload',
          is_active: false,
          record_count: params[1],
          error_count: params[2],
          metadata: { owner: 'kept' },
          created_at: '2026-06-30T00:00:00.000Z'
        }];
      }
    };
    const repository = createDatasetsRepository(sql);
    const dataset = await repository.updateDatasetCounts('dataset-1', {
      errorCount: 2,
      recordCount: 14
    });

    assert.equal(dataset.recordCount, 14);
    assert.equal(dataset.errorCount, 2);
    assert.deepEqual(dataset.metadata, { owner: 'kept' });
    assert.doesNotMatch(calls[0].text, /metadata\s*=/);
    assert.deepEqual(calls[0].params, ['dataset-1', 14, 2]);
  });

  it('updates dataset metadata when explicitly supplied', async () => {
    const calls = [];
    const sql = {
      async query(text, params = []) {
        calls.push({ text, params });
        return [{
          id: params[0],
          tool_type: 'json',
          name: 'JSON logs',
          description: '',
          source_type: 'admin_upload',
          is_active: false,
          record_count: params[1],
          error_count: params[2],
          metadata: JSON.parse(params[3]),
          created_at: '2026-06-30T00:00:00.000Z'
        }];
      }
    };
    const repository = createDatasetsRepository(sql);
    const dataset = await repository.updateDatasetCounts('dataset-1', {
      errorCount: 1,
      metadata: { source: 'upload' },
      recordCount: 10
    });

    assert.deepEqual(dataset.metadata, { source: 'upload' });
    assert.match(calls[0].text, /metadata = \$4::jsonb/);
    assert.deepEqual(calls[0].params, ['dataset-1', 10, 1, '{"source":"upload"}']);
  });

  it('scopes active JSON content hash uniqueness by dataset and country', async () => {
    const schema = await readFile(new URL('../db/schema.sql', import.meta.url), 'utf8');
    const createIndexPosition = schema.indexOf('create unique index if not exists json_records_active_dataset_country_content_hash_idx');
    const dropIndexPosition = schema.indexOf('drop index if exists json_records_active_content_hash_idx');

    assert.match(schema, /drop index if exists json_records_active_content_hash_idx/);
    assert.match(schema, /create unique index if not exists json_records_active_dataset_country_content_hash_idx/);
    assert.ok(createIndexPosition >= 0);
    assert.ok(dropIndexPosition > createIndexPosition);
    assert.match(schema, /coalesce\(dataset_id, '00000000-0000-0000-0000-000000000000'::uuid\)/);
    assert.match(schema, /country_region,\s*content_hash/);
  });
});
