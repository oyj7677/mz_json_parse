# JSON Explorer Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a file-upload based JSON Explorer that lists uploaded JSON files by `recognitionText`, filters by `recognitionText`, and shows the selected JSON details.

**Architecture:** Reuse the existing static web app and `core.js` JSON parsing helpers. Add Explorer-specific state and rendering to `app.js`, replace the placeholder Explorer HTML in `index.html`, and add focused CSS for a two-column exploration workspace. Keep the first version browser-only so future DB integration can feed the same item shape.

**Tech Stack:** Static HTML, CSS, vanilla JavaScript modules, Node.js built-in test runner.

---

### Task 1: Explorer Structure Tests

**Files:**
- Modify: `web/tests/ui-structure.test.js`

- [ ] **Step 1: Write failing structure assertions**

Add assertions that `#explorerApp` contains:
- `#explorerFileInput`
- `#explorerSearchInput`
- `#explorerList`
- `#explorerDetail`
- `#clearExplorerButton`

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- tests/ui-structure.test.js`

Expected: FAIL because the current Explorer screen is still a placeholder.

### Task 2: Explorer Core Tests

**Files:**
- Create: `web/tests/explorer.test.js`
- Modify: `web/public/core.js`

- [ ] **Step 1: Write failing helper tests**

Create tests for:
- `createExplorerItem()` extracts `recognitionText` and keeps filename/source JSON.
- `filterExplorerItems()` filters only by `recognitionText`, case-insensitively.
- Items with no `recognitionText` remain visible for empty search but do not match unrelated search text.

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- tests/explorer.test.js`

Expected: FAIL because the helper functions do not exist yet.

- [ ] **Step 3: Implement helpers**

Add exported helpers to `core.js`:
- `createExplorerItem({ id, sourceFilename, value, valueKind })`
- `filterExplorerItems(items, query)`

### Task 3: Explorer UI

**Files:**
- Modify: `web/public/index.html`
- Modify: `web/public/styles.css`
- Modify: `web/public/app.js`

- [ ] **Step 1: Replace placeholder markup**

Change `#explorerApp` from a placeholder to a workspace with upload controls, search input, list, and detail panel.

- [ ] **Step 2: Wire upload behavior**

Use `parseUploadedJsonContent()` and `createExplorerItem()` to register multiple files immediately after selection.

- [ ] **Step 3: Wire search and selection behavior**

Filter the list by `recognitionText` as the user types. Selecting an item updates the detail panel with filename, `recognitionText`, and JSON preview.

- [ ] **Step 4: Preserve navigation**

Keep `MZ Tools -> JSON Explorer -> 도구 목록` navigation working.

### Task 4: Verification

**Files:**
- Test: all web tests
- Browser: local `http://localhost:3000/`

- [ ] **Step 1: Run all tests**

Run: `npm test`

Expected: all tests pass.

- [ ] **Step 2: Browser verify**

Open `http://localhost:3000/`, enter JSON Explorer, confirm the upload/search/list/detail UI renders and there are no console errors.

- [ ] **Step 3: Do not deploy**

Keep changes local unless the user explicitly asks to deploy.
