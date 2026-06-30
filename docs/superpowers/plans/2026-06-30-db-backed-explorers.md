# DB-Backed Explorers Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move JSON Explorer, Mapping Table Explorer, and String Resource Explorer from repeated local uploads to DB-managed active datasets with admin upload/version controls.

**Architecture:** Add a common `datasets` layer for version metadata and active selection, then store searchable rows in tool-specific tables. Public Explorer screens read selected datasets through Vercel/local APIs; `/admin` manages dataset creation, upload, activation, and soft delete through admin-key-protected APIs.

**Tech Stack:** Vanilla JS frontend, Node/Vercel server functions, Neon Postgres via `@neondatabase/serverless`, built-in `node:test`, existing SheetJS and JSON normalization helpers.

---

## File Structure

- Modify `web/db/schema.sql`
  - Add `datasets`, `mapping_rows`, and `string_resource_rows`.
  - Add `dataset_id` and `country_region` to JSON records.
  - Keep old JSON batch columns during migration compatibility.
- Create `web/api/datasets-repository.js`
  - Resolve DB URL and implement dataset CRUD, active switching, and dataset summaries.
- Create `web/api/datasets-core.js`
  - Fetch-style handlers for public and admin dataset APIs.
- Create `web/api/datasets.js`
  - Public dataset list route.
- Create `web/api/datasets/active.js`
  - Public active dataset route.
- Create `web/api/admin/datasets.js`
  - Admin dataset create/list route.
- Create `web/api/admin/datasets/[id].js`
  - Admin dataset soft delete route.
- Create `web/api/admin/datasets/[id]/active.js`
  - Admin active dataset route.
- Modify `web/api/json-records-core.js`
  - Replace batch import payload with dataset/country import payload.
  - Add dataset and country query parsing.
- Modify `web/api/json-records-repository.js`
  - Read/write JSON records through `dataset_id` and `country_region`.
  - Keep old batch delete compatibility only if existing admin UI still calls it.
- Create `web/api/mapping-table-core.js`
  - Validate/import normalized mapping rows and serve rows by dataset.
- Create `web/api/mapping-table-repository.js`
  - Insert/search `mapping_rows`.
- Create `web/api/mapping-rows.js`
  - Public mapping rows route.
- Create `web/api/admin/mapping-table/import.js`
  - Admin mapping import route.
- Create `web/api/string-resources-core.js`
  - Validate/import normalized string resource rows and serve rows/locales by dataset.
- Create `web/api/string-resources-repository.js`
  - Insert/search `string_resource_rows`.
- Create `web/api/string-resource-rows.js`
  - Public string resource rows route.
- Create `web/api/string-resource-locales.js`
  - Public locale list route.
- Create `web/api/string-resource-rows/[id].js`
  - Public string resource detail route.
- Create `web/api/admin/string-resources/import.js`
  - Admin string resource import route.
- Modify `web/server.js`
  - Route all new APIs in local development.
- Modify `web/public/app.js`
  - Add dataset filters in Explorer screens.
  - Add Admin tabs and upload flows.
- Create `web/public/mapping-table-xlsx.js`
  - Parse uploaded Mapping Table Excel files into the workbook shape consumed by `normalizeMappingWorkbook`.
- Modify `web/public/index.html`
  - Add admin dataset controls and Explorer filters.
- Modify `web/public/styles.css`
  - Style admin tabs, dataset lists, filters, and summaries.
- Modify tests:
  - `web/tests/datasets-api.test.js`
  - `web/tests/datasets-repository.test.js`
  - `web/tests/json-records-api.test.js`
  - `web/tests/json-records-repository.test.js`
  - `web/tests/mapping-table-api.test.js`
  - `web/tests/mapping-table-repository.test.js`
  - `web/tests/string-resources-api.test.js`
  - `web/tests/string-resources-repository.test.js`
  - `web/tests/server.test.js`
  - `web/tests/ui-structure.test.js`

## Implementation Tasks

### Task 1: Dataset Schema And Repository

**Files:**
- Modify: `web/db/schema.sql`
- Create: `web/api/datasets-repository.js`
- Test: `web/tests/datasets-repository.test.js`

- [ ] **Step 1: Write failing repository tests**

Create `web/tests/datasets-repository.test.js`:

```js
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  createDatasetsRepository,
  resolveDatabaseUrl
} from '../api/datasets-repository.js';

describe('datasets repository', () => {
  it('resolves database url from supported env vars', () => {
    assert.equal(resolveDatabaseUrl({ DATABASE_URL: 'postgres://main' }), 'postgres://main');
    assert.equal(resolveDatabaseUrl({ POSTGRES_URL: 'postgres://fallback' }), 'postgres://fallback');
    assert.equal(resolveDatabaseUrl({}), '');
  });

  it('creates datasets with parameterized SQL', async () => {
    const calls = [];
    const sql = {
      async query(text, params = []) {
        calls.push({ text, params });
        return [{
          id: 'dataset-1',
          tool_type: params[0],
          name: params[1],
          description: params[2],
          is_active: false,
          record_count: 0,
          error_count: 0,
          metadata: {},
          created_at: '2026-06-30T00:00:00.000Z'
        }];
      }
    };
    const repository = createDatasetsRepository(sql);
    const dataset = await repository.createDataset({
      description: 'June JSON logs',
      name: '2026-06-30 logs',
      toolType: 'json'
    });

    assert.equal(dataset.id, 'dataset-1');
    assert.equal(dataset.toolType, 'json');
    assert.match(calls[0].text, /insert into datasets/);
    assert.deepEqual(calls[0].params, ['json', '2026-06-30 logs', 'June JSON logs', 'admin_upload', '{}']);
  });

  it('sets one active dataset per tool in a transaction-shaped call sequence', async () => {
    const calls = [];
    const sql = {
      async query(text, params = []) {
        calls.push({ text, params });
        if (text.includes('select tool_type')) {
          return [{ tool_type: 'json' }];
        }
        if (text.includes('update datasets') && text.includes('is_active = false')) {
          return [];
        }
        if (text.includes('update datasets') && text.includes('is_active = true')) {
          return [{
            id: params[0],
            tool_type: 'json',
            name: 'Active JSON',
            description: '',
            is_active: true,
            record_count: 12,
            error_count: 0,
            metadata: {},
            created_at: '2026-06-30T00:00:00.000Z'
          }];
        }
        return [];
      }
    };
    const repository = createDatasetsRepository(sql);
    const dataset = await repository.setActiveDataset('dataset-1');

    assert.equal(dataset.isActive, true);
    assert.match(calls[0].text, /select tool_type/);
    assert.match(calls[1].text, /is_active = false/);
    assert.match(calls[2].text, /is_active = true/);
  });
});
```

- [ ] **Step 2: Run the failing test**

Run:

```powershell
node --test tests\datasets-repository.test.js
```

Expected: fail with `Cannot find module '../api/datasets-repository.js'`.

- [ ] **Step 3: Update schema**

Modify `web/db/schema.sql` by adding the new common table before `json_records`:

```sql
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
```

Add migration-friendly JSON columns:

```sql
alter table json_records
  add column if not exists dataset_id uuid references datasets(id) on delete set null,
  add column if not exists country_region text not null default '';

create index if not exists json_records_dataset_country_idx
  on json_records (dataset_id, country_region)
  where deleted_at is null;
```

- [ ] **Step 4: Implement dataset repository**

Create `web/api/datasets-repository.js`:

```js
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
```

- [ ] **Step 5: Run repository tests**

Run:

```powershell
node --test tests\datasets-repository.test.js
```

Expected: pass.

- [ ] **Step 6: Commit**

Run:

```powershell
git add web\db\schema.sql web\api\datasets-repository.js web\tests\datasets-repository.test.js
git commit -m "feat: add dataset repository"
```

### Task 2: Dataset Public And Admin API Handlers

**Files:**
- Create: `web/api/datasets-core.js`
- Create: `web/api/datasets.js`
- Create: `web/api/datasets/active.js`
- Create: `web/api/admin/datasets.js`
- Create: `web/api/admin/datasets/[id].js`
- Create: `web/api/admin/datasets/[id]/active.js`
- Modify: `web/server.js`
- Test: `web/tests/datasets-api.test.js`
- Test: `web/tests/server.test.js`

- [ ] **Step 1: Write failing handler tests**

Create `web/tests/datasets-api.test.js`:

```js
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  handleActiveDatasetRequest,
  handleAdminDatasetActiveRequest,
  handleAdminDatasetDeleteRequest,
  handleAdminDatasetsRequest,
  handleDatasetsRequest
} from '../api/datasets-core.js';

describe('datasets API handlers', () => {
  it('lists public datasets by tool', async () => {
    const repository = {
      async listDatasets(toolType) {
        assert.equal(toolType, 'json');
        return [{ id: 'dataset-1', name: 'June logs', toolType: 'json', isActive: true }];
      }
    };
    const response = await handleDatasetsRequest(
      new Request('https://example.com/api/datasets?tool=json'),
      { repository }
    );
    const body = await response.json();
    assert.equal(response.status, 200);
    assert.equal(body.datasets[0].id, 'dataset-1');
  });

  it('returns the active dataset for a tool', async () => {
    const repository = {
      async getActiveDataset(toolType) {
        assert.equal(toolType, 'mapping_table');
        return { id: 'mapping-1', name: 'v3.3.19', toolType };
      }
    };
    const response = await handleActiveDatasetRequest(
      new Request('https://example.com/api/datasets/active?tool=mapping_table'),
      { repository }
    );
    const body = await response.json();
    assert.equal(response.status, 200);
    assert.equal(body.dataset.id, 'mapping-1');
  });

  it('creates an admin dataset when admin key is valid', async () => {
    const repository = {
      async createDataset(payload) {
        assert.deepEqual(payload, {
          description: 'Logs',
          metadata: {},
          name: 'June',
          toolType: 'json'
        });
        return { id: 'dataset-1', name: 'June', toolType: 'json' };
      }
    };
    const response = await handleAdminDatasetsRequest(new Request('https://example.com/api/admin/datasets', {
      body: JSON.stringify({ description: 'Logs', name: 'June', toolType: 'json' }),
      headers: { 'x-admin-key': 'secret' },
      method: 'POST'
    }), {
      env: { JSON_ADMIN_KEY: 'secret' },
      repository
    });
    const body = await response.json();
    assert.equal(response.status, 200);
    assert.equal(body.dataset.id, 'dataset-1');
  });

  it('protects dataset active and delete mutations', async () => {
    const calls = [];
    const repository = {
      async deleteDataset(id) {
        calls.push(['delete', id]);
        return { deletedCount: 1 };
      },
      async setActiveDataset(id) {
        calls.push(['active', id]);
        return { id, isActive: true };
      }
    };
    const options = { env: { JSON_ADMIN_KEY: 'secret' }, repository };
    const headers = { 'x-admin-key': 'secret' };

    const activeResponse = await handleAdminDatasetActiveRequest(
      new Request('https://example.com/api/admin/datasets/dataset-1/active', { headers, method: 'PATCH' }),
      { ...options, id: 'dataset-1' }
    );
    const deleteResponse = await handleAdminDatasetDeleteRequest(
      new Request('https://example.com/api/admin/datasets/dataset-1', { headers, method: 'DELETE' }),
      { ...options, id: 'dataset-1' }
    );

    assert.equal(activeResponse.status, 200);
    assert.equal(deleteResponse.status, 200);
    assert.deepEqual(calls, [['active', 'dataset-1'], ['delete', 'dataset-1']]);
  });
});
```

