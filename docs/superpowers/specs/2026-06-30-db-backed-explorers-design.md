# DB-Backed Explorer Data Management Design

## Summary

JSON Explorer, Mapping Table Explorer, and String Resource Explorer should move from repeated local file upload to database-managed datasets. The search tools remain focused on fast lookup, while `/admin` becomes the place where datasets are uploaded, versioned, activated, and soft-deleted.

The database model should use one common `datasets` table for shared version metadata and one row table per tool for search-optimized data. This keeps version management consistent without forcing JSON, mapping table rows, and multilingual string rows into one generic shape.

## Goals

- Store Explorer data in Neon Postgres through Vercel APIs.
- Let users search active DB data without uploading files every session.
- Keep uploaded dataset versions so older data can be selected or reactivated later.
- Manage all Explorer datasets from one `/admin` page.
- Preserve the existing search UX as much as possible.
- Treat JSON country/region as JSON-specific metadata, not a global tool concept.
- Treat String Resource locale qualifiers such as `ko`, `en-rUS`, and `en-rAU` as language columns inside a dataset, not as dataset country filters.

## Non-Goals

- No team login in this phase. Admin mutation APIs continue to use the admin key.
- No product-code injection for String Resource data.
- No server-side Excel parsing in the first implementation unless browser parsing becomes too large or slow.
- No cross-version diff UI in the first implementation.
- No automatic country inference from JSON file or folder names in the first implementation.

## Core Decisions

- Use a new common `datasets` table.
- Use tool-specific row tables:
  - `json_records`
  - `mapping_rows`
  - `string_resource_rows`
- Store dataset versions over time.
- Each tool has one active dataset by default.
- JSON active dataset can contain multiple countries/regions.
- JSON upload is country-based: the admin selects or enters one `country_region`, then uploads many JSON files for that country into the selected dataset.
- Mapping Table and String Resource do not use country/region dataset filters.
- Search screens show dataset version filters; JSON additionally shows a country/region filter.
- `/admin` stays as one integrated admin page with tabs for each tool.

## Data Model

### datasets

`datasets` is the common version and lifecycle table for all three tools.

Columns:

- `id uuid primary key`
- `tool_type text not null`
  - allowed values: `json`, `mapping_table`, `string_resource`
- `name text not null`
- `description text not null default ''`
- `source_type text not null default 'admin_upload'`
- `is_active boolean not null default false`
- `record_count integer not null default 0`
- `error_count integer not null default 0`
- `metadata jsonb not null default '{}'::jsonb`
- `created_at timestamptz not null default now()`
- `deleted_at timestamptz`

Rules:

- Only one active dataset should exist per `tool_type`.
- Activating a dataset deactivates other non-deleted datasets for the same `tool_type`.
- Deleted datasets are soft-deleted with `deleted_at`.
- `metadata` stores tool-level summaries such as country counts, sheet counts, and locale lists.

### json_records

`json_records` stores normalized JSON Explorer records.

Columns:

- `id uuid primary key`
- `dataset_id uuid not null references datasets(id)`
- `country_region text not null`
- `source_filename text not null default ''`
- `recognition_text text not null default ''`
- `language text not null default ''`
- `content_type text not null default ''`
- `table_version text not null default ''`
- `slot_summary text not null default ''`
- `raw_json jsonb`
- `raw_text text not null default ''`
- `value_kind text not null default 'json'`
- `content_hash text not null`
- `created_at timestamptz not null default now()`
- `deleted_at timestamptz`

Rules:

- `country_region` is required for JSON imports.
- Duplicate prevention should include `dataset_id`, `country_region`, and `content_hash`.
- Search indexes should cover `country_region`, `source_filename`, `recognition_text`, `language`, `content_type`, `table_version`, `slot_summary`, and `raw_text`.

### json_record_slots

`json_record_slots` remains a child table for extracted slot details.

Columns:

- `id uuid primary key`
- `record_id uuid not null references json_records(id) on delete cascade`
- `slot_name text not null default ''`
- `slot_value text not null default ''`
- `slot_canonical text not null default ''`
- `created_at timestamptz not null default now()`

### mapping_rows

`mapping_rows` stores normalized Mapping Table Explorer rows.

Columns:

