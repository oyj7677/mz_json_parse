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
      let insertedCount = 0;
      let skippedCount = 0;

      for (const record of records) {
        const recordCountryRegion = String(record.countryRegion ?? countryRegion ?? '').trim();
        const insertedRows = await sql.query(`
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
          values ($1, $2, $3, $4, $5, $6, $7, $8, $9::jsonb, $10, $11, $12)
          on conflict do nothing
          returning id
        `, [
          datasetId,
          recordCountryRegion,
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

      const countRows = await sql.query(`
        select count(*)::int as count
        from json_records
        where dataset_id = $1::uuid
          and deleted_at is null
      `, [datasetId]);
      const recordCount = Number(countRows[0]?.count ?? insertedCount);

      await sql.query(`
        update datasets
        set record_count = $1,
            error_count = $2
        where id = $3
          and deleted_at is null
      `, [
        recordCount,
        skippedCount,
        datasetId
      ]);

      return {
        countryRegion,
        datasetId,
        insertedCount,
        skippedCount
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
