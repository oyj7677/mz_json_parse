# JSON Editor Tool Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a new `/json-editor` tool that lets the team open, edit, format, inspect, and compare two JSON documents side by side.

**Architecture:** Keep the current single-page app and add one routed tool page. Use the same editor family as JSON Editor Online through `vanilla-jsoneditor` where practical, while keeping team-specific actions such as local file loading, JSON diff, copy direction, and download inside our app code.

**Tech Stack:** Vanilla JavaScript modules, `vanilla-jsoneditor` vendored bundle, existing SPA router, Node test runner, Vercel rewrites.

---

## Analysis Source

- Target URL: `https://jsoneditoronline.org/#right=local.yojopa&left=local.yojali`
- The `left=local.yojali` and `right=local.yojopa` hash values are browser-local document IDs. In a different browser session they resolve to "Local document not found", so the concrete documents cannot be inspected from outside the user's browser.
- Official current editor library: `josdejong/svelte-jsoneditor`
  - The README describes the editor as a browser tool for viewing, editing, formatting, transforming, and validating JSON.
  - It supports text, tree, and table views; format, compact, sort, query, filter, transform, repair, validation, search/replace, undo/redo, and large JSON documents.
  - It can be used from plain JavaScript through `vanilla-jsoneditor`.
- Official older library: `josdejong/jsoneditor`
  - The README documents the earlier editor modes and confirms the original tool model: tree/code/text/preview views, formatting, repair, schema validation, search, sort, transform, and undo/redo.
- Live page observation:
  - The app is a two-panel editor with left and right JSON documents.
  - Visible controls include text/tree/table mode switching, expand/collapse, format, smart format, compact, sort, transform, search, undo/redo, open from disk, open from URL, import/export CSV, copy formatted/smart/compact/escaped/as-is, panel-to-panel copy, transform direction, and compare.

## Product Positioning

This should not replace the existing tools:

- `JSON Formatter`: batch file naming and ZIP download.
- `JSON Explorer`: recognitionText-centered search over many JSON records.
- `DB Admin`: protected upload/delete management for persisted JSON records.
- `JSON Editor`: one or two JSON documents at a time, focused on visual inspection, manual editing, formatting, and difference checking.

The new tool should feel like a workbench: fast to open, browser-local by default, and useful before deciding whether data should go to Explorer or DB.

## Recommended Scope

### MVP

- Add hub card and route: `/json-editor`.
- Show a two-pane layout: Left JSON and Right JSON.
- Each pane supports:
  - Open JSON from disk.
  - Paste/edit JSON text.
  - Switch between `text`, `tree`, and `table` modes.
  - Format, smart format, compact, sort, search, undo, redo through the editor library where available.
  - Copy formatted JSON.
  - Download current JSON as `.json`.
  - Validation status and parse error display.
- Between the panes, provide:
  - Copy left to right.
  - Copy right to left.
  - Swap panes.
  - Compare.
- Compare result:
  - Shows whether the normalized JSON structures are equal.
  - Lists changed JSON paths with type: added, removed, changed.
  - Displays compact before/after values for changed leaves.

### Explicitly Out Of MVP

- Cloud save, sign-in, public URL sharing, ads, and account features.
- JSON schema management UI.
- CSV import/export unless the team confirms it is useful.
- Full query/transform language UI.
- Three-way merge.
- Persisting editor documents to Neon Postgres.
- Opening JSON Editor Online `local.*` document IDs directly. Those IDs belong to jsoneditoronline.org local storage, not our app.

## UX Plan

- The first screen remains the existing MZ Tools hub.
- Add a `JSON Editor` card with a short description such as "두 JSON 비교 / 구조 편집".
- `/json-editor` page layout:
  - Topbar: title, summary, "도구 목록" button.
  - Main workspace: two equal-width editor panes.
  - Middle control rail: copy direction, swap, compare.
  - Bottom or right-side diff panel: hidden until Compare runs.
- Large screens:
  - Keep panes side by side.
  - Allow pane width drag later if needed.
- Small screens:
  - Stack panes vertically.
  - Keep compare actions in a sticky compact toolbar.
- Empty state:
  - Each pane starts with "JSON 파일을 열거나 붙여넣으세요."
  - Do not auto-upload or transmit content.

## Technical Design

### Files To Create

- `web/public/json-editor-core.js`
  - Pure helpers for parsing, formatting, compacting, sorting, normalization, diff path generation, and filename resolution.
- `web/public/json-editor-tool.js`
  - Browser UI controller for editor instances, file loading, pane state, copy/swap/compare/download actions.
- `web/tests/json-editor-core.test.js`
  - Unit tests for pure JSON editor helpers.
- `web/tests/json-editor-ui.test.js`
  - Structure tests for route, card, required DOM nodes, and controller imports if a separate test file is cleaner than expanding `ui-structure.test.js`.
- `web/scripts/copy-jsoneditor-vendor.js`
  - Copies the standalone editor bundle from `node_modules` into `web/public/vendor`.

### Files To Modify

- `web/package.json`
  - Add `vanilla-jsoneditor`.
  - Add or extend vendor copy script.
- `web/package-lock.json`
  - Dependency lock update.
- `web/public/index.html`
  - Add hub card.
  - Add `<main id="jsonEditorApp">` with two editor panes and compare result panel.
- `web/public/routes.js`
  - Add `{ path: '/json-editor', tool: 'jsonEditor' }`.
- `web/public/app.js`
  - Wire hub navigation, back button, route rendering, and `initializeJsonEditorTool`.
- `web/public/styles.css`
  - Add JSON editor layout, pane, toolbar, diff panel, and responsive rules.
- `web/vercel.json`
  - Rewrite `/json-editor` to `/index.html`.
