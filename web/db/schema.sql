create extension if not exists pgcrypto;

create table if not exists json_import_batches (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  description text not null default '',
  source_type text not null default 'admin_upload',
  record_count integer not null default 0,
  error_count integer not null default 0,
  created_at timestamptz not null default now(),
  deleted_at timestamptz
);

create table if not exists datasets (
  id uuid primary key default gen_random_uuid(),
  tool_type text not null check (tool_type in ('json', 'mapping_table', 'string_resource')),
  name text not null,
  description text not null default '',
  source_type text not null default 'admin_upload',
  is_active boolean not null default false,
  record_count integer not null default 0,
  error_count integer not null default 0,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  deleted_at timestamptz
);

create index if not exists datasets_tool_type_created_at_idx
  on datasets (tool_type, created_at desc)
  where deleted_at is null;

create unique index if not exists datasets_one_active_per_tool_idx
  on datasets (tool_type)
  where is_active = true and deleted_at is null;

create table if not exists json_records (
  id uuid primary key default gen_random_uuid(),
  batch_id uuid references json_import_batches(id) on delete set null,
  source_filename text not null default '',
  recognition_text text not null default '',
  language text not null default '',
  content_type text not null default '',
  table_version text not null default '',
  slot_summary text not null default '',
  raw_json jsonb,
  raw_text text not null default '',
  value_kind text not null default 'json' check (value_kind in ('json', 'raw-string')),
  content_hash text not null,
  created_at timestamptz not null default now(),
  deleted_at timestamptz
);

alter table json_records
  add column if not exists dataset_id uuid references datasets(id) on delete set null,
  add column if not exists country_region text not null default '';

create unique index if not exists json_records_active_dataset_country_content_hash_idx
  on json_records (
    coalesce(dataset_id, '00000000-0000-0000-0000-000000000000'::uuid),
    country_region,
    content_hash
  )
  where deleted_at is null;

drop index if exists json_records_active_content_hash_idx;

create index if not exists json_records_active_created_at_idx
  on json_records (created_at desc)
  where deleted_at is null;

create index if not exists json_records_active_content_type_idx
  on json_records (content_type)
  where deleted_at is null;

create index if not exists json_records_dataset_country_idx
  on json_records (dataset_id, country_region)
  where deleted_at is null;

create index if not exists json_records_active_search_idx
  on json_records using gin (
    to_tsvector(
      'simple',
      concat_ws(
        ' ',
        source_filename,
        recognition_text,
        language,
        content_type,
        table_version,
        slot_summary,
        raw_text
      )
    )
  )
  where deleted_at is null;

create table if not exists json_record_slots (
  id uuid primary key default gen_random_uuid(),
  record_id uuid not null references json_records(id) on delete cascade,
  slot_name text not null default '',
  slot_value text not null default '',
  slot_canonical text not null default '',
  created_at timestamptz not null default now()
);

create index if not exists json_record_slots_record_id_idx
  on json_record_slots (record_id);

create index if not exists json_record_slots_name_value_idx
  on json_record_slots (slot_name, slot_value);
