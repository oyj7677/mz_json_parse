# JSON DB Admin Design

## Goal

Move JSON Explorer toward a database-backed workflow while keeping the first DB version simple:

- `/explorer` is a public read/search view.
- `/admin` is a protected database management view.
- Upload and delete operations require an administrator key.
- Team login can be added later without changing the public/admin split.

## Architecture

The browser never talks to Neon directly. Vercel server APIs own all database access through `DATABASE_URL`, and admin mutations require `JSON_ADMIN_KEY`.

```text
Browser /explorer
  GET /api/json-records
  GET /api/json-records/:id

Browser /admin
  GET /api/admin/json-records/status
  POST /api/admin/json-records/import  x-admin-key
  DELETE /api/admin/json-records/:id   x-admin-key
  DELETE /api/admin/json-batches/:id   x-admin-key

Vercel API / local server
  Neon Postgres via @neondatabase/serverless
```

## Database Model

Use Postgres tables with JSONB for the original payload and extracted columns for fast search.

```sql
json_import_batches
- id uuid primary key
- name text
- description text
- source_type text
- record_count integer
- error_count integer
- created_at timestamptz

json_records
- id uuid primary key
- batch_id uuid
- source_filename text
- recognition_text text
- language text
- content_type text
- table_version text
- slot_summary text
- raw_json jsonb
- raw_text text
- value_kind text
- content_hash text
- created_at timestamptz
- deleted_at timestamptz

json_record_slots
- id uuid primary key
- record_id uuid
- slot_name text
- slot_value text
- slot_canonical text
```

## Behavior

- Public search returns metadata rows only: file name, recognition text, language, slot summary, content type, table version, created time.
- Public detail returns the original JSON or raw text for a selected record.
- Admin import accepts multiple uploaded files, parses each file with the same JSON helper behavior used by the local Explorer, extracts searchable metadata, hashes the stored content, and stores records in a batch.
- Admin delete is soft delete through `deleted_at`.
- Batch delete soft-deletes all records in the batch.
- If `DATABASE_URL` is missing, DB APIs return `503` with a clear message.
- If `JSON_ADMIN_KEY` is missing, admin mutation APIs return `503`; if provided key is wrong, return `401`.

## Security Rules

- `DATABASE_URL` is server-only.
- `JSON_ADMIN_KEY` is server-only and sent from the admin page only as a request header.
- Server responses do not echo the admin key or DB URL.
- Server logs must not print raw JSON payloads.

## Future Authentication

When team authentication is added later:

- `/admin` keeps the same route.
- Admin key checks can be replaced with session checks.
- Public `/explorer` can remain public or become login-protected.
- `uploaded_by` and `deleted_by` columns can be added without changing the main table split.