- `id uuid primary key`
- `dataset_id uuid not null references datasets(id)`
- `source_filename text not null default ''`
- `sheet_name text not null default ''`
- `row_number integer not null`
- `domain text not null default ''`
- `intention text not null default ''`
- `mapping_intent text not null default ''`
- `slot_text text not null default ''`
- `utterance_text text not null default ''`
- `primary_text text not null default ''`
- `raw_row jsonb not null default '{}'::jsonb`
- `created_at timestamptz not null default now()`
- `deleted_at timestamptz`

Rules:

- Rows from `GROUP INTENTIONS` and `SLOT REFERENCE` must keep their sheet name.
- Existing workflow remains: search `GROUP INTENTIONS`, select a row, derive slot candidates, then show matching `SLOT REFERENCE` rows.
- `raw_row` preserves all original spreadsheet columns for detail views and future columns.

### string_resource_rows

`string_resource_rows` stores normalized multilingual resource rows.

Columns:

- `id uuid primary key`
- `dataset_id uuid not null references datasets(id)`
- `source_filename text not null default ''`
- `sheet_name text not null default ''`
- `row_number integer not null`
- `resource_id text not null default ''`
- `locale_values jsonb not null default '{}'::jsonb`
- `search_text text not null default ''`
- `raw_row jsonb not null default '{}'::jsonb`
- `created_at timestamptz not null default now()`
- `deleted_at timestamptz`

Rules:

- `locale_values` uses Android resource qualifier names as keys, such as `ko`, `en-rUS`, `en-rGB`, `en-rAU`, `es-rMX`, and `es-rES`.
- `search_text` is a denormalized string built from `resource_id` and locale values for simple search.
- Additional detected locale qualifiers are stored without schema changes.

## Admin UX

`/admin` remains one protected admin page. Admin key entry is shared across tabs.

Tabs:

- `JSON Data`
- `Mapping Table`
- `String Resource`

Common dataset controls:

- Dataset list with name, description, active state, row count, created date, and actions.
- Create dataset version.
- Set active dataset.
- Soft delete dataset.
- Show upload status and validation errors.

### JSON Data Tab

Flow:

1. Create or select a JSON dataset version.
2. Select an existing `country_region` or enter a new one.
3. Upload multiple JSON files.
4. Store every uploaded file under the selected dataset and country/region.
5. Show country summaries for the dataset, such as `AU 120`, `US 95`, `KR 80`.
6. Let the admin repeat the upload flow with another country/region inside the same dataset.

Important behavior:

- The admin does not switch active data per country.
- One active JSON dataset can contain records for many countries.
- Search users switch country in the Explorer filter.

### Mapping Table Tab

Flow:

1. Create a Mapping Table dataset version.
2. Upload one Excel workbook.
3. Browser parses the workbook with the existing mapping normalization logic.
4. Admin sends normalized rows to the API.
5. Store rows in `mapping_rows`.
6. Show sheet count and row count.
7. Allow active dataset selection.

### String Resource Tab

Flow:

1. Create a String Resource dataset version.
2. Upload one or more Excel workbooks.
3. Browser parses workbooks with the existing String Resource normalization logic.
4. Admin sends normalized rows to the API.
5. Store rows in `string_resource_rows`.
6. Show workbook count, sheet count, resource row count, and detected locale qualifiers.
7. Allow active dataset selection.

## Search UX

### JSON Explorer

Filters:

- `Version`: defaults to the active JSON dataset.
- `Country/Region`: lists country values present in the selected dataset.

Search fields:

- `recognitionText`
- source filename
- `language`
- slot summary
- `contentType`
- `table_version`

Behavior:

- Changing country/region only changes the filter.
- It does not change the active dataset.
- Detail modal shows dataset version, country/region, metadata, and original JSON or raw text.

### Mapping Table Explorer

Filters:

- `Version`: defaults to the active Mapping Table dataset.

Behavior:

- Keep the current `GROUP INTENTIONS -> SLOT REFERENCE` workflow.
- Data source changes from bundled static JSON to DB API.
- The first implementation may fetch normalized rows for the selected dataset and reuse browser-side search helpers.
- Detail view can show `raw_row` later if needed.

### String Resource Explorer

Filters:

- `Version`: defaults to the active String Resource dataset.

Behavior:

- Keep content-first search.
- Keep resource ID search.
- Keep locale qualifier table columns and column visibility controls.
- Detail modal shows file, sheet, row number, resource ID, all locale values, and original row data.

## API Design

### Public APIs

Datasets:

