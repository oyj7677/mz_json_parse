let cachedSql;
let cachedDatabaseUrl = '';

const IMPORT_MAPPING_ROWS_QUERY = `
  with live_dataset as (
    select id
    from datasets
    where id = $1::uuid
      and tool_type = 'mapping_table'
      and is_active = true
      and deleted_at is null
    for update
  ),
  input_rows as (
    select *
    from jsonb_to_recordset($2::jsonb) as row(
      source_filename text,
      sheet_name text,
      row_number integer,
      domain text,
      intention text,
      mapping_intent text,
      slot_text text,
      utterance_text text,
      primary_text text,
      note_text text,
      raw_row jsonb
    )
  ),
  existing_rows as (
    update mapping_rows
    set deleted_at = now()
    where dataset_id = $1::uuid
      and deleted_at is null
      and exists(select 1 from live_dataset)
    returning id
  ),
  inserted_rows as (
    insert into mapping_rows (
      dataset_id,
      source_filename,
      sheet_name,
      row_number,
      domain,
      intention,
      mapping_intent,
      slot_text,
      utterance_text,
      primary_text,
      note_text,
      raw_row
    )
    select
      live_dataset.id,
      input_rows.source_filename,
      input_rows.sheet_name,
      input_rows.row_number,
      input_rows.domain,
      input_rows.intention,
      input_rows.mapping_intent,
      input_rows.slot_text,
      input_rows.utterance_text,
      input_rows.primary_text,
      input_rows.note_text,
      input_rows.raw_row
    from live_dataset
    cross join input_rows
    returning id
  ),
  import_counts as (
    select
      (select count(*)::int from input_rows) as input_count,
      (select count(*)::int from inserted_rows) as inserted_count
  ),
  updated_dataset as (
    update datasets
    set record_count = (select inserted_count from import_counts),
        error_count = (select input_count - inserted_count from import_counts),
        metadata = $3::jsonb
    where id = $1::uuid
      and tool_type = 'mapping_table'
      and is_active = true
      and deleted_at is null
    returning id
  )
  select
    exists(select 1 from live_dataset) as dataset_found,
    coalesce((select inserted_count from import_counts), 0)::int as inserted_count,
    coalesce((select input_count - inserted_count from import_counts), 0)::int as skipped_count
`;

export function resolveDatabaseUrl(env = process.env) {
  return String(env?.DATABASE_URL || env?.POSTGRES_URL || '').trim();
}

export async function getMappingTableRepository(env = process.env) {
  const databaseUrl = resolveDatabaseUrl(env);
  if (!databaseUrl) {
    return undefined;
  }

  if (!cachedSql || cachedDatabaseUrl !== databaseUrl) {
    const { neon } = await import('@neondatabase/serverless');
    cachedSql = neon(databaseUrl);
    cachedDatabaseUrl = databaseUrl;
  }

  return createMappingTableRepository(cachedSql);
}

export function createMappingTableRepository(sql) {
  return {
    async importRows({ datasetId = '', rows = [], summary = {} } = {}) {
      if (typeof sql.transaction !== 'function') {
        throw new Error('importRows requires a transaction-capable SQL client.');
      }

      const [resultRows] = await sql.transaction((tx) => [
        tx.query(IMPORT_MAPPING_ROWS_QUERY, [
          datasetId,
          JSON.stringify(rows.map(toImportRow)),
          JSON.stringify(summary ?? {})
        ])
      ]);
      const result = resultRows?.[0];

      if (!result?.dataset_found) {
        throw mappingDatasetNotFoundError();
      }

      return {
        datasetId,
        insertedCount: Number(result.inserted_count ?? 0),
        skippedCount: Number(result.skipped_count ?? 0)
      };
    },

    async listRows(datasetId, { limit = 50, offset = 0, query = '' } = {}) {
      const trimmedQuery = String(query ?? '').trim();
      const rows = await sql.query(`
        select
          id,
          dataset_id,
          source_filename,
          sheet_name,
          row_number,
          domain,
          intention,
          mapping_intent,
          slot_text,
          utterance_text,
          primary_text,
          note_text,
          raw_row,
          created_at,
          count(*) over() as total_count
        from mapping_rows
        where dataset_id = $1::uuid
          and deleted_at is null
          and (
            $2 = ''
            or source_filename ilike $3
            or sheet_name ilike $3
            or domain ilike $3
            or intention ilike $3
            or mapping_intent ilike $3
            or slot_text ilike $3
            or utterance_text ilike $3
            or primary_text ilike $3
            or note_text ilike $3
            or raw_row::text ilike $3
          )
        order by sheet_name asc nulls last, row_number asc nulls last, created_at asc
        limit $4 offset $5
      `, [
        datasetId,
        trimmedQuery,
        `%${trimmedQuery}%`,
        limit,
        offset
      ]);

      return {
        rows: rows.map(rowToMappingRow),
        total: Number(rows[0]?.total_count ?? 0)
      };
    }
  };
}

function toImportRow(row = {}) {
  const values = isRecord(row.values) ? row.values : {};
  return {
    source_filename: stringField(row.sourceFilename),
    sheet_name: stringField(row.sheetName),
    row_number: numberOrNull(row.rowNumber),
    domain: stringField(row.domainText),
    intention: stringField(row.intentionText),
    mapping_intent: stringField(row.mappingIntent),
    slot_text: stringField(row.slotText),
    utterance_text: stringField(row.utteranceText),
    primary_text: stringField(row.primaryText),
    note_text: stringField(row.noteText),
    raw_row: {
      id: stringField(row.id),
      values
    }
  };
}

function rowToMappingRow(row = {}) {
  const rawRow = isRecord(row.raw_row) ? row.raw_row : {};
  return {
    datasetId: row.dataset_id ?? row.datasetId ?? '',
    domainText: row.domain ?? row.domainText ?? '',
    id: row.id ?? '',
    intentionText: row.intention ?? row.intentionText ?? '',
    mappingIntent: row.mapping_intent ?? row.mappingIntent ?? '',
    noteText: row.note_text ?? row.noteText ?? '',
    primaryText: row.primary_text ?? row.primaryText ?? '',
    rowNumber: Number(row.row_number ?? row.rowNumber ?? 0) || 0,
    sheetName: row.sheet_name ?? row.sheetName ?? '',
    slotText: row.slot_text ?? row.slotText ?? '',
    sourceFilename: row.source_filename ?? row.sourceFilename ?? '',
    utteranceText: row.utterance_text ?? row.utteranceText ?? '',
    values: isRecord(rawRow.values) ? rawRow.values : {}
  };
}

function stringField(value) {
  return String(value ?? '').trim();
}

function numberOrNull(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function isRecord(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function mappingDatasetNotFoundError() {
  const error = new Error('Mapping table dataset not found.');
  error.status = 404;
  return error;
}
