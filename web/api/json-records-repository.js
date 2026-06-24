let cachedSql;
let cachedDatabaseUrl = '';

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
        returning id
      `, [id]);
      await sql.query(`
        update json_import_batches
        set deleted_at = now()
        where id = $1
          and deleted_at is null
      `, [id]);

      return { deletedCount: rows.length };
    },

    async deleteRecord(id) {
      const rows = await sql.query(`
        update json_records
        set deleted_at = now()
        where id = $1
          and deleted_at is null
        returning id
      `, [id]);

      return { deletedCount: rows.length };
    },

    async getRecordById(id) {
      const rows = await sql.query(`
        select
          id,
          batch_id,
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

    async importRecords({ batch, records }) {
      const batchRows = await sql.query(`
        insert into json_import_batches (name, description, source_type, record_count, error_count)
        values ($1, $2, $3, 0, 0)
        returning id, name, record_count, error_count, created_at
      `, [
        batch.name,
        batch.description,
        batch.sourceType
      ]);
      const savedBatch = batchRows[0];
      let insertedCount = 0;
      let skippedCount = 0;

      for (const record of records) {
        const insertedRows = await sql.query(`
          insert into json_records (
            batch_id,
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
          values ($1, $2, $3, $4, $5, $6, $7, $8::jsonb, $9, $10, $11)
          on conflict do nothing
          returning id
        `, [
          savedBatch.id,
          record.sourceFilename,
          record.recognitionText,
          record.language,
          record.contentType,
          record.tableVersion,
          record.slotSummary,
          record.rawJson === null ? null : JSON.stringify(record.rawJson),
          record.rawText,
          record.contentHash,
          record.valueKind
        ]);

        if (insertedRows.length > 0) {
          insertedCount += 1;
        } else {
          skippedCount += 1;
        }
      }

      const updatedRows = await sql.query(`
        update json_import_batches
        set record_count = $1,
            error_count = $2
        where id = $3
        returning id, name, record_count, error_count, created_at
      `, [
        insertedCount,
        skippedCount,
        savedBatch.id
      ]);

      return {
        batch: normalizeBatchRow(updatedRows[0] ?? savedBatch),
        insertedCount,
        skippedCount
      };
    },

    async searchRecords({ limit = 50, offset = 0, query = '' } = {}) {
      const trimmedQuery = String(query ?? '').trim();
      const pattern = `%${trimmedQuery}%`;
      const rows = await sql.query(`
        select
          id,
          batch_id,
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
          and (
            $1 = ''
            or source_filename ilike $2
            or recognition_text ilike $2
            or language ilike $2
            or content_type ilike $2
            or table_version ilike $2
            or slot_summary ilike $2
            or raw_text ilike $2
            or raw_json::text ilike $2
          )
        order by created_at desc
        limit $3 offset $4
      `, [
        trimmedQuery,
        pattern,
        limit,
        offset
      ]);

      return {
        records: rows,
        total: Number(rows[0]?.total_count ?? 0)
      };
    }
  };
}

function normalizeBatchRow(row = {}) {
  return {
    createdAt: row.created_at ?? row.createdAt ?? '',
    errorCount: Number(row.error_count ?? row.errorCount ?? 0),
    id: row.id ?? '',
    name: row.name ?? '',
    recordCount: Number(row.record_count ?? row.recordCount ?? 0)
  };
}
