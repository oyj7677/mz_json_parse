# String Resource UI Refinements Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make String Resource Explorer easier to scan by moving File/Sheet metadata into the detail dialog, opening details from Resource ID, and replacing the flat sheet checklist with a scrollable file/sheet tree.

**Architecture:** Keep the existing `selectedSheetIds` filtering model and existing detail modal. Change only the String Resource UI rendering layer in `web/public/app.js`, its CSS in `web/public/styles.css`, and structure tests in `web/tests/ui-structure.test.js`.

**Tech Stack:** Browser JavaScript modules, HTML/CSS, Node built-in test runner.

---

### Task 1: Update UI Structure Tests For The New Contracts

**Files:**
- Modify: `web/tests/ui-structure.test.js`

- [ ] **Step 1: Add assertions for the sheet tree and ID detail trigger**

Add assertions in the `provides a String Resource Explorer upload and search workspace` test:

```js
assert.match(app, /expandedFileIds:\s*new Set\(\)/);
assert.match(app, /toggleStringResourceFileNode/);
assert.match(app, /toggleStringResourceFileSheets/);
assert.match(app, /renderStringResourceFileNode/);
assert.match(app, /renderStringResourceSheetNode/);
assert.match(app, /openStringResourceDetail\(row\.id\)/);
assert.match(css, /\.string-resource-sheet-tree\s*{/);
assert.match(css, /\.string-resource-sheet-tree-body\s*{/);
assert.match(css, /\.string-resource-file-node\s*{/);
assert.match(css, /\.string-resource-id-button\s*{/);
```

Also assert the old table columns are gone from the dynamic header code:

```js
assert.doesNotMatch(app, /\['Resource ID', 'File', 'Sheet'/);
assert.doesNotMatch(app, /\.\.\.qualifiers,\s*'보기'/);
```

- [ ] **Step 2: Run the targeted structure test and confirm it fails before implementation**

Run: `node --test --test-isolation=none tests/ui-structure.test.js`

Expected before implementation: FAIL because the tree functions/classes and ID button are not present.

### Task 2: Add File/Sheet Tree State And Rendering

**Files:**
- Modify: `web/public/app.js`

- [ ] **Step 1: Add expanded file state**

Add `expandedFileIds` to `state.stringResource`:

```js
expandedFileIds: new Set(),
```

Reset it in the clear button handler:

```js
state.stringResource.expandedFileIds = new Set();
```

When a workbook is registered, expand files that contain selected candidate sheets:

```js
let hasCandidateSheet = false;
for (const summary of normalized.sheetSummaries) {
  if (summary.isCandidate) {
    hasCandidateSheet = true;
    state.stringResource.selectedSheetIds.add(stringResourceSheetId(fileId, summary.name));
  }
}
if (hasCandidateSheet) {
  state.stringResource.expandedFileIds.add(fileId);
}
```

- [ ] **Step 2: Replace flat sheet rendering with tree rendering**

Replace the body of `renderStringResourceSheets()` with a fragment that appends one file node per uploaded file:

```js
const tree = document.createElement('div');
tree.className = 'string-resource-sheet-tree';

for (const file of state.stringResource.files) {
  tree.append(renderStringResourceFileNode(file));
}

elements.stringResourceSheetList.append(tree);
```

Add helper functions:

```js
function renderStringResourceFileNode(file) {
  const selectedCount = countSelectedStringResourceSheets(file);
  const totalCount = file.sheetSummaries.length;
  const isExpanded = state.stringResource.expandedFileIds.has(file.fileId);
  const node = document.createElement('section');
  node.className = 'string-resource-file-node';

  const header = document.createElement('div');
  header.className = 'string-resource-file-row';

  const toggleButton = document.createElement('button');
  toggleButton.className = 'string-resource-tree-toggle';
  toggleButton.type = 'button';
  toggleButton.textContent = isExpanded ? '▾' : '▸';
  toggleButton.setAttribute('aria-expanded', String(isExpanded));
  toggleButton.addEventListener('click', () => toggleStringResourceFileNode(file.fileId));

  const checkbox = document.createElement('input');
  checkbox.type = 'checkbox';
  checkbox.checked = totalCount > 0 && selectedCount === totalCount;
  checkbox.indeterminate = selectedCount > 0 && selectedCount < totalCount;
  checkbox.addEventListener('change', () => toggleStringResourceFileSheets(file, checkbox.checked));

  const titleButton = document.createElement('button');
  titleButton.className = 'string-resource-file-title';
  titleButton.type = 'button';
  titleButton.textContent = file.fileName;
  titleButton.addEventListener('click', () => toggleStringResourceFileNode(file.fileId));

  const count = document.createElement('span');
  count.className = 'string-resource-file-count';
  count.textContent = `${selectedCount.toLocaleString()}/${totalCount.toLocaleString()}`;

  header.append(toggleButton, checkbox, titleButton, count);
  node.append(header);

  if (isExpanded) {
    const body = document.createElement('div');
    body.className = 'string-resource-sheet-tree-body';
    for (const summary of file.sheetSummaries) {
      body.append(renderStringResourceSheetNode(file, summary));
    }
    node.append(body);
  }

  return node;
}
```

```js
function renderStringResourceSheetNode(file, summary) {
  const sheetId = stringResourceSheetId(file.fileId, summary.name);
  const label = document.createElement('label');
  label.className = 'string-resource-sheet-row';

  const checkbox = document.createElement('input');
  checkbox.type = 'checkbox';
  checkbox.checked = state.stringResource.selectedSheetIds.has(sheetId);
  checkbox.addEventListener('change', () => toggleStringResourceSheet(sheetId));

  const text = document.createElement('span');
  text.textContent = `${summary.name} · ${summary.rowCount.toLocaleString()} rows · ${summary.isCandidate ? '자동 감지' : '수동 선택 가능'}`;

  label.append(checkbox, text);
  return label;
}
```