- [ ] **Step 2: Run the failing test**

Run:

```powershell
node --test tests\datasets-api.test.js
```

Expected: fail with `Cannot find module '../api/datasets-core.js'`.

- [ ] **Step 3: Implement dataset handlers**

Create `web/api/datasets-core.js` with:

```js
const DEFAULT_ADMIN_KEY = '1313';
const TOOL_TYPES = new Set(['json', 'mapping_table', 'string_resource']);

export async function handleDatasetsRequest(request, { repository } = {}) {
  if (request.method !== 'GET') {
    return jsonResponse({ error: 'Method not allowed.' }, 405);
  }
  const repo = ensureRepository(repository);
  if (repo instanceof Response) {
    return repo;
  }
  const toolType = readToolType(request);
  if (!toolType) {
    return jsonResponse({ error: 'Invalid tool type.' }, 400);
  }
  return jsonResponse({ datasets: await repo.listDatasets(toolType) });
}

export async function handleActiveDatasetRequest(request, { repository } = {}) {
  if (request.method !== 'GET') {
    return jsonResponse({ error: 'Method not allowed.' }, 405);
  }
  const repo = ensureRepository(repository);
  if (repo instanceof Response) {
    return repo;
  }
  const toolType = readToolType(request);
  if (!toolType) {
    return jsonResponse({ error: 'Invalid tool type.' }, 400);
  }
  const dataset = await repo.getActiveDataset(toolType);
  return jsonResponse({ dataset: dataset ?? null });
}

export async function handleAdminDatasetsRequest(request, { env = process.env, repository } = {}) {
  const adminError = requireAdminKey(request, env);
  if (adminError) {
    return adminError;
  }
  const repo = ensureRepository(repository);
  if (repo instanceof Response) {
    return repo;
  }
  if (request.method === 'GET') {
    const toolType = readToolType(request);
    if (!toolType) {
      return jsonResponse({ error: 'Invalid tool type.' }, 400);
    }
    return jsonResponse({ datasets: await repo.listDatasets(toolType) });
  }
  if (request.method !== 'POST') {
    return jsonResponse({ error: 'Method not allowed.' }, 405);
  }
  const payload = await readRequestJson(request);
  const toolType = sanitizeToolType(payload.toolType);
  const name = String(payload.name ?? '').trim();
  if (!toolType) {
    return jsonResponse({ error: 'Invalid tool type.' }, 400);
  }
  if (!name) {
    return jsonResponse({ error: 'Dataset name is required.' }, 400);
  }
  const dataset = await repo.createDataset({
    description: String(payload.description ?? '').trim(),
    metadata: payload.metadata && typeof payload.metadata === 'object' ? payload.metadata : {},
    name,
    toolType
  });
  return jsonResponse({ dataset });
}

export async function handleAdminDatasetActiveRequest(request, { env = process.env, id, repository } = {}) {
  const adminError = requireAdminKey(request, env);
  if (adminError) {
    return adminError;
  }
  if (request.method !== 'PATCH' && request.method !== 'POST') {
    return jsonResponse({ error: 'Method not allowed.' }, 405);
  }
  const repo = ensureRepository(repository);
  if (repo instanceof Response) {
    return repo;
  }
  const dataset = await repo.setActiveDataset(id);
  if (!dataset) {
    return jsonResponse({ error: 'Dataset not found.' }, 404);
  }
  return jsonResponse({ dataset });
}

export async function handleAdminDatasetDeleteRequest(request, { env = process.env, id, repository } = {}) {
  const adminError = requireAdminKey(request, env);
  if (adminError) {
    return adminError;
  }
  if (request.method !== 'DELETE') {
    return jsonResponse({ error: 'Method not allowed.' }, 405);
  }
  const repo = ensureRepository(repository);
  if (repo instanceof Response) {
    return repo;
  }
  return jsonResponse(await repo.deleteDataset(id));
}

function readToolType(request) {
  return sanitizeToolType(new URL(request.url).searchParams.get('tool'));
}

function sanitizeToolType(value) {
  const toolType = String(value ?? '').trim();
  return TOOL_TYPES.has(toolType) ? toolType : '';
}

export function jsonResponse(payload, status = 200) {
  return new Response(JSON.stringify(payload), {
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
    status
  });
}

function requireAdminKey(request, env) {
  const configuredKey = String(env?.JSON_ADMIN_KEY ?? DEFAULT_ADMIN_KEY).trim();
  const providedKey = String(
    request.headers.get('x-admin-key') ??
    request.headers.get('authorization')?.replace(/^Bearer\s+/i, '') ??
    ''
  ).trim();
  return providedKey === configuredKey ? undefined : jsonResponse({ error: 'Unauthorized.' }, 401);
}

function ensureRepository(repository) {
  return repository ?? jsonResponse({ error: 'DATABASE_URL is not configured.' }, 503);
}

async function readRequestJson(request) {
  const text = await request.text();
  return text.trim() ? JSON.parse(text) : {};
}
```

- [ ] **Step 4: Add Vercel route files**

Create each route file with the same import pattern used by existing API routes.

`web/api/datasets.js`:

```js
import { handleDatasetsRequest } from './datasets-core.js';
import { getDatasetsRepository } from './datasets-repository.js';
import { nodeHandler } from './vercel-node-adapter.js';

export default nodeHandler((request) => handleDatasetsRequest(request, {
  repository: getDatasetsRepository()
}));
```

`web/api/datasets/active.js`:

```js
import { handleActiveDatasetRequest } from '../datasets-core.js';
import { getDatasetsRepository } from '../datasets-repository.js';
import { nodeHandler } from '../vercel-node-adapter.js';

export default nodeHandler((request) => handleActiveDatasetRequest(request, {
  repository: getDatasetsRepository()
}));
```

`web/api/admin/datasets.js`:

```js
import { handleAdminDatasetsRequest } from '../datasets-core.js';
import { getDatasetsRepository } from '../datasets-repository.js';
import { nodeHandler } from '../vercel-node-adapter.js';

export default nodeHandler((request) => handleAdminDatasetsRequest(request, {
  repository: getDatasetsRepository()
}));
```

`web/api/admin/datasets/[id].js`:

```js
import { handleAdminDatasetDeleteRequest } from '../../datasets-core.js';
import { getDatasetsRepository } from '../../datasets-repository.js';
import { nodeHandler } from '../../vercel-node-adapter.js';

export default nodeHandler((request, { id }) => handleAdminDatasetDeleteRequest(request, {
  id,
  repository: getDatasetsRepository()
}));
```

`web/api/admin/datasets/[id]/active.js`:

```js
import { handleAdminDatasetActiveRequest } from '../../../datasets-core.js';
import { getDatasetsRepository } from '../../../datasets-repository.js';
import { nodeHandler } from '../../../vercel-node-adapter.js';

export default nodeHandler((request, { id }) => handleAdminDatasetActiveRequest(request, {
  id,
  repository: getDatasetsRepository()
}));
```

- [ ] **Step 5: Run handler tests**

Run:

```powershell
node --test tests\datasets-api.test.js
```

Expected: pass.

- [ ] **Step 6: Update local server routes and test**

Modify `web/server.js` by importing dataset handlers/repository and routing:

```js
import {
  handleActiveDatasetRequest,
  handleAdminDatasetActiveRequest,
  handleAdminDatasetDeleteRequest,
  handleAdminDatasetsRequest,
  handleDatasetsRequest
} from './api/datasets-core.js';
import { getDatasetsRepository } from './api/datasets-repository.js';
```

Add routing branches before static file handling:

```js
if (pathname === '/api/datasets') {
  return sendFetchResponse(response, await handleDatasetsRequest(request, {
    repository: await getDatasetsRepository()
  }));
}
if (pathname === '/api/datasets/active') {
  return sendFetchResponse(response, await handleActiveDatasetRequest(request, {
    repository: await getDatasetsRepository()
  }));
}
if (pathname === '/api/admin/datasets') {
  return sendFetchResponse(response, await handleAdminDatasetsRequest(request, {
    repository: await getDatasetsRepository()
  }));
}
const datasetActiveMatch = pathname.match(/^\/api\/admin\/datasets\/([^/]+)\/active$/);
if (datasetActiveMatch) {
  return sendFetchResponse(response, await handleAdminDatasetActiveRequest(request, {
    id: decodeURIComponent(datasetActiveMatch[1]),
    repository: await getDatasetsRepository()
  }));
}
const datasetDeleteMatch = pathname.match(/^\/api\/admin\/datasets\/([^/]+)$/);
if (datasetDeleteMatch) {
  return sendFetchResponse(response, await handleAdminDatasetDeleteRequest(request, {
    id: decodeURIComponent(datasetDeleteMatch[1]),
    repository: await getDatasetsRepository()
  }));
}
```

Run:

```powershell
node --test tests\server.test.js
```

Expected: pass.

- [ ] **Step 7: Commit**

Run:

