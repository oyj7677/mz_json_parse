let cachedSql;
let cachedDatabaseUrl = '';

const IMPORT_JSON_RECORDS_QUERY = `
  with live_dataset as (
    select id
    from datasets
    where id = $1::uuid
      and tool_type = 'json'
      and is_active = true
      and deleted_at is null
    for update
  ),
  input_records as (
    select *
    from jsonb_to_recordset($2::jsonb) as record(
      country_region text,
      source_filename text,
      recognition_text text,
      language text,
      content_type text,
      table_version text,
      slot_summary text,
      raw_json jsonb,
      raw_text text,
      content_hash text,
      value_kind text
    )
  ),
  existing_record_counts as (
    select count(*)::int as count
    from json_records
    where dataset_id = $1::uuid
      and deleted_at is null
  ),
  inserted_records as (
    insert into json_records (
      dataset_id,
      country_region,
      source_filename,
      recognition_text,
      language,
      content_type,
      table_version,
      slot_summary,
      raw_json,
      raw_text,
      content_hash,
      value_kind
    )
    select
      live_dataset.id,
      input_records.country_region,
      input_records.source_filename,
      input_records.recognition_text,
      input_records.language,
      input_records.content_type,
      input_records.table_version,
      input_records.slot_summary,
      input_records.raw_json,
      input_records.raw_text,
      input_records.content_hash,
      input_records.value_kind
    from live_dataset
    cross join input_records
    on conflict do nothing
    returning id
  ),
  import_counts as (
    select
      (select count(*)::int from input_records) as input_count,
      (select count(*)::int from inserted_records) as inserted_count
  ),
  updated_dataset as (
    update datasets
    set record_count = (
          select existing_record_counts.count + import_counts.inserted_count
          from existing_record_counts, import_counts
        ),
        error_count = (
          select import_counts.input_count - import_counts.inserted_count
          from import_counts
        )
    where id = $1::uuid
      and tool_type = 'json'
      and is_active = true
      and deleted_at is null
    returning id, record_count, error_count
  )
  select
    exists(select 1 from live_dataset) as dataset_found,
    coalesce((select inserted_count from import_counts), 0)::int as inserted_count,
    coalesce((select input_count - inserted_count from import_counts), 0)::int as skipped_count,
    coalesce((select record_count from updated_dataset), 0)::int as record_count
`;

const COUNT_JSON_DATASET_RECORDS_QUERY = `
  select count(*)::int as count
  from json_records
  where dataset_id = $1::uuid
    and deleted_at is null
`;

const UPDATE_JSON_DATASET_RECORD_COUNT_QUERY = `
  update datasets
  set record_count = $2
  where id = $1::uuid
    and tool_type = 'json'
    and is_active = true
    and deleted_at is null
  returning id, record_count
`;

export function resolveDatabaseUrl(env = process.env) {
  return String(env?.DATABASE_URL || env?.POSTGRES_URL || '').trim();
}

export async function getJsonRecordsRepository(env = process.env) {
  const databaseUrl = resolveDatabaseUrl(env);
  if (!databaseUrl) {
    return undefined;
  }

  if (!cachedSql || cachedDatabaseUrl !== databaseUrl) {
    const { neon } = await import('@neondatabase/serverless');
    cachedSql = neon(databaseUrl);
    cachedDatabaseUrl = databaseUrl;
  }

  return createJsonRecordsRepository(cachedSql);
}