- [ ] **Step 3: Add tree control helpers**

Add helpers near `toggleStringResourceSheet()`:

```js
function countSelectedStringResourceSheets(file) {
  return file.sheetSummaries.filter((summary) =>
    state.stringResource.selectedSheetIds.has(stringResourceSheetId(file.fileId, summary.name))
  ).length;
}

function toggleStringResourceFileNode(fileId) {
  if (state.stringResource.expandedFileIds.has(fileId)) {
    state.stringResource.expandedFileIds.delete(fileId);
  } else {
    state.stringResource.expandedFileIds.add(fileId);
  }
  renderStringResource();
}

function toggleStringResourceFileSheets(file, shouldSelect) {
  for (const summary of file.sheetSummaries) {
    const sheetId = stringResourceSheetId(file.fileId, summary.name);
    if (shouldSelect) {
      state.stringResource.selectedSheetIds.add(sheetId);
    } else {
      state.stringResource.selectedSheetIds.delete(sheetId);
    }
  }
  renderStringResource();
}
```

- [ ] **Step 4: Run targeted tests**

Run: `node --test --test-isolation=none tests/ui-structure.test.js`

Expected: any remaining failure points to table/header or CSS work still pending.

### Task 3: Open Detail Dialog From Resource ID

**Files:**
- Modify: `web/public/app.js`

- [ ] **Step 1: Remove File, Sheet, and action columns from the String Resource table**

Change `renderStringResourceTableHeader(qualifiers)` to only render Resource ID and visible language columns:

```js
for (const label of ['Resource ID', ...qualifiers]) {
```

Change `renderStringResourceTableRow(row, qualifiers)` so the first cell contains a detail button and remove the File, Sheet, and action cells:

```js
appendStringResourceIdCell(tr, row);

for (const qualifier of qualifiers) {
  appendStringResourceCell(tr, row.languages[qualifier] ?? '', 'string-resource-language-cell');
}

return tr;
```

Add the ID cell helper:

```js
function appendStringResourceIdCell(tableRow, row) {
  const cell = document.createElement('td');
  cell.className = 'string-resource-id-cell';

  const button = document.createElement('button');
  button.className = 'string-resource-id-button';
  button.type = 'button';
  button.textContent = row.resourceId;
  button.title = `${row.fileName} · ${row.sheetName} · row ${row.rowNumber}`;
  button.addEventListener('click', () => openStringResourceDetail(row.id));

  cell.append(button);
  tableRow.append(cell);
}
```

- [ ] **Step 2: Run targeted tests**

Run: `node --test --test-isolation=none tests/ui-structure.test.js`

Expected: structure tests pass after CSS is also updated.

### Task 4: Add Tree And ID Button Styling

**Files:**
- Modify: `web/public/styles.css`

- [ ] **Step 1: Make the sheet panel a bounded flex column**

Add or update these rules:

```css
.string-resource-sheet-panel {
  display: flex;
  flex-direction: column;
  min-height: 0;
}

.string-resource-sheet-panel > h2,
.string-resource-sheet-panel > p {
  flex-shrink: 0;
}

#stringResourceSheetList {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  scrollbar-gutter: stable;
}
```

- [ ] **Step 2: Style the file/sheet tree**

Add:

```css
.string-resource-sheet-tree {
  display: grid;
  gap: 4px;
  min-height: 0;
}

.string-resource-file-node {
  border-bottom: 1px solid var(--line);
  padding: 6px 0;
}

.string-resource-file-row {
  display: grid;
  grid-template-columns: 24px 18px minmax(0, 1fr) auto;
  align-items: center;
  gap: 8px;
}

.string-resource-tree-toggle,
.string-resource-file-title,
.string-resource-id-button {
  border: 0;
  background: transparent;
  color: inherit;
  cursor: pointer;
  font: inherit;
}

.string-resource-file-title,
.string-resource-id-button {
  min-width: 0;
  overflow-wrap: anywhere;
  text-align: left;
}

.string-resource-file-count {
  color: var(--muted);
  font-size: 12px;
}

.string-resource-sheet-tree-body {
  display: grid;
  gap: 6px;
  margin-top: 8px;
  padding-left: 50px;
}

.string-resource-id-button {
  font-weight: 850;
  text-decoration: underline;
  text-decoration-thickness: 1px;
  text-underline-offset: 3px;
}
```

- [ ] **Step 3: Run targeted tests**

Run: `node --test --test-isolation=none tests/ui-structure.test.js`

Expected: PASS.

### Task 5: Full Verification And Commit

**Files:**
- Modify: `web/public/app.js`
- Modify: `web/public/styles.css`
- Modify: `web/tests/ui-structure.test.js`

- [ ] **Step 1: Run syntax and full tests**

Run:

```bash
node --check public/app.js
node --test --test-isolation=none
git diff --check
```

Expected:

- `node --check public/app.js`: exit 0.
- `node --test --test-isolation=none`: all tests pass.
- `git diff --check`: exit 0.

- [ ] **Step 2: Commit implementation**

```bash
git add -- web/public/app.js web/public/styles.css web/tests/ui-structure.test.js
git commit -m "feat: refine string resource selector and detail table"
```

- [ ] **Step 3: Browser smoke test**

Use the existing local server at `http://localhost:5174/`. Reload the page and verify:

- String Resource Explorer still opens.
- Sheet selector is a file/sheet tree with internal scrolling.
- Resource ID is clickable.
- Detail dialog still shows filename, sheet name, and row number.