```powershell
git add web\api\datasets-core.js web\api\datasets-repository.js web\api\datasets.js web\api\datasets web\api\admin\datasets.js web\api\admin\datasets web\server.js web\tests\datasets-api.test.js web\tests\server.test.js
git commit -m "feat: add dataset APIs"
```

### Task 3: JSON Records Dataset And Country Support

**Files:**
- Modify: `web/api/json-records-core.js`
- Modify: `web/api/json-records-repository.js`
- Modify: `web/api/json-records.js`
- Modify: `web/api/admin/json-records/import.js`
- Create: `web/api/json-countries.js`
- Test: `web/tests/json-records-api.test.js`
- Test: `web/tests/json-records-repository.test.js`

- [ ] **Step 1: Add failing API tests for dataset/country import**

Append to `web/tests/json-records-api.test.js`:

```js
it('requires countryRegion for JSON admin imports', async () => {
  const response = await handleAdminImportRequest(new Request('https://example.com/api/admin/json-records/import', {
    body: JSON.stringify({
      datasetId: 'dataset-1',
      files: [{ filename: 'a.json', text: '{"recognitionText":"A"}' }]
    }),
    headers: { 'x-admin-key': 'secret' },
    method: 'POST'
  }), {
    env: { JSON_ADMIN_KEY: 'secret' },
    repository: { async importRecords() { throw new Error('not expected'); } }
  });
  const body = await response.json();

  assert.equal(response.status, 400);
  assert.match(body.error, /countryRegion/);
});

it('imports JSON files into a dataset country', async () => {
  const repository = {
    async importRecords(payload) {
      assert.equal(payload.datasetId, 'dataset-1');
      assert.equal(payload.countryRegion, 'AU');
      assert.equal(payload.records[0].countryRegion, 'AU');
      return { insertedCount: 1, skippedCount: 0 };
    }
  };
  const response = await handleAdminImportRequest(new Request('https://example.com/api/admin/json-records/import', {
    body: JSON.stringify({
      countryRegion: 'AU',
      datasetId: 'dataset-1',
      files: [{ filename: 'a.json', text: '{"recognitionText":"A"}' }]
    }),
    headers: { 'x-admin-key': 'secret' },
    method: 'POST'
  }), {
    env: { JSON_ADMIN_KEY: 'secret' },
    repository
  });

  assert.equal(response.status, 200);
});

it('passes dataset and country filters to public search', async () => {
  const repository = {
    async searchRecords(params) {
      assert.equal(params.datasetId, 'dataset-1');
      assert.equal(params.countryRegion, 'AU');
      assert.equal(params.query, 'weather');
      return { records: [], total: 0 };
    }
  };
  const response = await handleJsonRecordsRequest(
    new Request('https://example.com/api/json-records?datasetId=dataset-1&country=AU&q=weather'),
    { repository }
  );

  assert.equal(response.status, 200);
});
```

- [ ] **Step 2: Add failing repository tests**

Append to `web/tests/json-records-repository.test.js`:

```js
it('imports JSON records with dataset and country columns', async () => {
  const calls = [];
  const sql = {
    async query(text, params = []) {
      calls.push({ text, params });
      if (text.includes('insert into json_records')) {
        return [{ id: 'record-1' }];
      }
      if (text.includes('update datasets')) {
        return [];
      }
      return [];
    }
  };
  const repository = createJsonRecordsRepository(sql);
  const result = await repository.importRecords({
    countryRegion: 'AU',
    datasetId: 'dataset-1',
    records: [{
      contentHash: 'hash-1',
      contentType: 'Weather',
      countryRegion: 'AU',
      language: 'en_AU',
      rawJson: { recognitionText: 'Weather' },
      rawText: '',
      recognitionText: 'Weather',
      slotSummary: '',
      sourceFilename: 'weather.json',
      tableVersion: '3.3.21',
      valueKind: 'json'
    }]
  });

  assert.equal(result.insertedCount, 1);
  assert.equal(calls[0].params[0], 'dataset-1');
  assert.equal(calls[0].params[1], 'AU');
});
```

- [ ] **Step 3: Run failing JSON tests**

Run:

```powershell
node --test tests\json-records-api.test.js tests\json-records-repository.test.js
```

Expected: fail because `countryRegion` and `datasetId` are not yet handled.

- [ ] **Step 4: Update JSON core normalization**

Modify `web/api/json-records-core.js`:

```js
export function buildJsonRecordFromUpload({ countryRegion = '', filename = '', language = '', text = '' } = {}) {
  const sourceFilename = sanitizeSourceFilename(filename);
  const sourceText = String(text ?? '');
  const selectedLanguage = sanitizeImportLanguage(language);
  const selectedCountryRegion = sanitizeCountryRegion(countryRegion);
  const parsed = parseUploadedJsonContent(sourceFilename, sourceText);
  const explorerItem = createExplorerItem({
    id: 1,
    sourceFilename,
    value: parsed.value,
    valueKind: parsed.valueKind,
    warning: parsed.warning ?? ''
  });
  const valueKind = parsed.valueKind === 'raw-string' ? 'raw-string' : 'json';
  const rawJson = valueKind === 'json' ? parsed.value : null;
  const rawText = valueKind === 'raw-string' ? sourceText : '';
  const resolvedLanguage = selectedLanguage || explorerItem.language;
  const hashSource = valueKind === 'json' ? JSON.stringify(parsed.value) : sourceText;

  return {
    contentHash: sha256(JSON.stringify({
      countryRegion: selectedCountryRegion,
      datasetScopedValue: hashSource
    })),
    contentType: explorerItem.contentType,
    countryRegion: selectedCountryRegion,
    language: resolvedLanguage,
    rawJson,
    rawText,
    recognitionText: explorerItem.recognitionText,
    slotSummary: explorerItem.slotSummary,
    sourceFilename,
    tableVersion: explorerItem.tableVersion,
    valueKind,
    warning: parsed.warning ?? ''
  };
}
```

Update `normalizeJsonImportPayload`:

```js
export function normalizeJsonImportPayload(payload = {}) {
  const files = Array.isArray(payload.files) ? payload.files : [];
  const datasetId = String(payload.datasetId ?? '').trim();
  const countryRegion = sanitizeCountryRegion(payload.countryRegion);
  const language = sanitizeImportLanguage(payload.language);
  if (!datasetId) {
    throw httpError(400, 'datasetId is required.');
  }
  if (!countryRegion) {
    throw httpError(400, 'countryRegion is required.');
  }
  if (files.length === 0) {
    throw httpError(400, '업로드할 JSON 파일이 없습니다.');
  }
  if (files.length > MAX_IMPORT_FILES) {
    throw httpError(413, `한 번에 최대 ${MAX_IMPORT_FILES}개 파일까지 업로드할 수 있습니다.`);
  }

  const records = files.map((file, index) => {
    const filename = sanitizeSourceFilename(file?.filename || `upload_${index + 1}.json`);
    const text = String(file?.text ?? '');
    if (byteLength(text) > MAX_IMPORT_FILE_BYTES) {
      throw httpError(413, `${filename}: 파일 크기가 너무 큽니다.`);
    }
    return buildJsonRecordFromUpload({ countryRegion, filename, language, text });
  });

  return { countryRegion, datasetId, records };
}
```

Add:

```js
function sanitizeCountryRegion(countryRegion) {
  return String(countryRegion ?? '').trim().slice(0, 64);
}
```

Update `handleJsonRecordsRequest` query parsing:

```js
const datasetId = url.searchParams.get('datasetId') ?? '';
const countryRegion = url.searchParams.get('country') ?? url.searchParams.get('countryRegion') ?? '';
const result = await repo.searchRecords({ countryRegion, datasetId, limit, offset, query });
```

- [ ] **Step 5: Update JSON repository SQL**

Modify `web/api/json-records-repository.js` import query to insert:

```sql
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
```

Use params:

```js
[
  datasetId,
  record.countryRegion,
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
]
```

Update `searchRecords` WHERE:

```sql
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
```

Use params:

```js
[datasetId, countryRegion, trimmedQuery, pattern, limit, offset]
```

Add repository method:

```js
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
```

- [ ] **Step 6: Add JSON countries handler and route**

In `web/api/json-records-core.js`, add:

```js
export async function handleJsonCountriesRequest(request, { repository } = {}) {
  if (request.method !== 'GET') {
    return jsonResponse({ error: 'Method not allowed.' }, 405);
  }
  const repo = ensureRepository(repository);
  if (repo instanceof Response) {
    return repo;
  }
  const datasetId = new URL(request.url).searchParams.get('datasetId') ?? '';
  if (!datasetId) {
    return jsonResponse({ error: 'datasetId is required.' }, 400);
  }
  return jsonResponse({ countries: await repo.listCountries(datasetId) });
}
```

Create `web/api/json-countries.js`:

```js
import { handleJsonCountriesRequest } from './json-records-core.js';
import { getJsonRecordsRepository } from './json-records-repository.js';
import { nodeHandler } from './vercel-node-adapter.js';

export default nodeHandler((request) => handleJsonCountriesRequest(request, {
  repository: getJsonRecordsRepository()
}));
```

- [ ] **Step 7: Run JSON tests**

Run:

```powershell
node --test tests\json-records-api.test.js tests\json-records-repository.test.js
```

Expected: pass.

- [ ] **Step 8: Commit**

Run:

```powershell
git add web\api\json-records-core.js web\api\json-records-repository.js web\api\json-countries.js web\tests\json-records-api.test.js web\tests\json-records-repository.test.js
git commit -m "feat: add json dataset country support"
```

### Task 4: Mapping Table DB Import And Public Rows API

**Files:**
- Modify: `web/db/schema.sql`
- Create: `web/api/mapping-table-core.js`
- Create: `web/api/mapping-table-repository.js`
- Create: `web/api/mapping-rows.js`
- Create: `web/api/admin/mapping-table/import.js`
- Modify: `web/server.js`
- Test: `web/tests/mapping-table-api.test.js`
- Test: `web/tests/mapping-table-repository.test.js`

- [ ] **Step 1: Write failing mapping repository tests**

Create `web/tests/mapping-table-repository.test.js`:

