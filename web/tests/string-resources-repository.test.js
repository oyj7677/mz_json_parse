import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  createStringResourcesRepository,
  resolveDatabaseUrl
} from '../api/string-resources-repository.js';

const DATASET_ID = '00000000-0000-4000-8000-000000000201';
const ROW_ID = '00000000-0000-4000-8000-000000000301';

describe('string resources repository', () => {
  it('resolves DATABASE_URL with POSTGRES_URL fallback', () => {
    assert.equal(resolveDatabaseUrl({ DATABASE_URL: 'postgres://main' }), 'postgres://main');
    assert.equal(resolveDatabaseUrl({ POSTGRES_URL: 'postgres://fallback' }), 'postgres://fallback');
    assert.equal(resolveDatabaseUrl({}), '');
  });

  it('requires a transaction-capable SQL client for imports', async () => {
    const repository = createStringResourcesRepository({
      async query() {
        throw new Error('should not query without transaction');
      }
    });

    await assert.rejects(
      () => repository.importRows({ datasetId: DATASET_ID, rows: [stringResourceRow()] }),
      /importRows requires a transaction-capable SQL client/
    );
  });

  it('validates an active string_resource dataset before inserting rows', async () => {
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
    const repository = createStringResourcesRepository(sql);

    await assert.rejects(
      () => repository.importRows({ datasetId: DATASET_ID, rows: [stringResourceRow()] }),
      (error) => error?.status === 404 && error.message === 'String resource dataset not found.'
    );

    const importQuery = calls.find((call) => call.type === 'query');
    assert.match(importQuery.text, /from datasets/);
    assert.match(importQuery.text, /tool_type = 'string_resource'/);
    assert.match(importQuery.text, /is_active = true/);
    assert.match(importQuery.text, /deleted_at is null/);
    assert.ok(
      importQuery.text.indexOf('live_dataset as') < importQuery.text.indexOf('inserted_rows as'),
      'dataset validation should happen before insert'
    );
  });

  it('imports rows with locale JSON, raw row values, search text, and dataset metadata', async () => {
    const { calls, sql } = createTransactionSql((text, params = []) => {
      if (text.includes('with live_dataset')) {
        const importRows = JSON.parse(params[1]);
        assert.equal(params[0], DATASET_ID);
        assert.equal(importRows[0].dataset_id, undefined);
        assert.equal(importRows[0].source_filename, 'strings.xlsx');
        assert.equal(importRows[0].sheet_name, 'Strings');
        assert.equal(importRows[0].row_number, 7);
        assert.equal(importRows[0].resource_id, 'weather_title');
        assert.deepEqual(importRows[0].locale_values, { ko: '날씨', 'en-rUS': 'Weather' });
        assert.deepEqual(importRows[0].id_fields, { LID: 'weather_title' });
        assert.deepEqual(importRows[0].duplicate_languages, { ko: [{ column: 'Korean 2', value: '기상' }] });
        assert.deepEqual(importRows[0].metadata, { screen: 'home' });
        assert.deepEqual(importRows[0].raw_row, { LID: 'weather_title', Korean: '날씨' });
        assert.match(importRows[0].search_text, /weather_title/);
        assert.match(importRows[0].search_text, /Weather/);
        assert.match(importRows[0].search_text, /home/);
        assert.deepEqual(JSON.parse(params[2]), { source: 'unit-test' });
        return [{
          dataset_found: true,
          inserted_count: 1,
          skipped_count: 0
        }];
      }
      return [];
    });
    const repository = createStringResourcesRepository(sql);
    const result = await repository.importRows({
      datasetId: DATASET_ID,
      rows: [stringResourceRow()],
      summary: { source: 'unit-test' }
    });

    const importQuery = calls.find((call) => call.text?.includes('insert into string_resource_rows'));
    assert.equal(result.datasetId, DATASET_ID);
    assert.equal(result.insertedCount, 1);
    assert.equal(result.skippedCount, 0);
    assert.match(importQuery.text, /update string_resource_rows\s+set deleted_at = now\(\)/);
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
    const repository = createStringResourcesRepository(sql);

    await repository.importRows({ datasetId: DATASET_ID, rows: [stringResourceRow(), stringResourceRow({ rowNumber: 8 })] });

    const importQuery = calls.find((call) => call.text?.includes('insert into string_resource_rows'));
    assert.match(importQuery.text, /existing_rows as \(\s*update string_resource_rows/s);
    assert.match(importQuery.text, /where dataset_id = \$1::uuid\s+and deleted_at is null/s);
  });

  it('searches non-deleted rows and maps them to the frontend-compatible shape', async () => {
    const calls = [];
    const sql = {
      async query(text, params = []) {
        calls.push({ text, params });
        return [databaseRow({ total_count: '1' })];
      }
    };
    const repository = createStringResourcesRepository(sql);
    const result = await repository.searchRows({ datasetId: DATASET_ID, limit: 25, offset: 5, query: 'weather' });

    assert.equal(result.total, 1);
    assert.equal(result.rows[0].id, ROW_ID);
    assert.equal(result.rows[0].datasetId, DATASET_ID);
    assert.equal(result.rows[0].fileName, 'strings.xlsx');
    assert.equal(result.rows[0].sourceFilename, 'strings.xlsx');
    assert.equal(result.rows[0].resourceId, 'weather_title');
    assert.deepEqual(result.rows[0].languages, { ko: '날씨', 'en-rUS': 'Weather' });
    assert.deepEqual(result.rows[0].localeValues, { ko: '날씨', 'en-rUS': 'Weather' });
    assert.deepEqual(result.rows[0].originalValues, { LID: 'weather_title', Korean: '날씨' });
    assert.match(calls[0].text, /from string_resource_rows/);
    assert.match(calls[0].text, /deleted_at is null/);
    assert.match(calls[0].text, /search_text ilike \$3/);
    assert.match(calls[0].text, /order by resource_id asc nulls last, source_filename asc nulls last, sheet_name asc nulls last, row_number asc nulls last/);
    assert.deepEqual(calls[0].params, [DATASET_ID, 'weather', '%weather%', 25, 5]);
  });

  it('lists distinct locales from stored locale values in stable order', async () => {
    const calls = [];
    const sql = {
      async query(text, params = []) {
        calls.push({ text, params });
        return [
          { locale: 'en-rUS' },
          { locale: 'ko' },
          { locale: 'zh-rCN' }
        ];
      }
    };
    const repository = createStringResourcesRepository(sql);

    assert.deepEqual(await repository.listLocales(DATASET_ID), ['en-rUS', 'ko', 'zh-rCN']);
    assert.match(calls[0].text, /jsonb_object_keys\(locale_values\)/);
    assert.match(calls[0].text, /deleted_at is null/);
    assert.deepEqual(calls[0].params, [DATASET_ID]);
  });

  it('returns normalized detail rows by id', async () => {
    const calls = [];
    const sql = {
      async query(text, params = []) {
        calls.push({ text, params });
        return [databaseRow()];
      }
    };
    const repository = createStringResourcesRepository(sql);

    const row = await repository.getRowById(ROW_ID);

    assert.equal(row.id, ROW_ID);
    assert.equal(row.resourceId, 'weather_title');
    assert.match(calls[0].text, /where id = \$1::uuid/);
    assert.match(calls[0].text, /deleted_at is null/);
    assert.deepEqual(calls[0].params, [ROW_ID]);
  });
});

function stringResourceRow(overrides = {}) {
  return {
    id: 'strings.xlsx:Strings:7',
    fileName: 'strings.xlsx',
    sheetName: 'Strings',
    rowNumber: 7,
    resourceId: 'weather_title',
    idFields: { LID: 'weather_title' },
    languages: { ko: '날씨', 'en-rUS': 'Weather' },
    duplicateLanguages: { ko: [{ column: 'Korean 2', value: '기상' }] },
    metadata: { screen: 'home' },
    originalValues: { LID: 'weather_title', Korean: '날씨' },
    ...overrides
  };
}

function databaseRow(overrides = {}) {
  return {
    id: ROW_ID,
    dataset_id: DATASET_ID,
    source_filename: 'strings.xlsx',
    sheet_name: 'Strings',
    row_number: 7,
    resource_id: 'weather_title',
    locale_values: { ko: '날씨', 'en-rUS': 'Weather' },
    id_fields: { LID: 'weather_title' },
    duplicate_languages: { ko: [{ column: 'Korean 2', value: '기상' }] },
    metadata: { screen: 'home' },
    raw_row: { LID: 'weather_title', Korean: '날씨' },
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
