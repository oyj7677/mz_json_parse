let cachedSql;
let cachedDatabaseUrl = '';

const IMPORT_STRING_RESOURCE_ROWS_QUERY = `
  with live_dataset as (
    select id
    from datasets
    where id = $1::uuid
      and tool_type = 'string_resource'
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
      resource_id text,
      locale_values jsonb,
      id_fields jsonb,
      duplicate_languages jsonb,
      metadata jsonb,
      raw_row jsonb,
      search_text text
    )
  ),
  existing_rows as (
    update string_resource_rows
    set deleted_at = now()
    where dataset_id = $1::uuid
      and deleted_at is null
      and exists(select 1 from live_dataset)
    returning id
  ),
  inserted_rows as (
    insert into string_resource_rows (
      dataset_id,
      source_filename,
      sheet_name,
      row_number,
      resource_id,
      locale_values,
      id_fields,
      duplicate_languages,
      metadata,
      raw_row,
      search_text
    )
    select
      live_dataset.id,
      input_rows.source_filename,
      input_rows.sheet_name,
      input_rows.row_number,
      input_rows.resource_id,
      coalesce(input_rows.locale_values, '{}'::jsonb),
      coalesce(input_rows.id_fields, '{}'::jsonb),
      coalesce(input_rows.duplicate_languages, '{}'::jsonb),
      coalesce(input_rows.metadata, '{}'::jsonb),
      coalesce(input_rows.raw_row, '{}'::jsonb),
      input_rows.search_text
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
      and tool_type = 'string_resource'
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

export async function getStringResourcesRepository(env = process.env) {
  const databaseUrl = resolveDatabaseUrl(env);
  if (!databaseUrl) {
    return undefined;
  }

  if (!cachedSql || cachedDatabaseUrl !== databaseUrl) {
    const { neon } = await import('@neondatabase/serverless');
    cachedSql = neon(databaseUrl);
    cachedDatabaseUrl = databaseUrl;
  }

  return createStringResourcesRepository(cachedSql);
}

export function createStringResourcesRepository(sql) {
  return {
    async importRows({ datasetId = '', rows = [], summary = {} } = {}) {
      if (typeof sql.transaction !== 'function') {
        throw new Error('importRows requires a transaction-capable SQL client.');
      }

      const [resultRows] = await sql.transaction((tx) => [
        tx.query(IMPORT_STRING_RESOURCE_ROWS_QUERY, [
          datasetId,
          JSON.stringify(rows.map(toImportRow)),
          JSON.stringify(summary ?? {})
        ])
      ]);
      const result = resultRows?.[0];

      if (!result?.dataset_found) {
        throw stringResourceDatasetNotFoundError();
      }

      return {
        datasetId,
        insertedCount: Number(result.inserted_count ?? 0),
        skippedCount: Number(result.skipped_count ?? 0)
      };
    },

    async searchRows({ datasetId = '', query = '', limit = 50, offset = 0 } = {}) {
      const trimmedQuery = String(query ?? '').trim();
      const rows = await sql.query(`
        select
          id,
          dataset_id,
          source_filename,
          sheet_name,
          row_number,
          resource_id,
          locale_values,
          id_fields,
          duplicate_languages,
          metadata,
          raw_row,
          created_at,
          count(*) over() as total_count
        from string_resource_rows
        where dataset_id = $1::uuid
          and deleted_at is null
          and (
            $2 = ''
            or source_filename ilike $3
            or sheet_name ilike $3
            or resource_id ilike $3
            or search_text ilike $3
          )
        order by resource_id asc nulls last, source_filename asc nulls last, sheet_name asc nulls last, row_number asc nulls last
        limit $4 offset $5
      `, [
        datasetId,
        trimmedQuery,
        `%${trimmedQuery}%`,
        limit,
        offset
      ]);

      return {
        rows: rows.map(rowToStringResourceRow),
        total: Number(rows[0]?.total_count ?? 0)
      };
    },

    async listLocales(datasetId) {
      const rows = await sql.query(`
        select distinct locale
        from string_resource_rows,
        lateral jsonb_object_keys(locale_values) as locale
        where dataset_id = $1::uuid
          and deleted_at is null
        order by locale asc
      `, [datasetId]);

      return rows.map((row) => String(row.locale ?? '')).filter(Boolean);
    },

    async getRowById(id) {
      const rows = await sql.query(`
        select
          id,
          dataset_id,
          source_filename,
          sheet_name,
          row_number,
          resource_id,
          locale_values,
          id_fields,
          duplicate_languages,
          metadata,
          raw_row,
          created_at
        from string_resource_rows
        where id = $1::uuid
          and deleted_at is null
        limit 1
      `, [id]);

      return rows[0] ? rowToStringResourceRow(rows[0]) : undefined;
    }
  };
}

function toImportRow(row = {}) {
  const localeValues = recordField(row.languages ?? row.localeValues);
  const idFields = recordField(row.idFields);
  const duplicateLanguages = recordField(row.duplicateLanguages);
  const metadata = recordField(row.metadata);
  const rawRow = recordField(row.originalValues ?? row.rawRow);

  return {
    source_filename: stringField(row.sourceFilename ?? row.fileName),
    sheet_name: stringField(row.sheetName),
    row_number: numberOrNull(row.rowNumber),
    resource_id: stringField(row.resourceId),
    locale_values: localeValues,
    id_fields: idFields,
    duplicate_languages: duplicateLanguages,
    metadata,
    raw_row: rawRow,
    search_text: buildSearchText({
      duplicateLanguages,
      id: row.id,
      idFields,
      localeValues,
      metadata,
      rawRow,
      resourceId: row.resourceId,
      rowNumber: row.rowNumber,
      sheetName: row.sheetName,
      sourceFilename: row.sourceFilename ?? row.fileName
    })
  };
}

function rowToStringResourceRow(row = {}) {
  const localeValues = recordField(row.locale_values ?? row.localeValues);
  const rawRow = recordField(row.raw_row ?? row.rawRow);
  const sourceFilename = row.source_filename ?? row.sourceFilename ?? '';

  return {
    id: row.id ?? '',
    datasetId: row.dataset_id ?? row.datasetId ?? '',
    fileName: sourceFilename,
    sourceFilename,
    sheetName: row.sheet_name ?? row.sheetName ?? '',
    rowNumber: Number(row.row_number ?? row.rowNumber ?? 0) || 0,
    resourceId: row.resource_id ?? row.resourceId ?? '',
    idFields: recordField(row.id_fields ?? row.idFields),
    languages: localeValues,
    localeValues,
    duplicateLanguages: recordField(row.duplicate_languages ?? row.duplicateLanguages),
    metadata: recordField(row.metadata),
    originalValues: rawRow,
    rawRow
  };
}

function buildSearchText(row = {}) {
  const values = [
    row.id,
    row.sourceFilename,
    row.sheetName,
    row.rowNumber,
    row.resourceId,
    ...flattenSearchValues(row.idFields),
    ...flattenSearchValues(row.localeValues),
    ...flattenSearchValues(row.duplicateLanguages),
    ...flattenSearchValues(row.metadata),
    ...flattenSearchValues(row.rawRow)
  ];

  return values.map((value) => String(value ?? '').trim()).filter(Boolean).join('\n');
}

function flattenSearchValues(value) {
  if (Array.isArray(value)) {
    return value.flatMap(flattenSearchValues);
  }
  if (isRecord(value)) {
    return Object.values(value).flatMap(flattenSearchValues);
  }
  return [value];
}

function recordField(value) {
  return isRecord(value) ? value : {};
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

function stringResourceDatasetNotFoundError() {
  const error = new Error('String resource dataset not found.');
  error.status = 404;
  return error;
}