```js
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createMappingTableRepository } from '../api/mapping-table-repository.js';

describe('mapping table repository', () => {
  it('imports normalized mapping rows for a dataset', async () => {
    const calls = [];
    const sql = {
      async query(text, params = []) {
        calls.push({ text, params });
        if (text.includes('insert into mapping_rows')) {
          return [{ id: 'row-1' }];
        }
        if (text.includes('update datasets')) {
          return [];
        }
        return [];
      }
    };
    const repository = createMappingTableRepository(sql);
    const result = await repository.importRows({
      datasetId: 'dataset-1',
      rows: [{
        domainText: 'weather',
        intentionText: 'lookup',
        mappingIntent: 'Weather',
        primaryText: 'What is the weather',
        rowNumber: 2,
        sheetName: 'GROUP INTENTIONS',
        slotText: 'location',
        sourceFilename: 'mapping.xlsx',
        utteranceText: 'What is the weather',
        values: { Intention: 'lookup' }
      }],
      summary: { rowCount: 1, sheetCount: 1 }
    });

    assert.equal(result.insertedCount, 1);
    assert.equal(calls[0].params[0], 'dataset-1');
    assert.equal(calls[0].params[2], 'GROUP INTENTIONS');
  });
});
```

- [ ] **Step 2: Write failing mapping API tests**

Create `web/tests/mapping-table-api.test.js`:

```js
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  handleAdminMappingImportRequest,
  handleMappingRowsRequest
} from '../api/mapping-table-core.js';

describe('mapping table API handlers', () => {
  it('serves mapping rows by dataset', async () => {
    const repository = {
      async listRows(datasetId) {
        assert.equal(datasetId, 'dataset-1');
        return [{ id: 'row-1', sheetName: 'GROUP INTENTIONS' }];
      }
    };
    const response = await handleMappingRowsRequest(
      new Request('https://example.com/api/mapping-rows?datasetId=dataset-1'),
      { repository }
    );
    const body = await response.json();

    assert.equal(response.status, 200);
    assert.equal(body.rows[0].id, 'row-1');
  });

  it('imports mapping rows with an admin key', async () => {
    const repository = {
      async importRows(payload) {
        assert.equal(payload.datasetId, 'dataset-1');
        assert.equal(payload.rows.length, 1);
        return { insertedCount: 1 };
      }
    };
    const response = await handleAdminMappingImportRequest(new Request('https://example.com/api/admin/mapping-table/import', {
      body: JSON.stringify({
        datasetId: 'dataset-1',
        rows: [{ rowNumber: 2, sheetName: 'GROUP INTENTIONS', values: {} }],
        summary: { rowCount: 1, sheetCount: 1 }
      }),
      headers: { 'x-admin-key': 'secret' },
      method: 'POST'
    }), {
      env: { JSON_ADMIN_KEY: 'secret' },
      repository
    });

    assert.equal(response.status, 200);
  });
});
```

- [ ] **Step 3: Run failing mapping tests**

Run:

```powershell
node --test tests\mapping-table-api.test.js tests\mapping-table-repository.test.js
```

Expected: fail because mapping API/repository files do not exist.

- [ ] **Step 4: Add mapping schema**

Append to `web/db/schema.sql`:

```sql
create table if not exists mapping_rows (
  id uuid primary key default gen_random_uuid(),
  dataset_id uuid not null references datasets(id) on delete cascade,
  source_filename text not null default '',
  sheet_name text not null default '',
  row_number integer not null,
  domain text not null default '',
  intention text not null default '',
  mapping_intent text not null default '',
  slot_text text not null default '',
  utterance_text text not null default '',
  primary_text text not null default '',
  raw_row jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  deleted_at timestamptz
);

create index if not exists mapping_rows_dataset_sheet_idx
  on mapping_rows (dataset_id, sheet_name)
  where deleted_at is null;

create index if not exists mapping_rows_search_idx
  on mapping_rows using gin (
    to_tsvector('simple', concat_ws(' ', domain, intention, mapping_intent, slot_text, utterance_text, primary_text, raw_row::text))
  )
  where deleted_at is null;
```

- [ ] **Step 5: Implement mapping repository**

Create `web/api/mapping-table-repository.js`:

```js
let cachedSql;
let cachedDatabaseUrl = '';

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
    async importRows({ datasetId, rows, summary = {} }) {
      let insertedCount = 0;
      for (const row of rows) {
        const insertedRows = await sql.query(`
          insert into mapping_rows (
            dataset_id, source_filename, sheet_name, row_number,
            domain, intention, mapping_intent, slot_text, utterance_text, primary_text, raw_row
          )
          values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11::jsonb)
          returning id
        `, [
          datasetId,
          row.sourceFilename ?? '',
          row.sheetName ?? '',
          Number(row.rowNumber) || 0,
          row.domainText ?? row.domain ?? '',
          row.intentionText ?? row.intention ?? '',
          row.mappingIntent ?? '',
          row.slotText ?? '',
          row.utteranceText ?? row.values?.['발화 패턴'] ?? '',
          row.primaryText ?? '',
          JSON.stringify(row.values ?? row.rawRow ?? {})
        ]);
        insertedCount += insertedRows.length;
      }
      await sql.query(`
        update datasets
        set record_count = $2,
            metadata = $3::jsonb
        where id = $1
      `, [datasetId, insertedCount, JSON.stringify(summary)]);
      return { insertedCount };
    },

    async listRows(datasetId) {
      const rows = await sql.query(`
        select id, dataset_id, source_filename, sheet_name, row_number,
               domain, intention, mapping_intent, slot_text, utterance_text, primary_text, raw_row
        from mapping_rows
        where dataset_id = $1::uuid
          and deleted_at is null
        order by sheet_name asc, row_number asc
      `, [datasetId]);
      return rows.map(normalizeMappingRow);
    }
  };
}

function normalizeMappingRow(row = {}) {
  return {
    datasetId: row.dataset_id ?? row.datasetId ?? '',
    domainText: row.domain ?? row.domainText ?? '',
    id: row.id ?? '',
    intentionText: row.intention ?? row.intentionText ?? '',
    mappingIntent: row.mapping_intent ?? row.mappingIntent ?? '',
    primaryText: row.primary_text ?? row.primaryText ?? '',
    rowNumber: Number(row.row_number ?? row.rowNumber ?? 0),
    sheetName: row.sheet_name ?? row.sheetName ?? '',
    slotText: row.slot_text ?? row.slotText ?? '',
    sourceFilename: row.source_filename ?? row.sourceFilename ?? '',
    utteranceText: row.utterance_text ?? row.utteranceText ?? '',
    values: row.raw_row ?? row.values ?? {}
  };
}
```

- [ ] **Step 6: Implement mapping API core and routes**

Create `web/api/mapping-table-core.js`:

```js
const DEFAULT_ADMIN_KEY = '1313';

export async function handleMappingRowsRequest(request, { repository } = {}) {
  if (request.method !== 'GET') {
    return jsonResponse({ error: 'Method not allowed.' }, 405);
  }
  const repo = ensureRepository(repository);
  if (repo instanceof Response) {
    return repo;
  }
  const datasetId = new URL(request.url).searchParams.get('datasetId') ?? '';
  if (!datasetId) {
    return jsonResponse({ error: 'datasetId is required.' }, 400);
  }
  return jsonResponse({ rows: await repo.listRows(datasetId) });
}

export async function handleAdminMappingImportRequest(request, { env = process.env, repository } = {}) {
  const adminError = requireAdminKey(request, env);
  if (adminError) {
    return adminError;
  }
  if (request.method !== 'POST') {
    return jsonResponse({ error: 'Method not allowed.' }, 405);
  }
  const repo = ensureRepository(repository);
  if (repo instanceof Response) {
    return repo;
  }
  const payload = await readRequestJson(request);
  const datasetId = String(payload.datasetId ?? '').trim();
  const rows = Array.isArray(payload.rows) ? payload.rows : [];
  if (!datasetId) {
    return jsonResponse({ error: 'datasetId is required.' }, 400);
  }
  if (rows.length === 0) {
    return jsonResponse({ error: 'mapping rows are required.' }, 400);
  }
  return jsonResponse(await repo.importRows({
    datasetId,
    rows,
    summary: payload.summary && typeof payload.summary === 'object' ? payload.summary : {}
  }));
}

function jsonResponse(payload, status = 200) {
  return new Response(JSON.stringify(payload), {
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
    status
  });
}

function requireAdminKey(request, env) {
  const configuredKey = String(env?.JSON_ADMIN_KEY ?? DEFAULT_ADMIN_KEY).trim();
  const providedKey = String(request.headers.get('x-admin-key') ?? '').trim();
  return providedKey === configuredKey ? undefined : jsonResponse({ error: 'Unauthorized.' }, 401);
}

function ensureRepository(repository) {
  return repository ?? jsonResponse({ error: 'DATABASE_URL is not configured.' }, 503);
}

async function readRequestJson(request) {
  const text = await request.text();
  return text.trim() ? JSON.parse(text) : {};
}
```

Create route files:

`web/api/mapping-rows.js`:

```js
import { handleMappingRowsRequest } from './mapping-table-core.js';
import { getMappingTableRepository } from './mapping-table-repository.js';
import { nodeHandler } from './vercel-node-adapter.js';

export default nodeHandler((request) => handleMappingRowsRequest(request, {
  repository: getMappingTableRepository()
}));
```

`web/api/admin/mapping-table/import.js`:

```js
import { handleAdminMappingImportRequest } from '../../mapping-table-core.js';
import { getMappingTableRepository } from '../../mapping-table-repository.js';
import { nodeHandler } from '../../vercel-node-adapter.js';

export default nodeHandler((request) => handleAdminMappingImportRequest(request, {
  repository: getMappingTableRepository()
}));
```

- [ ] **Step 7: Run mapping tests**

Run:

```powershell
node --test tests\mapping-table-api.test.js tests\mapping-table-repository.test.js
```

Expected: pass.

- [ ] **Step 8: Wire local server**

Modify `web/server.js` to import and route `handleMappingRowsRequest` and `handleAdminMappingImportRequest`. Add branches for:

```text
/api/mapping-rows
/api/admin/mapping-table/import
```

Run:

```powershell
node --test tests\server.test.js
```

Expected: pass.

- [ ] **Step 9: Commit**

Run:

