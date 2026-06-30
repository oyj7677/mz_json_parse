let cachedSql;
let cachedDatabaseUrl = '';

const SELECT_DATASET_TOOL_TYPE_QUERY = `
  select tool_type
  from datasets
  where id = $1
    and deleted_at is null
  limit 1
`;

const DEACTIVATE_SELECTED_TOOL_DATASETS_QUERY = `
  update datasets
  set is_active = false
  where tool_type = (
      select tool_type
      from datasets
      where id = $1
        and deleted_at is null
      limit 1
    )
    and deleted_at is null
`;

const ACTIVATE_DATASET_QUERY = `
  update datasets
  set is_active = true
  where id = $1
    and deleted_at is null
  returning id, tool_type, name, description, source_type, is_active, record_count, error_count, metadata, created_at
`;

export function resolveDatabaseUrl(env = process.env) {
  return String(env?.DATABASE_URL || env?.POSTGRES_URL || '').trim();
}

export async function getDatasetsRepository(env = process.env) {
  const databaseUrl = resolveDatabaseUrl(env);
  if (!databaseUrl) {
    return undefined;
  }
  if (!cachedSql || cachedDatabaseUrl !== databaseUrl) {
    const { neon } = await import('@neondatabase/serverless');
    cachedSql = neon(databaseUrl);
    cachedDatabaseUrl = databaseUrl;
  }
  return createDatasetsRepository(cachedSql);
}

export function createDatasetsRepository(sql) {
  return {
    async createDataset({ description = '', metadata = {}, name, sourceType = 'admin_upload', toolType }) {
      const rows = await sql.query(`
        insert into datasets (tool_type, name, description, source_type, metadata)
        values ($1, $2, $3, $4, $5::jsonb)
        returning id, tool_type, name, description, source_type, is_active, record_count, error_count, metadata, created_at
      `, [
        toolType,
        name,
        description,
        sourceType,
        JSON.stringify(metadata)
      ]);
      return normalizeDatasetRow(rows[0]);
    },

    async deleteDataset(id) {
      const rows = await sql.query(`
        with deleted_dataset as (
          update datasets
          set deleted_at = now(),
              is_active = false
          where id = $1
            and deleted_at is null
          returning id, tool_type
        ),
        deleted_json_rows as (
          update json_records
          set deleted_at = now()
          where dataset_id in (
              select id
              from deleted_dataset
              where tool_type = 'json'
            )
            and deleted_at is null
          returning id
        ),
        deleted_mapping_rows as (
          update mapping_rows
          set deleted_at = now()
          where dataset_id in (
              select id
              from deleted_dataset
              where tool_type = 'mapping_table'
            )
            and deleted_at is null
          returning id
        ),
        deleted_string_resource_rows as (
          update string_resource_rows
          set deleted_at = now()
          where dataset_id in (
              select id
              from deleted_dataset
              where tool_type = 'string_resource'
            )
            and deleted_at is null
          returning id
        )
        select
          (select count(*)::int from deleted_dataset) as dataset_count,
          (select count(*)::int from deleted_json_rows) as json_count,
          (select count(*)::int from deleted_mapping_rows) as mapping_count,
          (select count(*)::int from deleted_string_resource_rows) as string_resource_count
      `, [id]);
      const result = rows[0] ?? {};
      const deletedCount = Number(result.dataset_count ?? 0);
      const rowDeletedCount = Number(result.json_count ?? 0)
        + Number(result.mapping_count ?? 0)
        + Number(result.string_resource_count ?? 0);
      return { deletedCount, rowDeletedCount };
    },

    async getActiveDataset(toolType) {
      const rows = await sql.query(`
        select id, tool_type, name, description, source_type, is_active, record_count, error_count, metadata, created_at
        from datasets
        where tool_type = $1
          and is_active = true
          and deleted_at is null
        limit 1
      `, [toolType]);
      return rows[0] ? normalizeDatasetRow(rows[0]) : undefined;
    },

    async listDatasets(toolType) {
      const rows = await sql.query(`
        select id, tool_type, name, description, source_type, is_active, record_count, error_count, metadata, created_at
        from datasets
        where tool_type = $1
          and deleted_at is null
        order by is_active desc, created_at desc
      `, [toolType]);
      return rows.map(normalizeDatasetRow);
    },

    async setActiveDataset(id) {
      const [selectedRows, , rows] = await runSetActiveDatasetQueries(sql, id);
      const toolType = selectedRows[0]?.tool_type;
      if (!toolType) {
        return undefined;
      }
      return rows[0] ? normalizeDatasetRow(rows[0]) : undefined;
    },

    async updateDatasetCounts(id, options = {}) {
      const { errorCount = 0, recordCount = 0 } = options;
      const hasMetadata = Object.prototype.hasOwnProperty.call(options, 'metadata');
      const params = [id, recordCount, errorCount];
      const metadataSql = hasMetadata ? `,
            metadata = $4::jsonb` : '';
      if (hasMetadata) {
        const metadata = options.metadata === undefined ? {} : options.metadata;
        params.push(JSON.stringify(metadata));
      }

      const rows = await sql.query(`
        update datasets
        set record_count = $2,
            error_count = $3${metadataSql}
        where id = $1
          and deleted_at is null
        returning id, tool_type, name, description, source_type, is_active, record_count, error_count, metadata, created_at
      `, params);
      return rows[0] ? normalizeDatasetRow(rows[0]) : undefined;
    }
  };
}

async function runSetActiveDatasetQueries(sql, id) {
  if (typeof sql.transaction !== 'function') {
    throw new Error('setActiveDataset requires a transaction-capable SQL client.');
  }

  return sql.transaction((tx) => [
    tx.query(SELECT_DATASET_TOOL_TYPE_QUERY, [id]),
    tx.query(DEACTIVATE_SELECTED_TOOL_DATASETS_QUERY, [id]),
    tx.query(ACTIVATE_DATASET_QUERY, [id])
  ]);
}

export function normalizeDatasetRow(row = {}) {
  return {
    createdAt: row.created_at ?? row.createdAt ?? '',
    description: row.description ?? '',
    errorCount: Number(row.error_count ?? row.errorCount ?? 0),
    id: row.id ?? '',
    isActive: Boolean(row.is_active ?? row.isActive ?? false),
    metadata: row.metadata ?? {},
    name: row.name ?? '',
    recordCount: Number(row.record_count ?? row.recordCount ?? 0),
    sourceType: row.source_type ?? row.sourceType ?? 'admin_upload',
    toolType: row.tool_type ?? row.toolType ?? ''
  };
}
