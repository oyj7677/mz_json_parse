import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  createDatasetsRepository,
  resolveDatabaseUrl
} from '../api/datasets-repository.js';

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

  it('sets one active dataset per tool in a transaction-shaped call sequence', async () => {
    const calls = [];
    const sql = {
      async query(text, params = []) {
        calls.push({ text, params });
        if (text.includes('select tool_type')) {
          return [{ tool_type: 'json' }];
        }
        if (text.includes('update datasets') && text.includes('is_active = false')) {
          return [];
        }
        if (text.includes('update datasets') && text.includes('is_active = true')) {
          return [{
            id: params[0],
            tool_type: 'json',
            name: 'Active JSON',
            description: '',
            is_active: true,
            record_count: 12,
            error_count: 0,
            metadata: {},
            created_at: '2026-06-30T00:00:00.000Z'
          }];
        }
        return [];
      }
    };
    const repository = createDatasetsRepository(sql);
    const dataset = await repository.setActiveDataset('dataset-1');

    assert.equal(dataset.isActive, true);
    assert.match(calls[0].text, /select tool_type/);
    assert.match(calls[1].text, /is_active = false/);
    assert.match(calls[2].text, /is_active = true/);
  });
});