```powershell
git add web\db\schema.sql web\api\mapping-table-core.js web\api\mapping-table-repository.js web\api\mapping-rows.js web\api\admin\mapping-table web\server.js web\tests\mapping-table-api.test.js web\tests\mapping-table-repository.test.js web\tests\server.test.js
git commit -m "feat: add mapping table dataset API"
```

### Task 5: String Resource DB Import And Public Rows API

**Files:**
- Modify: `web/db/schema.sql`
- Create: `web/api/string-resources-core.js`
- Create: `web/api/string-resources-repository.js`
- Create: `web/api/string-resource-rows.js`
- Create: `web/api/string-resource-locales.js`
- Create: `web/api/string-resource-rows/[id].js`
- Create: `web/api/admin/string-resources/import.js`
- Modify: `web/server.js`
- Test: `web/tests/string-resources-api.test.js`
- Test: `web/tests/string-resources-repository.test.js`

- [ ] **Step 1: Write failing string resource tests**

Create `web/tests/string-resources-repository.test.js`:

```js
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createStringResourcesRepository } from '../api/string-resources-repository.js';

describe('string resources repository', () => {
  it('imports rows with locale values', async () => {
    const calls = [];
    const sql = {
      async query(text, params = []) {
        calls.push({ text, params });
        if (text.includes('insert into string_resource_rows')) {
          return [{ id: 'row-1' }];
        }
        if (text.includes('update datasets')) {
          return [];
        }
        return [];
      }
    };
    const repository = createStringResourcesRepository(sql);
    const result = await repository.importRows({
      datasetId: 'dataset-1',
      rows: [{
        fileName: 'strings.xlsx',
        languages: { ko: '도움말', 'en-rUS': 'Help.' },
        originalValues: { Korean: '도움말' },
        resourceId: 'CID_HELP',
        rowNumber: 2,
        sheetName: 'VR'
      }],
      summary: { locales: ['ko', 'en-rUS'], rowCount: 1 }
    });

    assert.equal(result.insertedCount, 1);
    assert.equal(calls[0].params[0], 'dataset-1');
    assert.equal(JSON.parse(calls[0].params[5]).ko, '도움말');
  });
});
```

Create `web/tests/string-resources-api.test.js`:

```js
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  handleAdminStringResourcesImportRequest,
  handleStringResourceDetailRequest,
  handleStringResourceLocalesRequest,
  handleStringResourceRowsRequest
} from '../api/string-resources-core.js';

describe('string resources API handlers', () => {
  it('serves rows by dataset and query', async () => {
    const repository = {
      async searchRows(params) {
        assert.equal(params.datasetId, 'dataset-1');
        assert.equal(params.query, 'Help');
        return { rows: [{ id: 'row-1', resourceId: 'CID_HELP' }], total: 1 };
      }
    };
    const response = await handleStringResourceRowsRequest(
      new Request('https://example.com/api/string-resource-rows?datasetId=dataset-1&q=Help'),
      { repository }
    );
    const body = await response.json();
    assert.equal(response.status, 200);
    assert.equal(body.rows[0].resourceId, 'CID_HELP');
  });

  it('serves locale list by dataset', async () => {
    const repository = {
      async listLocales(datasetId) {
        assert.equal(datasetId, 'dataset-1');
        return ['ko', 'en-rUS'];
      }
    };
    const response = await handleStringResourceLocalesRequest(
      new Request('https://example.com/api/string-resource-locales?datasetId=dataset-1'),
      { repository }
    );
    const body = await response.json();
    assert.deepEqual(body.locales, ['ko', 'en-rUS']);
  });

  it('serves row detail', async () => {
    const repository = {
      async getRowById(id) {
        assert.equal(id, 'row-1');
        return { id, rawRow: { Korean: '도움말' } };
      }
    };
    const response = await handleStringResourceDetailRequest(
      new Request('https://example.com/api/string-resource-rows/row-1'),
      { id: 'row-1', repository }
    );
    assert.equal(response.status, 200);
  });

  it('imports rows with admin key', async () => {
    const repository = {
      async importRows(payload) {
        assert.equal(payload.datasetId, 'dataset-1');
        assert.equal(payload.rows.length, 1);
        return { insertedCount: 1 };
      }
    };
    const response = await handleAdminStringResourcesImportRequest(new Request('https://example.com/api/admin/string-resources/import', {
      body: JSON.stringify({
        datasetId: 'dataset-1',
        rows: [{ resourceId: 'CID_HELP', languages: { ko: '도움말' } }],
        summary: { locales: ['ko'] }
      }),
      headers: { 'x-admin-key': 'secret' },
      method: 'POST'
    }), {
      env: { JSON_ADMIN_KEY: 'secret' },
      repository
    });
    assert.equal(response.status, 200);
  });
});
```

- [ ] **Step 2: Run failing string resource tests**

Run:

```powershell
node --test tests\string-resources-api.test.js tests\string-resources-repository.test.js
```

Expected: fail because files do not exist.

- [ ] **Step 3: Add string resource schema**

Append to `web/db/schema.sql`:

```sql
create table if not exists string_resource_rows (
  id uuid primary key default gen_random_uuid(),
  dataset_id uuid not null references datasets(id) on delete cascade,
  source_filename text not null default '',
  sheet_name text not null default '',
  row_number integer not null,
  resource_id text not null default '',
  locale_values jsonb not null default '{}'::jsonb,
  search_text text not null default '',
  raw_row jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  deleted_at timestamptz
);

create index if not exists string_resource_rows_dataset_resource_idx
  on string_resource_rows (dataset_id, resource_id)
  where deleted_at is null;

create index if not exists string_resource_rows_search_idx
  on string_resource_rows using gin (
    to_tsvector('simple', search_text)
  )
  where deleted_at is null;
```

- [ ] **Step 4: Implement string resource repository**

Create `web/api/string-resources-repository.js`:

```js
let cachedSql;
let cachedDatabaseUrl = '';

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
    async getRowById(id) {
      const rows = await sql.query(`
        select id, dataset_id, source_filename, sheet_name, row_number, resource_id, locale_values, raw_row, created_at
        from string_resource_rows
        where id = $1
          and deleted_at is null
        limit 1
      `, [id]);
      return rows[0] ? normalizeStringResourceRow(rows[0]) : undefined;
    },

    async importRows({ datasetId, rows, summary = {} }) {
      let insertedCount = 0;
      for (const row of rows) {
        const localeValues = row.languages ?? row.localeValues ?? {};
        const searchText = [row.resourceId, ...Object.values(localeValues), JSON.stringify(row.originalValues ?? row.rawRow ?? {})]
          .map((part) => String(part ?? '').trim())
          .filter(Boolean)
          .join(' ');
        const insertedRows = await sql.query(`
          insert into string_resource_rows (
            dataset_id, source_filename, sheet_name, row_number, resource_id, locale_values, search_text, raw_row
          )
          values ($1, $2, $3, $4, $5, $6::jsonb, $7, $8::jsonb)
          returning id
        `, [
          datasetId,
          row.fileName ?? row.sourceFilename ?? '',
          row.sheetName ?? '',
          Number(row.rowNumber) || 0,
          row.resourceId ?? '',
          JSON.stringify(localeValues),
          searchText,
          JSON.stringify(row.originalValues ?? row.rawRow ?? {})
        ]);
        insertedCount += insertedRows.length;
      }
      await sql.query(`
        update datasets
        set record_count = $2,
            metadata = $3::jsonb
        where id = $1
      `, [datasetId, insertedCount, JSON.stringify(summary)]);
      return { insertedCount };
    },

    async listLocales(datasetId) {
      const rows = await sql.query(`
        select distinct jsonb_object_keys(locale_values) as locale
        from string_resource_rows
        where dataset_id = $1::uuid
          and deleted_at is null
        order by locale asc
      `, [datasetId]);
      return rows.map((row) => row.locale);
    },

    async searchRows({ datasetId, limit = 50, offset = 0, query = '' } = {}) {
      const trimmedQuery = String(query ?? '').trim();
      const pattern = `%${trimmedQuery}%`;
      const rows = await sql.query(`
        select id, dataset_id, source_filename, sheet_name, row_number, resource_id, locale_values, raw_row, created_at,
               count(*) over() as total_count
        from string_resource_rows
        where dataset_id = $1::uuid
          and deleted_at is null
          and ($2 = '' or search_text ilike $3)
        order by resource_id asc, source_filename asc, sheet_name asc, row_number asc
        limit $4 offset $5
      `, [datasetId, trimmedQuery, pattern, limit, offset]);
      return {
        rows: rows.map(normalizeStringResourceRow),
        total: Number(rows[0]?.total_count ?? 0)
      };
    }
  };
}

function normalizeStringResourceRow(row = {}) {
  return {
    createdAt: row.created_at ?? row.createdAt ?? '',
    datasetId: row.dataset_id ?? row.datasetId ?? '',
    id: row.id ?? '',
    localeValues: row.locale_values ?? row.localeValues ?? {},
    rawRow: row.raw_row ?? row.rawRow ?? {},
    resourceId: row.resource_id ?? row.resourceId ?? '',
    rowNumber: Number(row.row_number ?? row.rowNumber ?? 0),
    sheetName: row.sheet_name ?? row.sheetName ?? '',
    sourceFilename: row.source_filename ?? row.sourceFilename ?? ''
  };
}
```

- [ ] **Step 5: Implement string resource API core and routes**

Create `web/api/string-resources-core.js`:

```js
const DEFAULT_ADMIN_KEY = '1313';

export async function handleStringResourceRowsRequest(request, { repository } = {}) {
  if (request.method !== 'GET') {
    return jsonResponse({ error: 'Method not allowed.' }, 405);
  }
  const repo = ensureRepository(repository);
  if (repo instanceof Response) {
    return repo;
  }
  const url = new URL(request.url);
  const datasetId = url.searchParams.get('datasetId') ?? '';
  const query = url.searchParams.get('q') ?? '';
  const limit = clampInteger(url.searchParams.get('limit'), 1, 200, 50);
  const offset = clampInteger(url.searchParams.get('offset'), 0, 100000, 0);
  if (!datasetId) {
    return jsonResponse({ error: 'datasetId is required.' }, 400);
  }
  return jsonResponse(await repo.searchRows({ datasetId, limit, offset, query }));
}

export async function handleStringResourceLocalesRequest(request, { repository } = {}) {
  if (request.method !== 'GET') {
    return jsonResponse({ error: 'Method not allowed.' }, 405);
  }
  const repo = ensureRepository(repository);
  if (repo instanceof Response) {
    return repo;
  }
  const datasetId = new URL(request.url).searchParams.get('datasetId') ?? '';
  if (!datasetId) {
    return jsonResponse({ error: 'datasetId is required.' }, 400);
  }
  return jsonResponse({ locales: await repo.listLocales(datasetId) });
}

export async function handleStringResourceDetailRequest(request, { id, repository } = {}) {
  if (request.method !== 'GET') {
    return jsonResponse({ error: 'Method not allowed.' }, 405);
  }
  const repo = ensureRepository(repository);
  if (repo instanceof Response) {
    return repo;
  }
  const row = await repo.getRowById(id);
  if (!row) {
    return jsonResponse({ error: 'String resource row not found.' }, 404);
  }
  return jsonResponse({ row });
}

export async function handleAdminStringResourcesImportRequest(request, { env = process.env, repository } = {}) {
  const adminError = requireAdminKey(request, env);
  if (adminError) {
    return adminError;
  }
  if (request.method !== 'POST') {
    return jsonResponse({ error: 'Method not allowed.' }, 405);
  }
  const repo = ensureRepository(repository);
  if (repo instanceof Response) {
    return repo;
  }
  const payload = await readRequestJson(request);
  const datasetId = String(payload.datasetId ?? '').trim();
  const rows = Array.isArray(payload.rows) ? payload.rows : [];
  if (!datasetId) {
    return jsonResponse({ error: 'datasetId is required.' }, 400);
  }
  if (rows.length === 0) {
    return jsonResponse({ error: 'string resource rows are required.' }, 400);
  }
  return jsonResponse(await repo.importRows({
    datasetId,
    rows,
    summary: payload.summary && typeof payload.summary === 'object' ? payload.summary : {}
  }));
}

function jsonResponse(payload, status = 200) {
  return new Response(JSON.stringify(payload), {
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
    status
  });
}

function requireAdminKey(request, env) {
  const configuredKey = String(env?.JSON_ADMIN_KEY ?? DEFAULT_ADMIN_KEY).trim();
  const providedKey = String(
    request.headers.get('x-admin-key') ??
    request.headers.get('authorization')?.replace(/^Bearer\s+/i, '') ??
    ''
  ).trim();
  return providedKey === configuredKey ? undefined : jsonResponse({ error: 'Unauthorized.' }, 401);
}

function ensureRepository(repository) {
  return repository ?? jsonResponse({ error: 'DATABASE_URL is not configured.' }, 503);
}

async function readRequestJson(request) {
  const text = await request.text();
  return text.trim() ? JSON.parse(text) : {};
}

function clampInteger(value, min, max, fallback) {
  const number = Number.parseInt(value, 10);
  if (!Number.isFinite(number)) {
    return fallback;
  }
  return Math.min(max, Math.max(min, number));
}
```

Create routes:

`web/api/string-resource-rows.js`:

```js
import { handleStringResourceRowsRequest } from './string-resources-core.js';
import { getStringResourcesRepository } from './string-resources-repository.js';
import { nodeHandler } from './vercel-node-adapter.js';

export default nodeHandler((request) => handleStringResourceRowsRequest(request, {
  repository: getStringResourcesRepository()
}));
```

`web/api/string-resource-locales.js`:

```js
import { handleStringResourceLocalesRequest } from './string-resources-core.js';
import { getStringResourcesRepository } from './string-resources-repository.js';
import { nodeHandler } from './vercel-node-adapter.js';

export default nodeHandler((request) => handleStringResourceLocalesRequest(request, {
  repository: getStringResourcesRepository()
}));
```

`web/api/string-resource-rows/[id].js`:

```js
import { handleStringResourceDetailRequest } from '../string-resources-core.js';
import { getStringResourcesRepository } from '../string-resources-repository.js';
import { nodeHandler } from '../vercel-node-adapter.js';

export default nodeHandler((request, { id }) => handleStringResourceDetailRequest(request, {
  id,
  repository: getStringResourcesRepository()
}));
```

`web/api/admin/string-resources/import.js`:

```js
import { handleAdminStringResourcesImportRequest } from '../../string-resources-core.js';
import { getStringResourcesRepository } from '../../string-resources-repository.js';
import { nodeHandler } from '../../vercel-node-adapter.js';

export default nodeHandler((request) => handleAdminStringResourcesImportRequest(request, {
  repository: getStringResourcesRepository()
}));
```

- [ ] **Step 6: Run string resource tests**

Run:

```powershell
node --test tests\string-resources-api.test.js tests\string-resources-repository.test.js
```

Expected: pass.

- [ ] **Step 7: Wire local server**

Modify `web/server.js` to route:

```text
/api/string-resource-rows
/api/string-resource-locales
/api/string-resource-rows/:id
/api/admin/string-resources/import
```

Run:

```powershell
node --test tests\server.test.js
```

Expected: pass.

- [ ] **Step 8: Commit**

Run:

```powershell
git add web\db\schema.sql web\api\string-resources-core.js web\api\string-resources-repository.js web\api\string-resource-rows.js web\api\string-resource-locales.js web\api\string-resource-rows web\api\admin\string-resources web\server.js web\tests\string-resources-api.test.js web\tests\string-resources-repository.test.js web\tests\server.test.js
git commit -m "feat: add string resource dataset API"
```

### Task 6: Admin Dataset Tabs And Upload Flows

**Files:**
- Modify: `web/public/index.html`
- Create: `web/public/mapping-table-xlsx.js`
- Modify: `web/public/app.js`
- Modify: `web/public/styles.css`
- Test: `web/tests/mapping-table-xlsx.test.js`
- Test: `web/tests/ui-structure.test.js`

- [ ] **Step 1: Write failing UI structure tests**

Append to `web/tests/ui-structure.test.js`:

```js
it('provides integrated DB admin tabs for all explorer datasets', async () => {
  const html = await readFile(new URL('../public/index.html', import.meta.url), 'utf8');

  assert.match(html, /id="adminJsonTab"/);
  assert.match(html, /id="adminMappingTab"/);
  assert.match(html, /id="adminStringResourceTab"/);
  assert.match(html, /id="adminDatasetNameInput"/);
  assert.match(html, /id="adminJsonCountryInput"/);
  assert.match(html, /id="adminJsonFileInput"/);
  assert.match(html, /id="adminMappingFileInput"/);
  assert.match(html, /id="adminStringResourceFileInput"/);
});

it('wires admin dataset client contracts', async () => {
  const app = await readFile(new URL('../public/app.js', import.meta.url), 'utf8');

  assert.match(app, /loadAdminDatasets/);
  assert.match(app, /createAdminDataset/);
  assert.match(app, /setAdminDatasetActive/);
  assert.match(app, /uploadAdminJsonDatasetFiles/);
  assert.match(app, /uploadAdminMappingDataset/);
  assert.match(app, /uploadAdminStringResourceDataset/);
});
```

- [ ] **Step 2: Run failing UI tests**

Run:

```powershell
node --test tests\ui-structure.test.js
```

Expected: fail because admin controls are missing.

- [ ] **Step 3: Add admin tab markup**

Modify `web/public/index.html` inside the admin section. Add:

```html
<div class="admin-tabs" role="tablist" aria-label="DB admin tools">
  <button id="adminJsonTab" class="admin-tab is-active" type="button" data-admin-tool="json">JSON Data</button>
  <button id="adminMappingTab" class="admin-tab" type="button" data-admin-tool="mapping_table">Mapping Table</button>
  <button id="adminStringResourceTab" class="admin-tab" type="button" data-admin-tool="string_resource">String Resource</button>
</div>

<section class="admin-panel" id="adminDatasetPanel">
  <label>
    Dataset name
    <input id="adminDatasetNameInput" type="text" placeholder="2026-06-30 dataset">
  </label>
  <label>
    Description
    <input id="adminDatasetDescriptionInput" type="text" placeholder="optional memo">
  </label>
  <button id="adminCreateDatasetButton" type="button">Create Dataset</button>
  <div id="adminDatasetList" class="admin-dataset-list"></div>
</section>

<section class="admin-panel" id="adminJsonUploadPanel">
  <label>
    Country/Region
    <input id="adminJsonCountryInput" list="adminJsonCountryOptions" type="text" placeholder="AU">
  </label>
  <datalist id="adminJsonCountryOptions"></datalist>
  <input id="adminJsonFileInput" type="file" accept=".json,application/json" multiple>
  <button id="adminJsonUploadButton" type="button">Upload JSON</button>
</section>

<section class="admin-panel" id="adminMappingUploadPanel" hidden>
  <input id="adminMappingFileInput" type="file" accept=".xlsx,.xls">
  <button id="adminMappingUploadButton" type="button">Upload Mapping Table</button>
</section>

<section class="admin-panel" id="adminStringResourceUploadPanel" hidden>
  <input id="adminStringResourceFileInput" type="file" accept=".xlsx,.xls" multiple>
  <button id="adminStringResourceUploadButton" type="button">Upload String Resources</button>
</section>
```

- [ ] **Step 4: Add admin state and event handlers**

Modify `web/public/app.js` state:

```js
adminDb: {
  activeTool: 'json',
  datasets: {
    json: [],
    mapping_table: [],
    string_resource: []
  },
  selectedDatasetId: ''
}
```

Add element bindings for the IDs from Step 3. Add functions:

```js
async function loadAdminDatasets() {
  const tool = state.adminDb.activeTool;
  const response = await fetch(`/api/admin/datasets?tool=${encodeURIComponent(tool)}`, {
    headers: adminHeaders()
  });
  const body = await response.json();
  state.adminDb.datasets[tool] = body.datasets ?? [];
  state.adminDb.selectedDatasetId = state.adminDb.datasets[tool].find((dataset) => dataset.isActive)?.id
    ?? state.adminDb.datasets[tool][0]?.id
    ?? '';
  renderAdminDatasets();
}

async function createAdminDataset() {
  const toolType = state.adminDb.activeTool;
  const response = await fetch('/api/admin/datasets', {
    body: JSON.stringify({
      description: elements.adminDatasetDescriptionInput.value,
      name: elements.adminDatasetNameInput.value,
      toolType
    }),
    headers: { ...adminHeaders(), 'Content-Type': 'application/json' },
    method: 'POST'
  });
  if (!response.ok) {
    return;
  }
  await loadAdminDatasets();
}

async function setAdminDatasetActive(datasetId) {
  const response = await fetch(`/api/admin/datasets/${encodeURIComponent(datasetId)}/active`, {
    headers: adminHeaders(),
    method: 'PATCH'
  });
  if (response.ok) {
    await loadAdminDatasets();
  }
}
```

