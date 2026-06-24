# JSON DB Admin Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add database-backed JSON record APIs and an `/admin` page for protected upload/delete management while keeping `/explorer` readable through public DB APIs.

**Architecture:** Add shared API helpers under `web/api/json-records-core.js`, Neon repository code under `web/api/json-records-repository.js`, Vercel endpoint files under `web/api/**`, local server routing in `web/server.js`, an `/admin` SPA route, and schema SQL in `web/db/schema.sql`.

**Tech Stack:** Vanilla JavaScript modules, Vercel Serverless Functions, Neon serverless Postgres driver, Node test runner.

---

### Task 1: Database Record Normalization

**Files:**
- Create: `web/api/json-records-core.js`
- Test: `web/tests/json-records-core.test.js`

- [x] **Step 1: Write failing tests**

Test that uploaded files normalize into DB records with `recognitionText`, source filename, table metadata, slot summary, content hash, and `raw_json`/`raw_text` split.

- [x] **Step 2: Run failing test**

Run: `cd web; node --test --test-isolation=none tests/json-records-core.test.js`

Expected: module not found.

- [x] **Step 3: Implement normalization**

Use existing `parseUploadedJsonContent()` and `createExplorerItem()` from `public/core.js`, plus `node:crypto` hashing.

- [x] **Step 4: Run passing test**

Run: `cd web; node --test --test-isolation=none tests/json-records-core.test.js`

Expected: pass.

### Task 2: API Handler Contracts

**Files:**
- Modify: `web/api/json-records-core.js`
- Test: `web/tests/json-records-api.test.js`

- [x] **Step 1: Write failing tests**

Test public search/detail handlers, admin key protection, import handler, status handler, record delete, and batch delete using an in-memory fake repository.

- [x] **Step 2: Run failing test**

Run: `cd web; node --test --test-isolation=none tests/json-records-api.test.js`

Expected: missing exported handlers.

- [x] **Step 3: Implement handlers**

Add request parsing, JSON responses, admin key checks, and repository delegation.

- [x] **Step 4: Run passing test**

Run: `cd web; node --test --test-isolation=none tests/json-records-api.test.js`

Expected: pass.

### Task 3: Neon Repository and Schema

**Files:**
- Create: `web/api/json-records-repository.js`
- Create: `web/db/schema.sql`
- Modify: `web/package.json`
- Modify: `web/package-lock.json`

- [x] **Step 1: Install dependency**

Run: `cd web; npm install @neondatabase/serverless`

- [x] **Step 2: Implement repository**

Use `neon(process.env.DATABASE_URL)` and `sql.query()` for parameterized SQL.

- [x] **Step 3: Add schema**

Create tables and indexes for import batches, records, slots, soft deletes, and text search columns.

### Task 4: Vercel and Local API Routes

**Files:**
- Create: `web/api/json-records.js`
- Create: `web/api/json-records/[id].js`
- Create: `web/api/admin/json-records/status.js`
- Create: `web/api/admin/json-records/import.js`
- Create: `web/api/admin/json-records/[id].js`
- Create: `web/api/admin/json-batches/[id].js`
- Modify: `web/server.js`
- Test: `web/tests/server.test.js`

- [x] **Step 1: Write failing local server tests**

Test `/api/json-records` and `/api/admin/json-records/import` local routing with injected repository/env.

- [x] **Step 2: Implement local routes**

Route API paths before static serving.

- [x] **Step 3: Add Vercel route wrappers**

Each wrapper creates the Neon repository and calls the shared handler.

### Task 5: Admin UI and Routing

**Files:**
- Modify: `web/public/routes.js`
- Modify: `web/public/index.html`
- Modify: `web/public/app.js`
- Modify: `web/public/styles.css`
- Test: `web/tests/routes.test.js`
- Test: `web/tests/ui-structure.test.js`

- [x] **Step 1: Write failing tests**

Assert `/admin` route, admin page IDs, API fetch contracts, and Vercel rewrite.

- [x] **Step 2: Implement UI**

Add `/admin` card, admin page, admin key field, DB status, file upload, batch result, and recent records table with delete buttons.

- [x] **Step 3: Run full verification**

Run:

```powershell
cd web
node --check public/app.js
node --check public/routes.js
node --check server.js
node --test --test-isolation=none
git diff --check
```
