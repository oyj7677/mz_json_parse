let cachedSql;
let cachedDatabaseUrl = '';

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
        update datasets
        set deleted_at = now(),
            is_active = false
        where id = $1
          and deleted_at is null
        returning id
      `, [id]);
      return { deletedCount: rows.length };
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
      const selectedRows = await sql.query(`
        select tool_type
        from datasets
        where id = $1
          and deleted_at is null
        limit 1
      `, [id]);
      const toolType = selectedRows[0]?.tool_type;
      if (!toolType) {
        return undefined;
      }
      await sql.query(`
        update datasets
        set is_active = false
        where tool_type = $1
          and deleted_at is null
      `, [toolType]);
      const rows = await sql.query(`
        update datasets
        set is_active = true
        where id = $1
          and deleted_at is null
        returning id, tool_type, name, description, source_type, is_active, record_count, error_count, metadata, created_at
      `, [id]);
      return rows[0] ? normalizeDatasetRow(rows[0]) : undefined;
    },

    async updateDatasetCounts(id, { errorCount = 0, metadata = {}, recordCount = 0 } = {}) {
      const rows = await sql.query(`
        update datasets
        set record_count = $2,
            error_count = $3,
            metadata = $4::jsonb
        where id = $1
          and deleted_at is null
        returning id, tool_type, name, description, source_type, is_active, record_count, error_count, metadata, created_at
      `, [id, recordCount, errorCount, JSON.stringify(metadata)]);
      return rows[0] ? normalizeDatasetRow(rows[0]) : undefined;
    }
  };
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