Use the existing admin key input value inside:

```js
function adminHeaders() {
  return { 'x-admin-key': elements.adminKeyInput.value.trim() };
}
```

- [ ] **Step 5: Add Mapping Table XLSX parser**

Create `web/public/mapping-table-xlsx.js`:

```js
export function getMappingXlsx(root = globalThis) {
  const xlsx = root.XLSX;
  if (!xlsx || typeof xlsx.read !== 'function' || typeof xlsx.utils?.sheet_to_json !== 'function') {
    throw new Error('SheetJS XLSX library is not loaded.');
  }
  return xlsx;
}

export async function parseMappingWorkbookFile(file, root = globalThis) {
  const xlsx = getMappingXlsx(root);
  const workbook = xlsx.read(await file.arrayBuffer(), { type: 'array' });
  return convertMappingSheetJsonToWorkbook(workbook, file.name, root);
}

export function convertMappingSheetJsonToWorkbook(workbook, source = '', root = globalThis) {
  const xlsx = getMappingXlsx(root);
  const sheets = workbook.SheetNames.map((sheetName) => {
    const rawRows = xlsx.utils.sheet_to_json(workbook.Sheets[sheetName], {
      blankrows: false,
      defval: '',
      header: 1
    });
    return {
      name: sheetName,
      rows: rowsToObjects(rawRows)
    };
  });
  return { sheets, source };
}

function rowsToObjects(rows) {
  const [headers = [], ...bodyRows] = rows;
  const normalizedHeaders = headers.map((header, index) => String(header || `Column ${index + 1}`));
  return bodyRows.map((row, index) => {
    const values = {};
    normalizedHeaders.forEach((header, columnIndex) => {
      values[header] = String(row[columnIndex] ?? '');
    });
    return {
      rowNumber: index + 2,
      values
    };
  });
}
```

Create `web/tests/mapping-table-xlsx.test.js`:

```js
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  getMappingXlsx,
  parseMappingWorkbookFile
} from '../public/mapping-table-xlsx.js';

describe('Mapping Table XLSX adapter', () => {
  it('throws a clear error when SheetJS is missing', () => {
    assert.throws(() => getMappingXlsx({}), /SheetJS XLSX library is not loaded/);
  });

  it('parses uploaded workbook sheets into normalized row objects', async () => {
    const buffer = new ArrayBuffer(4);
    const root = {
      XLSX: {
        read(input, options) {
          assert.equal(input, buffer);
          assert.deepEqual(options, { type: 'array' });
          return {
            SheetNames: ['GROUP INTENTIONS'],
            Sheets: { 'GROUP INTENTIONS': { marker: 'sheet' } }
          };
        },
        utils: {
          sheet_to_json(sheet, options) {
            assert.deepEqual(sheet, { marker: 'sheet' });
            assert.deepEqual(options, { blankrows: false, defval: '', header: 1 });
            return [
              ['Domain', 'Intention'],
              ['weather', 'lookup']
            ];
          }
        }
      }
    };
    const workbook = await parseMappingWorkbookFile({
      arrayBuffer: async () => buffer,
      name: 'mapping.xlsx'
    }, root);

    assert.deepEqual(workbook, {
      source: 'mapping.xlsx',
      sheets: [{
        name: 'GROUP INTENTIONS',
        rows: [{
          rowNumber: 2,
          values: { Domain: 'weather', Intention: 'lookup' }
        }]
      }]
    });
  });
});
```

Run:

```powershell
node --test tests\mapping-table-xlsx.test.js
```

Expected: pass.

- [ ] **Step 6: Implement upload functions**

Add:

```js
async function uploadAdminJsonDatasetFiles() {
  const datasetId = state.adminDb.selectedDatasetId;
  const countryRegion = elements.adminJsonCountryInput.value.trim();
  const files = await Promise.all(Array.from(elements.adminJsonFileInput.files ?? []).map(async (file) => ({
    filename: file.name,
    text: await file.text()
  })));
  await fetch('/api/admin/json-records/import', {
    body: JSON.stringify({ countryRegion, datasetId, files }),
    headers: { ...adminHeaders(), 'Content-Type': 'application/json' },
    method: 'POST'
  });
  await loadAdminDatasets();
}

async function uploadAdminMappingDataset() {
  const file = elements.adminMappingFileInput.files?.[0];
  if (!file) {
    return;
  }
  const workbook = await parseMappingWorkbookFile(file);
  const rows = normalizeMappingWorkbook(workbook);
  await fetch('/api/admin/mapping-table/import', {
    body: JSON.stringify({
      datasetId: state.adminDb.selectedDatasetId,
      rows,
      summary: { rowCount: rows.length, sourceFilename: file.name }
    }),
    headers: { ...adminHeaders(), 'Content-Type': 'application/json' },
    method: 'POST'
  });
  await loadAdminDatasets();
}

async function uploadAdminStringResourceDataset() {
  const files = Array.from(elements.adminStringResourceFileInput.files ?? []);
  const normalized = [];
  const localeSet = new Set();
  for (const file of files) {
    const workbook = await parseStringResourceWorkbookFile(file);
    const result = normalizeStringResourceWorkbook(workbook, file.name);
    normalized.push(...result.rows);
    for (const qualifier of resolveStringResourceQualifiers(result.rows)) {
      localeSet.add(qualifier);
    }
  }
  await fetch('/api/admin/string-resources/import', {
    body: JSON.stringify({
      datasetId: state.adminDb.selectedDatasetId,
      rows: normalized,
      summary: { locales: [...localeSet], rowCount: normalized.length, workbookCount: files.length }
    }),
    headers: { ...adminHeaders(), 'Content-Type': 'application/json' },
    method: 'POST'
  });
  await loadAdminDatasets();
}
```

- [ ] **Step 7: Add CSS**

Modify `web/public/styles.css`:

```css
.admin-tabs {
  display: flex;
  gap: 8px;
  margin: 16px 0;
}

.admin-tab {
  border: 1px solid var(--border-color);
  background: var(--surface-color);
  padding: 8px 12px;
}

.admin-tab.is-active {
  background: var(--accent-color);
  color: white;
}

.admin-panel {
  display: grid;
  gap: 12px;
  margin-top: 16px;
}

.admin-dataset-list {
  display: grid;
  gap: 8px;
}
```

- [ ] **Step 8: Run UI tests**

Run:

```powershell
node --test tests\mapping-table-xlsx.test.js tests\ui-structure.test.js
```

Expected: pass.

- [ ] **Step 9: Commit**

Run:

```powershell
git add web\public\index.html web\public\mapping-table-xlsx.js web\public\app.js web\public\styles.css web\tests\mapping-table-xlsx.test.js web\tests\ui-structure.test.js
git commit -m "feat: add db admin dataset UI"
```

### Task 7: DB-Backed Explorer Filters And Search Sources

**Files:**
- Modify: `web/public/index.html`
- Modify: `web/public/app.js`
- Modify: `web/public/styles.css`
- Test: `web/tests/ui-structure.test.js`

- [ ] **Step 1: Write failing search filter UI tests**

Append to `web/tests/ui-structure.test.js`:

```js
it('provides dataset filters for DB-backed explorer screens', async () => {
  const html = await readFile(new URL('../public/index.html', import.meta.url), 'utf8');

  assert.match(html, /id="explorerDatasetSelect"/);
  assert.match(html, /id="explorerCountrySelect"/);
  assert.match(html, /id="mappingDatasetSelect"/);
  assert.match(html, /id="stringResourceDatasetSelect"/);
});

it('wires DB-backed explorer loading functions', async () => {
  const app = await readFile(new URL('../public/app.js', import.meta.url), 'utf8');

  assert.match(app, /loadExplorerDatasets/);
  assert.match(app, /loadExplorerCountries/);
  assert.match(app, /searchDbExplorerRecords/);
  assert.match(app, /loadMappingDatasetRows/);
  assert.match(app, /loadStringResourceDatasetRows/);
});
```

- [ ] **Step 2: Run failing UI tests**

Run:

```powershell
node --test tests\ui-structure.test.js
```

Expected: fail because filters/functions are missing.

- [ ] **Step 3: Add filter markup**

Modify `web/public/index.html`.

Add to JSON Explorer toolbar:

```html
<label class="toolbar-field">
  Version
  <select id="explorerDatasetSelect"></select>
</label>
<label class="toolbar-field">
  Country/Region
  <select id="explorerCountrySelect"></select>
</label>
```

Add to Mapping Table toolbar:

```html
<label class="toolbar-field">
  Version
  <select id="mappingDatasetSelect"></select>
</label>
```

Add to String Resource toolbar:

```html
<label class="toolbar-field">
  Version
  <select id="stringResourceDatasetSelect"></select>
</label>
```

- [ ] **Step 4: Implement dataset loading for JSON Explorer**

Modify `web/public/app.js`:

```js
async function loadExplorerDatasets() {
  const response = await fetch('/api/datasets?tool=json');
  const body = await response.json();
  state.explorer.datasets = body.datasets ?? [];
  state.explorer.datasetId = state.explorer.datasets.find((dataset) => dataset.isActive)?.id
    ?? state.explorer.datasets[0]?.id
    ?? '';
  renderDatasetOptions(elements.explorerDatasetSelect, state.explorer.datasets, state.explorer.datasetId);
  await loadExplorerCountries();
}

async function loadExplorerCountries() {
  if (!state.explorer.datasetId) {
    state.explorer.countries = [];
    renderCountryOptions();
    return;
  }
  const response = await fetch(`/api/json-countries?datasetId=${encodeURIComponent(state.explorer.datasetId)}`);
  const body = await response.json();
  state.explorer.countries = body.countries ?? [];
  state.explorer.countryRegion = state.explorer.countries[0]?.countryRegion ?? '';
  renderCountryOptions();
}

async function searchDbExplorerRecords() {
  const params = new URLSearchParams({
    country: state.explorer.countryRegion,
    datasetId: state.explorer.datasetId,
    q: state.explorer.query
  });
  const response = await fetch(`/api/json-records?${params.toString()}`);
  const body = await response.json();
  state.explorer.items = (body.records ?? []).map(dbJsonRecordToExplorerItem);
  renderExplorer();
}
```