- `GET /api/datasets?tool=json`
- `GET /api/datasets/active?tool=json`

JSON:

- `GET /api/json-countries?datasetId=...`
- `GET /api/json-records?datasetId=...&country=...&q=...&limit=...&offset=...`
- `GET /api/json-records/:id`

Mapping Table:

- `GET /api/mapping-rows?datasetId=...`
- Optional later: `GET /api/mapping-rows?datasetId=...&q=...`

String Resource:

- `GET /api/string-resource-locales?datasetId=...`
- `GET /api/string-resource-rows?datasetId=...&q=...&limit=...&offset=...`
- `GET /api/string-resource-rows/:id`

### Admin APIs

Datasets:

- `POST /api/admin/datasets`
- `PATCH /api/admin/datasets/:id/active`
- `DELETE /api/admin/datasets/:id`
- `GET /api/admin/datasets?tool=...`

Imports:

- `POST /api/admin/json-records/import`
  - body: `datasetId`, `countryRegion`, `files`
- `POST /api/admin/mapping-table/import`
  - body: `datasetId`, `rows`, `summary`
- `POST /api/admin/string-resources/import`
  - body: `datasetId`, `rows`, `summary`

All admin APIs require the admin key header.

## Data Flow

### JSON Import

1. Admin selects dataset and country/region.
2. Browser reads JSON files.
3. API receives file names and text.
4. Server parses or stores raw string using existing JSON behavior.
5. Server extracts searchable fields.
6. Server inserts records into `json_records` and extracted slot rows into `json_record_slots`.
7. Dataset metadata and counts are updated.

### Mapping Table Import

1. Admin creates dataset.
2. Browser parses Excel workbook using current mapping helpers.
3. Browser sends normalized rows to API.
4. Server validates dataset and row shape.
5. Server inserts rows into `mapping_rows`.
6. Dataset metadata stores source filename, sheet count, and row count.

### String Resource Import

1. Admin creates dataset.
2. Browser parses Excel workbooks using current String Resource helpers.
3. Browser sends normalized rows to API.
4. Server validates dataset and row shape.
5. Server inserts rows into `string_resource_rows`.
6. Dataset metadata stores locale list, workbook count, sheet count, and row count.

## Migration From Current JSON DB

Current tables:

- `json_import_batches`
- `json_records.batch_id`
- `json_record_slots`

Target:

- Replace `json_import_batches` with `datasets`.
- Rename or migrate `batch_id` usage to `dataset_id`.
- Keep `json_record_slots`.
- Add `country_region` to JSON records as required metadata.

For the first implementation, migration can be additive if production data is small:

1. Create `datasets`.
2. Add `dataset_id` and `country_region` to `json_records`.
3. Backfill any existing batch as one JSON dataset with `country_region = 'unknown'`.
4. Update APIs to read/write through `datasets`.
5. Later remove old `json_import_batches` references when no longer needed.

## Error Handling

- If `DATABASE_URL` is missing, APIs return `503`.
- If admin key is missing or invalid, admin APIs return `401`.
- Upload validation errors are reported per file or per row where practical.
- Dataset activation refuses deleted datasets.
- JSON import refuses missing `countryRegion`.
- Public search returns empty results when no active dataset exists, along with a clear message for the UI.
- Excel-derived imports should reject payloads that exceed agreed row or payload limits.

## Security

- Browser never receives `DATABASE_URL`.
- Admin key is sent only as a request header.
- API responses do not echo the admin key or database URL.
- Server logs should not print raw JSON, raw mapping rows, or raw string-resource rows.
- Public APIs return only data needed for search and detail views.
- Mutations remain admin-only.

## Testing Strategy

Add focused tests for:

- Dataset creation, active switching, and soft delete.
- Active dataset selection per tool.
- JSON country/region import and filtering.
- JSON duplicate handling using dataset, country/region, and content hash.
- Mapping row import and `GROUP INTENTIONS -> SLOT REFERENCE` search behavior from DB rows.
- String Resource row import, locale qualifier storage, and content-first search.
- Admin API authorization.
- Public API behavior when no active dataset exists.
- UI structure for admin tabs and search filters.

## Open Extension Points

- Team authentication can replace admin key checks later without changing the dataset model.
- Server-side Excel parsing can replace browser parsing if workbook size becomes a problem.
- Version diff and rollback can be added because older datasets are retained.
- JSON country auto-detection from folder or filename can be added later as an admin convenience.