export function createJsonRecordsRepository(sql) {
  return {
    async deleteBatch(id) {
      const rows = await sql.query(`
        update json_records
        set deleted_at = now()
        where batch_id = $1
          and deleted_at is null
        returning id, dataset_id
      `, [id]);
      await sql.query(`
        update json_import_batches
        set deleted_at = now()
        where id = $1
          and deleted_at is null
      `, [id]);
      await refreshJsonDatasetCounts(sql, collectDatasetIds(rows));

      return { deletedCount: rows.length };
    },

    async deleteRecord(id) {
      const rows = await sql.query(`
        update json_records
        set deleted_at = now()
        where id = $1
          and deleted_at is null
        returning id, dataset_id
      `, [id]);
      await refreshJsonDatasetCounts(sql, collectDatasetIds(rows));

      return { deletedCount: rows.length };
    },

    async getRecordById(id) {
      const rows = await sql.query(`
        select
          id,
          batch_id,
          dataset_id,
          country_region,
          source_filename,
          recognition_text,
          language,
          content_type,
          table_version,
          slot_summary,
          raw_json,
          raw_text,
          value_kind,
          created_at
        from json_records
        where id = $1
          and deleted_at is null
        limit 1
      `, [id]);

      return rows[0];
    },

    async getStatus() {
      const [recordRows, batchRows, recentBatches, contentTypeRows] = await Promise.all([
        sql.query('select count(*)::int as count from json_records where deleted_at is null'),
        sql.query('select count(*)::int as count from json_import_batches where deleted_at is null'),
        sql.query(`
          select id, name, record_count, error_count, created_at
          from json_import_batches
          where deleted_at is null
          order by created_at desc
          limit 10
        `),
        sql.query(`
          select coalesce(nullif(content_type, ''), 'unknown') as content_type, count(*)::int as count
          from json_records
          where deleted_at is null
          group by coalesce(nullif(content_type, ''), 'unknown')
          order by count desc, content_type asc
          limit 12
        `)
      ]);

      return {
        batchCount: Number(batchRows[0]?.count ?? 0),
        contentTypes: contentTypeRows.map((row) => ({
          contentType: row.content_type,
          count: Number(row.count ?? 0)
        })),
        recentBatches: recentBatches.map((row) => ({
          createdAt: row.created_at,
          errorCount: Number(row.error_count ?? 0),
          id: row.id,
          name: row.name,
          recordCount: Number(row.record_count ?? 0)
        })),
        recordCount: Number(recordRows[0]?.count ?? 0)
      };
    },

    async importRecords({ countryRegion = '', datasetId = '', records = [] }) {
      if (typeof sql.transaction !== 'function') {
        throw new Error('importRecords requires a transaction-capable SQL client.');
      }

      const importRowsByQuery = await sql.transaction((tx) => [
        tx.query(IMPORT_JSON_RECORDS_QUERY, [
          datasetId,
          JSON.stringify(records.map((record) => toImportRecord(record, countryRegion)))
        ])
      ]);
      const importResult = importRowsByQuery[0]?.[0];

      if (!importResult?.dataset_found) {
        throw jsonDatasetNotFoundError();
      }

      return {
        countryRegion,
        datasetId,
        insertedCount: Number(importResult.inserted_count ?? 0),
        skippedCount: Number(importResult.skipped_count ?? 0)
      };
    },

    async searchRecords({ countryRegion = '', datasetId = '', limit = 50, offset = 0, query = '' } = {}) {
      const datasetFilter = String(datasetId ?? '').trim();
      const countryFilter = String(countryRegion ?? '').trim();
      const trimmedQuery = String(query ?? '').trim();
      const pattern = `%${trimmedQuery}%`;
      const rows = await sql.query(`
        select
          id,
          batch_id,
          dataset_id,
          country_region,
          source_filename,
          recognition_text,
          language,
          content_type,
          table_version,
          slot_summary,
          value_kind,
          created_at,
          count(*) over() as total_count
        from json_records
        where deleted_at is null
          and ($1 = '' or dataset_id = $1::uuid)
          and ($2 = '' or country_region = $2)
          and (
            $3 = ''
            or source_filename ilike $4
            or recognition_text ilike $4
            or language ilike $4
            or content_type ilike $4
            or table_version ilike $4
            or slot_summary ilike $4
            or raw_text ilike $4
            or raw_json::text ilike $4
          )
        order by created_at desc
        limit $5 offset $6
      `, [
        datasetFilter,
        countryFilter,
        trimmedQuery,
        pattern,
        limit,
        offset
      ]);

      return {
        records: rows,
        total: Number(rows[0]?.total_count ?? 0)
      };
    },

    async listCountries(datasetId) {
      const rows = await sql.query(`
        select country_region, count(*)::int as count
        from json_records
        where dataset_id = $1::uuid
          and deleted_at is null
          and country_region <> ''
        group by country_region
        order by country_region asc
      `, [datasetId]);

      return rows.map((row) => ({
        countryRegion: row.country_region,
        count: Number(row.count ?? 0)
      }));
    }
  };
}

function collectDatasetIds(rows = []) {
  return [...new Set(
    rows
      .map((row) => row?.dataset_id ?? row?.datasetId)
      .filter(Boolean)
      .map(String)
  )];
}

async function refreshJsonDatasetCounts(sql, datasetIds = []) {
  for (const datasetId of datasetIds) {
    const countRows = await sql.query(COUNT_JSON_DATASET_RECORDS_QUERY, [datasetId]);
    const recordCount = Number(countRows[0]?.count ?? 0);
    await sql.query(UPDATE_JSON_DATASET_RECORD_COUNT_QUERY, [datasetId, recordCount]);
  }
}

function toImportRecord(record = {}, countryRegion = '') {
  return {
    content_hash: String(record.contentHash ?? ''),
    content_type: String(record.contentType ?? ''),
    country_region: String(record.countryRegion ?? countryRegion ?? '').trim(),
    language: String(record.language ?? ''),
    raw_json: record.rawJson ?? null,
    raw_text: String(record.rawText ?? ''),
    recognition_text: String(record.recognitionText ?? ''),
    slot_summary: String(record.slotSummary ?? ''),
    source_filename: String(record.sourceFilename ?? ''),
    table_version: String(record.tableVersion ?? ''),
    value_kind: String(record.valueKind ?? 'json')
  };
}

function jsonDatasetNotFoundError() {
  const error = new Error('JSON dataset not found.');
  error.status = 404;
  return error;
}