Add:

```js
function renderDatasetOptions(select, datasets, selectedId) {
  const fragment = document.createDocumentFragment();
  for (const dataset of datasets) {
    const option = document.createElement('option');
    option.value = dataset.id;
    option.textContent = dataset.isActive ? `${dataset.name} (active)` : dataset.name;
    option.selected = dataset.id === selectedId;
    fragment.append(option);
  }
  select.replaceChildren(fragment);
}

function renderCountryOptions() {
  const fragment = document.createDocumentFragment();
  for (const country of state.explorer.countries) {
    const option = document.createElement('option');
    option.value = country.countryRegion;
    option.textContent = `${country.countryRegion} (${country.count})`;
    option.selected = country.countryRegion === state.explorer.countryRegion;
    fragment.append(option);
  }
  elements.explorerCountrySelect.replaceChildren(fragment);
}
```

- [ ] **Step 5: Implement Mapping and String Resource dataset loading**

Add:

```js
async function loadMappingDatasetRows() {
  const datasets = await fetchDatasets('mapping_table');
  state.mapping.datasets = datasets;
  state.mapping.datasetId = datasets.find((dataset) => dataset.isActive)?.id ?? datasets[0]?.id ?? '';
  renderDatasetOptions(elements.mappingDatasetSelect, datasets, state.mapping.datasetId);
  if (!state.mapping.datasetId) {
    state.mapping.rows = [];
    renderMappingWorkflow();
    return;
  }
  const response = await fetch(`/api/mapping-rows?datasetId=${encodeURIComponent(state.mapping.datasetId)}`);
  const body = await response.json();
  state.mapping.rows = body.rows ?? [];
  state.mapping.isLoaded = true;
  renderMappingWorkflow();
}

async function loadStringResourceDatasetRows() {
  const datasets = await fetchDatasets('string_resource');
  state.stringResource.datasets = datasets;
  state.stringResource.datasetId = datasets.find((dataset) => dataset.isActive)?.id ?? datasets[0]?.id ?? '';
  renderDatasetOptions(elements.stringResourceDatasetSelect, datasets, state.stringResource.datasetId);
  if (!state.stringResource.datasetId) {
    state.stringResource.rows = [];
    renderStringResourceExplorer();
    return;
  }
  const response = await fetch(`/api/string-resource-rows?datasetId=${encodeURIComponent(state.stringResource.datasetId)}&q=${encodeURIComponent(state.stringResource.query)}`);
  const body = await response.json();
  state.stringResource.rows = body.rows ?? [];
  renderStringResourceExplorer();
}

async function fetchDatasets(toolType) {
  const response = await fetch(`/api/datasets?tool=${encodeURIComponent(toolType)}`);
  const body = await response.json();
  return body.datasets ?? [];
}
```

- [ ] **Step 6: Add filter event listeners**

Add:

```js
elements.explorerDatasetSelect.addEventListener('change', async (event) => {
  state.explorer.datasetId = event.target.value;
  await loadExplorerCountries();
  await searchDbExplorerRecords();
});

elements.explorerCountrySelect.addEventListener('change', async (event) => {
  state.explorer.countryRegion = event.target.value;
  await searchDbExplorerRecords();
});

elements.mappingDatasetSelect.addEventListener('change', async (event) => {
  state.mapping.datasetId = event.target.value;
  await loadMappingDatasetRows();
});

elements.stringResourceDatasetSelect.addEventListener('change', async (event) => {
  state.stringResource.datasetId = event.target.value;
  await loadStringResourceDatasetRows();
});
```

- [ ] **Step 7: Run UI tests**

Run:

```powershell
node --test tests\ui-structure.test.js
```

Expected: pass.

- [ ] **Step 8: Commit**

Run:

```powershell
git add web\public\index.html web\public\app.js web\public\styles.css web\tests\ui-structure.test.js
git commit -m "feat: add db explorer filters"
```

### Task 8: End-To-End Local Verification

**Files:**
- Modify: whichever files from Tasks 1-7 are identified by failing verification output.
- Test: all `web/tests/*.test.js`

- [ ] **Step 1: Run full test suite**

Run:

```powershell
node --test --test-isolation=none
```

Expected: all tests pass.

- [ ] **Step 2: Run syntax checks for touched public/API modules**

Run:

```powershell
node --check api\datasets-core.js
node --check api\datasets-repository.js
node --check api\json-records-core.js
node --check api\json-records-repository.js
node --check api\mapping-table-core.js
node --check api\mapping-table-repository.js
node --check api\string-resources-core.js
node --check api\string-resources-repository.js
node --check public\app.js
```

Expected: each command exits `0`.

- [ ] **Step 3: Run whitespace check**

Run from repository root:

```powershell
git diff --check
```

Expected: no whitespace errors.

- [ ] **Step 4: Start local server**

Run:

```powershell
npm start
```

Expected: local server prints a localhost URL.

- [ ] **Step 5: Browser smoke test**

Open the local URL and verify:

- `/admin` shows `JSON Data`, `Mapping Table`, and `String Resource` tabs.
- `/explorer` shows `Version` and `Country/Region` filters.
- `/mapping-table` shows a `Version` filter.
- `/string-resource` shows a `Version` filter.
- Existing upload-based local parsing controls do not block the DB-backed flows.

- [ ] **Step 6: Commit fixes from verification**

Run:

```powershell
git add web
git commit -m "test: verify db backed explorers"
```

If there are no changes after verification, skip this commit.

### Task 9: Deployment Preparation

**Files:**
- Modify: `web/docs/VERCEL_DEPLOYMENT.md`
- Modify: `README.md`
- Test: documentation review and Vercel build

- [ ] **Step 1: Update deployment docs**

Add this section to `web/docs/VERCEL_DEPLOYMENT.md`:

```md
## DB-backed Explorer setup

The DB-backed Explorer tools require these Vercel environment variables:

- `DATABASE_URL` or `POSTGRES_URL`: Neon Postgres connection string.
- `JSON_ADMIN_KEY`: admin mutation key used by `/admin`.

Before deploying the DB-backed version, apply `web/db/schema.sql` to the Neon database.

The admin page manages datasets for:

- JSON Explorer
- Mapping Table Explorer
- String Resource Explorer

JSON uploads require a country/region value. Mapping Table and String Resource datasets do not use country/region filters.
```

- [ ] **Step 2: Update root README**

Add:

```md
## DB-backed Explorer data

The production app can manage Explorer data through `/admin`.

- JSON Explorer data is uploaded by dataset version and country/region.
- Mapping Table Explorer data is uploaded by dataset version.
- String Resource Explorer data is uploaded by dataset version and keeps locale qualifiers such as `ko`, `en-rUS`, and `en-rAU` inside each row.
```

- [ ] **Step 3: Run Vercel local build**

Run from the worktree root:

```powershell
npx vercel build --prod --yes
```

Expected: build completes and creates `.vercel/output`.

- [ ] **Step 4: Commit docs**

Run:

```powershell
git add README.md web\docs\VERCEL_DEPLOYMENT.md
git commit -m "docs: document db backed explorer setup"
```

### Task 10: Production Deployment

**Files:**
- No source changes expected.
- Test: Vercel inspect and production smoke checks.

- [ ] **Step 1: Deploy prebuilt output**

Run:

```powershell
npx vercel deploy --prebuilt --prod --yes --no-wait
```

Expected: command returns a deployment URL and `readyState` is not `BLOCKED`.

- [ ] **Step 2: Inspect deployment**

Run:

```powershell
npx vercel inspect https://<deployment-url>
```

Expected: status is `Ready` and aliases include `https://mz-json.vercel.app`.

- [ ] **Step 3: Public URL smoke checks**

Run:

```powershell
$routes = @('/explorer', '/mapping-table', '/string-resource', '/admin')
foreach ($route in $routes) {
  $res = Invoke-WebRequest -Uri "https://mz-json.vercel.app$route" -UseBasicParsing -TimeoutSec 30
  "$route $($res.StatusCode)"
}
```

Expected:

```text
/explorer 200
/mapping-table 200
/string-resource 200
/admin 200
```

- [ ] **Step 4: Browser production smoke test**

Open:

```text
https://mz-json.vercel.app/admin
```

Verify:

- Admin tabs render.
- Admin key input is present.
- Dataset controls render.

Open:

```text
https://mz-json.vercel.app/explorer
https://mz-json.vercel.app/mapping-table
https://mz-json.vercel.app/string-resource
```

Verify each route renders without console errors and includes the expected dataset/version filters.

- [ ] **Step 5: Final commit or tag**

If deployment required source changes after Task 9, commit them:

```powershell
git add .
git commit -m "fix: prepare db backed explorer deployment"
```

If no changes were required, do not create an empty commit.

## Self-Review

- Spec coverage:
  - Common `datasets` table: Task 1.
  - Dataset public/admin APIs: Task 2.
  - JSON country-based upload and filtering: Task 3.
  - Mapping Table DB rows: Task 4.
  - String Resource DB rows and locale storage: Task 5.
  - Integrated `/admin` tabs: Task 6.
  - Explorer dataset/version filters: Task 7.
  - Verification and deployment: Tasks 8-10.
- Placeholder scan:
  - No `TBD`, `TODO`, `FIXME`, or unresolved plan placeholder tokens are intentionally present. HTML `placeholder` attributes in snippets are intentional UI copy.
- Type consistency:
  - Dataset fields use `toolType`, `isActive`, `recordCount`, `errorCount` in JS and snake_case in SQL.
  - JSON country uses `countryRegion` in JS and `country_region` in SQL/API query alias `country`.
  - String Resource locale payload uses `localeValues` in API responses and `locale_values` in SQL.
