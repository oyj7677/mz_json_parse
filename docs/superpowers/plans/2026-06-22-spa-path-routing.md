# SPA Path Routing Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add clean tool-specific URLs such as `/formatter`, `/explorer`, `/mapping-table`, and `/string-resource` while keeping the existing single-page app.

**Architecture:** Keep one `index.html` app and add a small client-side routing layer. Route parsing lives in a focused `routes.js` module, `app.js` uses `history.pushState()` and `popstate`, and Vercel rewrites tool paths back to `index.html` for direct visits.

**Tech Stack:** Vanilla JavaScript modules, Node test runner, Vercel static rewrites.

---

### Task 1: Route Model

**Files:**
- Create: `web/public/routes.js`
- Test: `web/tests/routes.test.js`

- [ ] **Step 1: Write failing tests**

```js
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  ROUTE_TOOLS,
  normalizeToolRoute,
  pathForTool
} from '../public/routes.js';

describe('SPA tool routes', () => {
  it('maps each public path to a stable tool id', () => {
    assert.equal(normalizeToolRoute('/').tool, 'hub');
    assert.equal(normalizeToolRoute('/formatter').tool, 'formatter');
    assert.equal(normalizeToolRoute('/explorer').tool, 'explorer');
    assert.equal(normalizeToolRoute('/mapping-table').tool, 'mapping');
    assert.equal(normalizeToolRoute('/string-resource').tool, 'stringResource');
  });

  it('normalizes trailing slashes and unknown paths', () => {
    assert.deepEqual(normalizeToolRoute('/explorer/'), ROUTE_TOOLS.explorer);
    assert.deepEqual(normalizeToolRoute('/unknown-tool'), ROUTE_TOOLS.hub);
  });

  it('returns canonical paths for tool navigation', () => {
    assert.equal(pathForTool('formatter'), '/formatter');
    assert.equal(pathForTool('mapping'), '/mapping-table');
    assert.equal(pathForTool('missing'), '/');
  });
});
```

- [ ] **Step 2: Run test to verify failure**

Run: `cd web; node --test tests/routes.test.js`

Expected: FAIL because `public/routes.js` does not exist.

- [ ] **Step 3: Implement route model**

Create `routes.js` with canonical route definitions, route normalization, and path lookup.

- [ ] **Step 4: Run route tests**

Run: `cd web; node --test tests/routes.test.js`

Expected: PASS.

### Task 2: Browser History Integration

**Files:**
- Modify: `web/public/app.js`
- Modify: `web/tests/ui-structure.test.js`

- [ ] **Step 1: Write failing structure tests**

Assert that `app.js` imports the route helpers, uses `history.pushState`, handles `popstate`, and routes tool buttons through `navigateToTool()`.

- [ ] **Step 2: Run UI structure tests to verify failure**

Run: `cd web; node --test tests/ui-structure.test.js`

Expected: FAIL because app routing is not wired yet.

- [ ] **Step 3: Wire app routing**

Add `navigateToTool()`, `renderToolRoute()`, and `showToolView()` helpers. Use them from hub cards and back buttons. On initial load, render based on `window.location.pathname`.

- [ ] **Step 4: Run UI structure tests**

Run: `cd web; node --test tests/ui-structure.test.js`

Expected: PASS.

### Task 3: Vercel Direct-Path Support

**Files:**
- Modify: `web/vercel.json`
- Modify: `web/tests/ui-structure.test.js`

- [ ] **Step 1: Write failing test**

Assert that `web/vercel.json` rewrites `/formatter`, `/explorer`, `/mapping-table`, and `/string-resource` to `/index.html`.

- [ ] **Step 2: Run test to verify failure**

Run: `cd web; node --test tests/ui-structure.test.js`

Expected: FAIL because rewrites are absent.

- [ ] **Step 3: Add Vercel rewrites**

Add explicit rewrite entries for each tool route.

- [ ] **Step 4: Run full verification**

Run:

```powershell
cd web
node --check public/app.js
node --check public/routes.js
node --test --test-isolation=none
git diff --check
```

Expected: all commands exit with code 0.
