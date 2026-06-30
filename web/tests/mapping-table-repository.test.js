import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  createMappingTableRepository,
  resolveDatabaseUrl
} from '../server-api/mapping-table-repository.js';

const DATASET_ID = '00000000-0000-4000-8000-000000000101';

describe('mapping table repository', () => {
  it('resolves DATABASE_URL with POSTGRES_URL fallback', () => {
    assert.equal(resolveDatabaseUrl({ DATABASE_URL: 'postgres://main' }), 'postgres://main');
    assert.equal(resolveDatabaseUrl({ POSTGRES_URL: 'postgres://fallback' }), 'postgres://fallback');
    assert.equal(resolveDatabaseUrl({}), '');
  });

  it('requires a transaction-capable SQL client for imports', async () => {
    const repository = createMappingTableRepository({
      async query() {
        throw new Error('should not query without transaction');
      }
    });

    await assert.rejects(
      () => repository.importRows({ datasetId: DATASET_ID, rows: [mappingRow()] }),
      /importRows requires a transaction-capable SQL client/
    );
  });

  it('validates an active mapping_table dataset before inserting rows', async () => {
    const { calls, sql } = createTransactionSql((text) => {
      if (text.includes('with live_dataset')) {
        return [{
          dataset_found: false,
          inserted_count: 0,
          skipped_count: 1
        }];
      }
      return [];
    });
    const repository = createMappingTableRepository(sql);

    await assert.rejects(
      () => repository.importRows({ datasetId: DATASET_ID, rows: [mappingRow()] }),
      (error) => error?.status === 404 && error.message === 'Mapping table dataset not found.'
    );

    const importQuery = calls.find((call) => call.type === 'query');
    assert.match(importQuery.text, /from datasets/);
    assert.match(importQuery.text, /tool_type = 'mapping_table'/);
    assert.match(importQuery.text, /is_active = true/);
    assert.match(importQuery.text, /deleted_at is null/);
    assert.ok(
      importQuery.text.indexOf('live_dataset as') < importQuery.text.indexOf('inserted_rows as'),
      'dataset validation should happen before insert'
    );
  });

  it('imports rows with dataset, sheet, row number, and raw values', async () => {
    const { calls, sql } = createTransactionSql((text, params = []) => {
      if (text.includes('with live_dataset')) {
        const importRows = JSON.parse(params[1]);
        assert.equal(params[0], DATASET_ID);
        assert.equal(importRows[0].dataset_id, undefined);
        assert.equal(importRows[0].source_filename, 'mapping.xlsx');
        assert.equal(importRows[0].sheet_name, 'Sheet1');
        assert.equal(importRows[0].row_number, 7);
        assert.equal(importRows[0].domain, 'Weather');
        assert.deepEqual(importRows[0].raw_row.values, { A: 'Weather', B: 'Forecast' });
        assert.deepEqual(JSON.parse(params[2]), { source: 'unit-test' });
        return [{
          dataset_found: true,
          inserted_count: 1,
          skipped_count: 0
        }];
      }
      return [];
    });
    const repository = createMappingTableRepository(sql);
    const result = await repository.importRows({
      datasetId: DATASET_ID,
      rows: [mappingRow()],
      summary: { source: 'unit-test' }
    });

    const importQuery = calls.find((call) => call.text?.includes('insert into mapping_rows'));
    assert.equal(result.datasetId, DATASET_ID);
    assert.equal(result.insertedCount, 1);
    assert.equal(result.skippedCount, 0);
    assert.match(importQuery.text, /update mapping_rows\s+set deleted_at = now\(\)/);
    assert.match(importQuery.text, /update datasets/);
    assert.match(importQuery.text, /metadata = \$3::jsonb/);
  });

  it('soft-deletes previous active rows on repeated import', async () => {
    const { calls, sql } = createTransactionSql((text) => {
      if (text.includes('with live_dataset')) {
        return [{
          dataset_found: true,
          inserted_count: 2,
          skipped_count: 0
        }];
      }
      return [];
    });
    const repository = createMappingTableRepository(sql);

    await repository.importRows({ datasetId: DATASET_ID, rows: [mappingRow(), mappingRow({ rowNumber: 8 })] });

    const importQuery = calls.find((call) => call.text?.includes('insert into mapping_rows'));
    assert.match(importQuery.text, /existing_rows as \(\s*update mapping_rows/s);
    assert.match(importQuery.text, /where dataset_id = \$1::uuid\s+and deleted_at is null/s);
  });

  it('lists and searches non-deleted rows with parameterized SQL', async () => {
    const calls = [];
    const sql = {
      async query(text, params = []) {
        calls.push({ text, params });
        return [{
          id: 'row-1',
          dataset_id: DATASET_ID,
          source_filename: 'mapping.xlsx',
          sheet_name: 'Sheet1',
          row_number: 7,
          domain: 'Weather',
          intention: 'Forecast',
          mapping_intent: 'weather.forecast',
          slot_text: 'city',
          utterance_text: 'weather in Seoul',
          primary_text: 'Weather',
          note_text: 'note',
          raw_row: { values: { A: 'Weather' } },
          total_count: '1'
        }];
      }
    };
    const repository = createMappingTableRepository(sql);
    const result = await repository.listRows(DATASET_ID, { limit: 25, offset: 5, query: 'weather' });

    assert.equal(result.total, 1);
    assert.equal(result.rows[0].domainText, 'Weather');
    assert.deepEqual(result.rows[0].values, { A: 'Weather' });
    assert.match(calls[0].text, /from mapping_rows/);
    assert.match(calls[0].text, /deleted_at is null/);
    assert.match(calls[0].text, /raw_row::text ilike \$3/);
    assert.match(calls[0].text, /order by sheet_name asc nulls last, row_number asc nulls last/);
    assert.deepEqual(calls[0].params, [DATASET_ID, 'weather', '%weather%', 25, 5]);
  });
});

function mappingRow(overrides = {}) {
  return {
    id: 'import-row-1',
    datasetId: DATASET_ID,
    sourceFilename: 'mapping.xlsx',
    sheetName: 'Sheet1',
    rowNumber: 7,
    domainText: 'Weather',
    intentionText: 'Forecast',
    mappingIntent: 'weather.forecast',
    slotText: 'city',
    utteranceText: 'weather in Seoul',
    primaryText: 'Weather',
    noteText: 'note',
    values: { A: 'Weather', B: 'Forecast' },
    ...overrides
  };
}

function createTransactionSql(handler) {
  const calls = [];
  const sql = {
    async query() {
      throw new Error('importRows should use sql.transaction');
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