- `web/tests/routes.test.js`
  - Assert `/json-editor` route mapping and canonical path.
- `web/tests/ui-structure.test.js`
  - Assert hub card, app shell, back button, and Vercel rewrite.

## State Model

```js
const jsonEditorState = {
  initialized: false,
  left: {
    name: 'left.json',
    content: { text: '' },
    error: ''
  },
  right: {
    name: 'right.json',
    content: { text: '' },
    error: ''
  },
  diff: {
    comparedAt: null,
    isEqual: false,
    changes: []
  }
};
```

Pane content should stay in browser memory only for MVP. Optional localStorage draft recovery can be added later after confirming whether team members want the browser to remember sensitive JSON snippets.

## Diff Rules

- Parse both panes before comparing.
- Normalize object key order before equality checks.
- Compare arrays by index in MVP.
- Report paths using JSON Pointer-like notation:
  - `/serverResult/result/vrResult/recognitionText`
  - `/embeddedResult/result/SimpleResult/0/confidence`
- Diff types:
  - `added`: path exists only on right.
  - `removed`: path exists only on left.
  - `changed`: path exists on both but values differ.
- Limit visible diff rows to a safe number, for example 500, and show a truncation message if exceeded.

## Implementation Tasks

### Task 1: Add Editor Dependency And Vendor Bundle

**Files:**
- Modify: `web/package.json`
- Modify: `web/package-lock.json`
- Create: `web/scripts/copy-jsoneditor-vendor.js`
- Modify: `web/tests/ui-structure.test.js`

- [ ] Add `vanilla-jsoneditor` as a dependency.
- [ ] Add a script that copies the standalone browser bundle and CSS into `web/public/vendor`.
- [ ] Add a structure test that verifies the expected vendor files are referenced or copied.
- [ ] Run `npm install` in `web`.

### Task 2: Add JSON Editor Core Helpers

**Files:**
- Create: `web/public/json-editor-core.js`
- Create: `web/tests/json-editor-core.test.js`

- [ ] Write tests for valid parse, invalid parse, format, compact, stable sort, path diff, and download filename fallback.
- [ ] Implement pure helpers without DOM dependencies.
- [ ] Run `node --test tests/json-editor-core.test.js`.

### Task 3: Add Route And Hub Entry

**Files:**
- Modify: `web/public/routes.js`
- Modify: `web/public/index.html`
- Modify: `web/public/app.js`
- Modify: `web/vercel.json`
- Modify: `web/tests/routes.test.js`
- Modify: `web/tests/ui-structure.test.js`

- [ ] Add route id `jsonEditor` with path `/json-editor`.
- [ ] Add hub card "JSON Editor".
- [ ] Add app shell with back button and placeholder editor panes.
- [ ] Wire navigation and browser back/forward behavior.
- [ ] Add Vercel rewrite.
- [ ] Run route and UI structure tests.

### Task 4: Create Editor Pane Controller

**Files:**
- Create: `web/public/json-editor-tool.js`
- Modify: `web/public/app.js`
- Modify: `web/public/index.html`
- Modify: `web/public/styles.css`
- Create or modify: `web/tests/json-editor-ui.test.js`

- [ ] Initialize left and right `vanilla-jsoneditor` instances once.
- [ ] Load selected files into the target pane.
- [ ] Track filename, parse status, and content changes.
- [ ] Implement copy formatted and download actions.
- [ ] Show per-pane validation messages.
- [ ] Verify the route can be opened repeatedly without creating duplicate editor instances.

### Task 5: Add Two-Pane Actions And Compare Result

**Files:**
- Modify: `web/public/json-editor-tool.js`
- Modify: `web/public/json-editor-core.js`
- Modify: `web/public/index.html`
- Modify: `web/public/styles.css`
- Modify: `web/tests/json-editor-core.test.js`
- Create or modify: `web/tests/json-editor-ui.test.js`

- [ ] Implement copy left to right.
- [ ] Implement copy right to left.
- [ ] Implement swap panes.
- [ ] Implement compare.
- [ ] Render equal state, changed path count, and diff rows.
- [ ] Handle invalid JSON by showing which pane failed and preventing stale diff output.

### Task 6: Verification And Browser QA

**Files:**
- Modify only if verification reveals a defect.

- [ ] Run syntax checks:

```powershell
cd web
node --check public/app.js
node --check public/routes.js
node --check public/json-editor-core.js
node --check public/json-editor-tool.js
```

- [ ] Run tests:

```powershell
cd web
node --test --test-isolation=none
```

- [ ] Run diff hygiene:

```powershell
git diff --check
```

- [ ] Browser smoke test:
  - Open `/json-editor`.
  - Load one small JSON into the left pane.
  - Load a modified JSON into the right pane.
  - Switch modes between text/tree/table.
  - Format and compact.
  - Copy left to right.
  - Swap panes.
  - Compare and confirm changed paths render.
  - Download a pane and confirm it contains formatted JSON.

## Open Decisions For User Review

- Should MVP use `vanilla-jsoneditor` directly, or should we build a lightweight in-house editor first?
- Should browser draft recovery be enabled through localStorage, or should editor contents disappear on refresh for privacy?
- Should comparison treat arrays by index only, or should we later support matching by a key such as `id`, `name`, or `recognitionText`?
- Should this tool later open JSON records from DB Admin or JSON Explorer into left/right panes?

## Recommendation

Use `vanilla-jsoneditor` for the editor panes and build our own team-specific shell around it. This keeps the behavior close to JSON Editor Online without forcing us to clone unrelated cloud/account features. The first useful version should focus on local file/paste editing, tree/table inspection, formatting, copy direction, swap, and structural comparison.
