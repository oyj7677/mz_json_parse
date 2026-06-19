# JSON Explorer Search Table Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rework JSON Explorer into a search-first table UI with metadata columns, comma-based AND search, recognitionText suggestions, a registered-files drawer, and a JSON detail modal.

**Architecture:** Keep the app as a static browser app with shared pure helpers in `web/public/core.js` and DOM rendering in `web/public/app.js`. Add metadata extraction/search helpers first so the table, suggestions, and drawer can all read from one consistent Explorer item shape.

**Tech Stack:** Plain HTML/CSS/ES modules, Node test runner, existing local server in `web/server.js`.

---

## File Structure

- Modify `web/public/core.js`
  - Add Explorer table field extraction.
  - Add comma search term parsing.
  - Update Explorer filtering to search all visible table fields with AND semantics.
  - Add recognitionText suggestion generation.
- Modify `web/tests/explorer.test.js`
  - Cover table metadata extraction, slot summary, empty-query behavior, comma AND search, and suggestions.
- Modify `web/public/index.html`
  - Replace the current two-panel Explorer layout with toolbar, search area, result table, registered-files drawer, and JSON modal DOM.
- Modify `web/tests/ui-structure.test.js`
  - Assert the new Explorer DOM contracts.
- Modify `web/public/app.js`
  - Render search-first empty states.
  - Render result table only when search terms exist.
  - Render suggestions and apply selected suggestions.
  - Render registered-files drawer and deletion.
  - Render JSON detail modal.
- Modify `web/public/styles.css`
  - Add compact toolbar, search area, suggestions dropdown, internal-scroll table, drawer, and modal styling.
  - Remove or stop relying on the old Explorer detail panel styles.

---

### Task 1: Explorer Metadata, Search, And Suggestions Helpers

**Files:**
- Modify: `web/tests/explorer.test.js`
- Modify: `web/public/core.js`

- [ ] **Step 1: Write failing tests for Explorer table fields**

Add this test in `web/tests/explorer.test.js` inside `describe('JSON Explorer helpers', ...)`:

```js
it('creates explorer items with table fields for search results', () => {
  const item = createExplorerItem({
    id: 1,
    sourceFilename: '06-15-weather-final.json',
    value: {
      language: 'en_AU',
      embeddedResult: {
        result: {
          SimpleResult: [
            {
              slots: [
                { name: 'location', value: 'Sydney' },
                { name: 'date', literal: 'today' }
              ]
            }
          ]
        }
      },
      serverResult: {
        result: {
          contentType: 'Weather',
          table_version: '3.3.15',
          vrResult: {
            recognitionText: 'What is the weather'
          }
        }
      }
    },
    valueKind: 'json'
  });

  assert.equal(item.sourceFilename, '06-15-weather-final.json');
  assert.equal(item.recognitionText, 'What is the weather');
  assert.equal(item.language, 'en_AU');
  assert.equal(item.slotSummary, 'location=Sydney, date=today');
  assert.equal(item.contentType, 'Weather');
  assert.equal(item.tableVersion, '3.3.15');
});
```

- [ ] **Step 2: Write failing tests for empty query and comma AND search**

Replace the current filter test in `web/tests/explorer.test.js` with:

```js
it('filters explorer items by visible table fields using comma-separated AND terms', () => {
  const items = [
    createExplorerItem({
      id: 1,
      sourceFilename: 'weather-au.json',
      value: {
        language: 'en_AU',
        embeddedResult: { result: { SimpleResult: [{ slots: [{ name: 'location', value: 'Sydney' }] }] } },
        serverResult: { result: { contentType: 'Weather', table_version: '3.3.15' } },
        recognitionText: 'What is the weather'
      },
      valueKind: 'json'
    }),
    createExplorerItem({
      id: 2,
      sourceFilename: 'navigation-us.json',
      value: {
        language: 'en_US',
        embeddedResult: { result: { SimpleResult: [{ slots: [{ name: 'destination', value: 'home' }] }] } },
        serverResult: { result: { contentType: 'Navigation', table_version: '3.3.12' } },
        recognitionText: 'Navigate to home'
      },
      valueKind: 'json'
    }),
    createExplorerItem({
      id: 3,
      sourceFilename: 'music.json',
      value: {
        language: 'ko_KR',
        serverResult: { result: { contentType: 'Music', table_version: '3.3.15' } },
        recognitionText: '음악 재생'
      },
      valueKind: 'json'
    })
  ];

  assert.deepEqual(filterExplorerItems(items, '').map((item) => item.id), []);
  assert.deepEqual(filterExplorerItems(items, 'weather').map((item) => item.id), [1]);
  assert.deepEqual(filterExplorerItems(items, 'en_US').map((item) => item.id), [2]);
  assert.deepEqual(filterExplorerItems(items, '3.3.15').map((item) => item.id), [1, 3]);
  assert.deepEqual(filterExplorerItems(items, 'weather,en_AU').map((item) => item.id), [1]);
  assert.deepEqual(filterExplorerItems(items, 'weather,en_US').map((item) => item.id), []);
  assert.deepEqual(filterExplorerItems(items, 'destination=home').map((item) => item.id), [2]);
});
```

- [ ] **Step 3: Write failing tests for recognitionText suggestions**

Update the import in `web/tests/explorer.test.js`:

```js
import {
  buildExplorerSuggestions,
  createExplorerItem,
  filterExplorerItems,
  formatDownloadContent,
  parseExplorerSearchTerms
} from '../public/core.js';
```

Add:

```js
it('builds recognitionText suggestions and replaces only the active comma term', () => {
  const items = [
    createExplorerItem({
      id: 1,
      sourceFilename: 'weather.json',
      value: { recognitionText: 'What is the weather' },
      valueKind: 'json'
    }),
    createExplorerItem({
      id: 2,
      sourceFilename: 'navigate.json',
      value: { recognitionText: 'Navigate to home' },
      valueKind: 'json'
    })
  ];

  assert.deepEqual(parseExplorerSearchTerms('weather, en_AU'), ['weather', 'en_AU']);

  const suggestions = buildExplorerSuggestions(items, 'weather, nav');
  assert.equal(suggestions.length, 1);
  assert.equal(suggestions[0].recognitionText, 'Navigate to home');
  assert.equal(suggestions[0].sourceFilename, 'navigate.json');
  assert.equal(suggestions[0].replacementQuery, 'weather, Navigate to home');
});
```

- [ ] **Step 4: Run tests to verify they fail**

Run:

```powershell
npm test -- --test-name-pattern "Explorer"
```

Expected: tests fail because `language`, `slotSummary`, `contentType`, `tableVersion`, `parseExplorerSearchTerms`, and `buildExplorerSuggestions` do not exist or the old filter returns all items for an empty query.

- [ ] **Step 5: Implement Explorer helper functions**

In `web/public/core.js`, add these helper functions before `createExplorerItem`:

```js
function findFirstByPaths(value, paths) {
  for (const path of paths) {
    let current = value;
    for (const key of path) {
      if (current === null || typeof current !== 'object' || !(key in current)) {
        current = undefined;
        break;
      }
      current = current[key];
    }

    if (current !== undefined && current !== null && String(current).trim()) {
      return String(current);
    }
  }

  return '';
}

function findFirstSlots(value) {
  const seen = new Set();

  function visit(current) {
    if (current === null || typeof current !== 'object') {
      return [];
    }
    if (seen.has(current)) {
      return [];
    }
    seen.add(current);

    if (Array.isArray(current.slots)) {
      return current.slots;
    }

    if (Array.isArray(current)) {
      for (const item of current) {
        const found = visit(item);
        if (found.length > 0) {
          return found;
        }
      }
      return [];
    }

    for (const key of Object.keys(current)) {
      const found = visit(current[key]);
      if (found.length > 0) {
        return found;
      }
    }

    return [];
  }

  return visit(value);
}

function slotName(slot, index) {
  if (slot === null || typeof slot !== 'object') {
    return `slot${index + 1}`;
  }

  return String(
    slot.name ?? slot.slotName ?? slot.key ?? slot.type ?? `slot${index + 1}`
  ).trim();
}

function slotValue(slot) {
  if (slot === null || typeof slot !== 'object') {
    return String(slot ?? '').trim();
  }

  const rawValue = slot.value ?? slot.literal ?? slot.text ?? slot.normalizedValue ?? slot.normalized ?? '';
  if (rawValue === null || rawValue === undefined) {
    return '';
  }

  if (typeof rawValue === 'object') {
    const nestedValue = rawValue.value ?? rawValue.text ?? rawValue.literal ?? rawValue.scalar ?? '';
    return String(nestedValue ?? '').trim();
  }

  return String(rawValue).trim();
}

function summarizeSlots(value) {
  const slots = findFirstSlots(value);
  const summary = slots
    .map((slot, index) => {
      const name = slotName(slot, index);
      const valueText = slotValue(slot);
      return valueText ? `${name}=${valueText}` : name;
    })
    .filter(Boolean);

  return summary.join(', ');
}

function explorerSearchText(item) {
  return [
    item.sourceFilename,
    item.recognitionText,
    item.language,
    item.slotSummary,
    item.contentType,
    item.tableVersion
  ].map((value) => String(value ?? '').toLowerCase()).join(' ');
}
```

Then replace `createExplorerItem` and `filterExplorerItems`, and add the two exported helper functions:

```js
export function createExplorerItem({
  id,
  sourceFilename = '',
  value,
  valueKind = 'json',
  warning = ''
}) {
  const recognitionText = findRecognitionText(value) ?? '';
  const language = findFirstByPaths(value, [['language']]);
  const contentType = findFirstByPaths(value, [
    ['serverResult', 'result', 'contentType'],
    ['contentType']
  ]);
  const tableVersion = findFirstByPaths(value, [
    ['serverResult', 'result', 'table_version'],
    ['table_version']
  ]);
  const slotSummary = summarizeSlots(value);

  return {
    contentType,
    id,
    language,
    recognitionText,
    slotSummary,
    sourceFilename,
    tableVersion,
    title: recognitionText || 'recognitionText 없음',
    value,
    valueKind,
    warning
  };
}

export function parseExplorerSearchTerms(query) {
  return String(query ?? '')
    .split(',')
    .map((term) => term.trim())
    .filter(Boolean);
}

export function filterExplorerItems(items, query) {
  const terms = parseExplorerSearchTerms(query).map((term) => term.toLowerCase());

  if (terms.length === 0) {
    return [];
  }

  return items.filter((item) => {
    const haystack = explorerSearchText(item);
    return terms.every((term) => haystack.includes(term));
  });
}

export function buildExplorerSuggestions(items, query, limit = 8) {
  const rawQuery = String(query ?? '');
  const segments = rawQuery.split(',');
  const activeTerm = segments.at(-1)?.trim().toLowerCase() ?? '';

  if (!activeTerm) {
    return [];
  }

  const prefix = segments.length > 1
    ? `${segments.slice(0, -1).map((segment) => segment.trim()).filter(Boolean).join(', ')}, `
    : '';

  return items
    .filter((item) => (
      item.recognitionText &&
      item.recognitionText.toLowerCase().includes(activeTerm)
    ))
    .slice(0, limit)
    .map((item) => ({
      id: item.id,
      recognitionText: item.recognitionText,
      replacementQuery: `${prefix}${item.recognitionText}`,
      sourceFilename: item.sourceFilename
    }));
}
```

- [ ] **Step 6: Run tests to verify helper behavior passes**

Run:

```powershell
npm test -- --test-name-pattern "Explorer"
```

Expected: Explorer helper tests pass.

- [ ] **Step 7: Commit Task 1 changes**

Run:

```powershell
git add web/public/core.js web/tests/explorer.test.js
git commit -m "feat: add explorer table search helpers"
```

---

### Task 2: Search-First Explorer Markup

**Files:**
- Modify: `web/public/index.html`
- Modify: `web/tests/ui-structure.test.js`

- [ ] **Step 1: Write failing UI structure tests**

In `web/tests/ui-structure.test.js`, update the Explorer UI structure test to assert the new DOM contracts:

```js
assert.match(html, /id="explorerToolbar"/);
assert.match(html, /id="explorerFileCount"/);
assert.match(html, /id="explorerResultCount"/);
assert.match(html, /id="toggleExplorerFilesButton"/);
assert.match(html, /id="explorerSuggestions"/);
assert.match(html, /id="explorerResults"/);
assert.match(html, /id="explorerTable"/);
assert.match(html, /id="explorerTableBody"/);
assert.match(html, /id="explorerEmptyState"/);
assert.match(html, /id="explorerFileDrawer"/);
assert.match(html, /id="explorerRegisteredList"/);
assert.match(html, /id="explorerModal"/);
assert.match(html, /id="explorerModalJson"/);
assert.match(html, /파일명/);
assert.match(html, /recognitionText/);
assert.match(html, /language/);
assert.match(html, /slot/);
assert.match(html, /contentType/);
assert.match(html, /table_version/);
assert.match(app, /renderExplorerTable/);
assert.match(app, /renderExplorerSuggestions/);
assert.match(app, /openExplorerModal/);
assert.match(app, /toggleExplorerFileDrawer/);
```

- [ ] **Step 2: Run UI structure test to verify it fails**

Run:

```powershell
npm test -- --test-name-pattern "file-upload based recognitionText explorer"
```

Expected: fails because the new IDs do not exist.

- [ ] **Step 3: Replace Explorer workspace markup**

In `web/public/index.html`, replace the current `<section class="explorer-workspace" ...>` inside `#explorerApp` with:

```html
      <section class="explorer-workspace search-first-workspace" aria-label="JSON Explorer workspace">
        <section class="explorer-toolbar" id="explorerToolbar" aria-label="JSON Explorer toolbar">
          <div class="explorer-upload-tools">
            <label class="file-picker" for="explorerFileInput">JSON 파일 선택</label>
            <input id="explorerFileInput" type="file" accept=".json,application/json" multiple>
            <label class="file-picker" for="explorerFolderInput">JSON 폴더 선택</label>
            <input id="explorerFolderInput" type="file" accept=".json,application/json" webkitdirectory multiple>
            <span id="explorerUploadStatus" aria-live="polite">파일을 선택하면 검색 데이터가 준비됩니다.</span>
          </div>

          <div class="explorer-toolbar-meta" aria-label="Explorer status">
            <span id="explorerFileCount">등록된 파일 0개</span>
            <span id="explorerResultCount">검색 결과 0개</span>
          </div>

          <div class="explorer-toolbar-actions">
            <button class="ghost-button" id="toggleExplorerFilesButton" type="button" aria-expanded="false" aria-controls="explorerFileDrawer">
              등록 파일 보기
            </button>
            <button class="ghost-button" id="clearExplorerButton" type="button" disabled>
              목록 비우기
            </button>
          </div>
        </section>

        <section class="explorer-search-area" aria-label="JSON Explorer search">
          <label class="search-field explorer-main-search" for="explorerSearchInput">
            <span>통합 검색</span>
            <input
              id="explorerSearchInput"
              type="search"
              autocomplete="off"
              placeholder="recognitionText, 파일명, slot, contentType 등으로 검색"
            >
          </label>
          <div class="explorer-suggestions" id="explorerSuggestions" hidden></div>
        </section>

        <section class="explorer-results" id="explorerResults" aria-live="polite">
          <div class="empty-state explorer-empty-state" id="explorerEmptyState">
            recognitionText 또는 파일명 등으로 검색하세요.
          </div>

          <div class="explorer-table-shell" id="explorerTableShell" hidden>
            <table class="explorer-table" id="explorerTable">
              <thead>
                <tr>
                  <th scope="col">파일명</th>
                  <th scope="col">recognitionText</th>
                  <th scope="col">language</th>
                  <th scope="col">slot</th>
                  <th scope="col">contentType</th>
                  <th scope="col">table_version</th>
                  <th scope="col">보기</th>
                </tr>
              </thead>
              <tbody id="explorerTableBody"></tbody>
            </table>
          </div>
        </section>

        <aside class="explorer-file-drawer" id="explorerFileDrawer" hidden aria-label="등록 파일 목록">
          <div class="drawer-head">
            <div>
              <h2>등록 파일</h2>
              <p id="explorerDrawerCount">등록된 파일 0개</p>
            </div>
            <button class="icon-button" id="closeExplorerFilesButton" type="button" aria-label="등록 파일 닫기">X</button>
          </div>
          <div class="registered-file-list" id="explorerRegisteredList"></div>
        </aside>
      </section>

      <div class="json-modal" id="explorerModal" hidden>
        <button class="modal-backdrop" id="explorerModalBackdrop" type="button" aria-label="JSON 상세 닫기"></button>
        <section class="modal-panel" role="dialog" aria-modal="true" aria-labelledby="explorerModalTitle">
          <div class="modal-head">
            <div>
              <h2 id="explorerModalTitle">JSON 상세</h2>
              <p id="explorerModalMeta"></p>
            </div>
            <button class="icon-button" id="closeExplorerModalButton" type="button" aria-label="JSON 상세 닫기">X</button>
          </div>
          <pre class="json-preview explorer-modal-json" id="explorerModalJson"></pre>
        </section>
      </div>
```

- [ ] **Step 4: Run UI structure test to verify markup passes**

Run:

```powershell
npm test -- --test-name-pattern "file-upload based recognitionText explorer"
```

Expected: the structure test passes once `app.js` function names are added in Task 3. If it still fails only because functions are missing, continue to Task 3.

- [ ] **Step 5: Commit Task 2 changes**

Run:

```powershell
git add web/public/index.html web/tests/ui-structure.test.js
git commit -m "feat: add search-first explorer markup"
```

---

### Task 3: Explorer Rendering And Interactions

**Files:**
- Modify: `web/public/app.js`

- [ ] **Step 1: Update imports and Explorer state**

In `web/public/app.js`, add the new imports:

```js
  buildExplorerSuggestions,
  parseExplorerSearchTerms,
```

Update `state.explorer`:

```js
  explorer: {
    activeItemId: null,
    errors: [],
    isFileDrawerOpen: false,
    items: [],
    modalItemId: null,
    nextId: 1,
    query: ''
  },
```

- [ ] **Step 2: Update `elements` map**

Add these selectors:

```js
  closeExplorerFilesButton: document.querySelector('#closeExplorerFilesButton'),
  closeExplorerModalButton: document.querySelector('#closeExplorerModalButton'),
  explorerDrawerCount: document.querySelector('#explorerDrawerCount'),
  explorerEmptyState: document.querySelector('#explorerEmptyState'),
  explorerFileCount: document.querySelector('#explorerFileCount'),
  explorerFileDrawer: document.querySelector('#explorerFileDrawer'),
  explorerModal: document.querySelector('#explorerModal'),
  explorerModalBackdrop: document.querySelector('#explorerModalBackdrop'),
  explorerModalJson: document.querySelector('#explorerModalJson'),
  explorerModalMeta: document.querySelector('#explorerModalMeta'),
  explorerModalTitle: document.querySelector('#explorerModalTitle'),
  explorerRegisteredList: document.querySelector('#explorerRegisteredList'),
  explorerResultCount: document.querySelector('#explorerResultCount'),
  explorerSuggestions: document.querySelector('#explorerSuggestions'),
  explorerTableBody: document.querySelector('#explorerTableBody'),
  explorerTableShell: document.querySelector('#explorerTableShell'),
  toggleExplorerFilesButton: document.querySelector('#toggleExplorerFilesButton'),
```

Remove references to `explorerDetail`, `explorerDetailMeta`, `explorerDetailTitle`, `explorerJsonPreview`, and `explorerList` after their replacement functions are complete.

- [ ] **Step 3: Update event listeners**

Replace the Explorer search listener with:

```js
elements.explorerSearchInput.addEventListener('input', (event) => {
  state.explorer.query = event.target.value;
  renderExplorer();
});
```

Add:

```js
elements.toggleExplorerFilesButton.addEventListener('click', () => {
  toggleExplorerFileDrawer();
});

elements.closeExplorerFilesButton.addEventListener('click', () => {
  setExplorerFileDrawerOpen(false);
});

elements.closeExplorerModalButton.addEventListener('click', () => {
  closeExplorerModal();
});

elements.explorerModalBackdrop.addEventListener('click', () => {
  closeExplorerModal();
});
```

Update the Escape key handler:

```js
document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape' && !elements.helpOverlay.hidden) {
    closeHelp();
    return;
  }

  if (event.key === 'Escape' && !elements.explorerModal.hidden) {
    closeExplorerModal();
    return;
  }

  if (event.key === 'Escape' && state.explorer.isFileDrawerOpen) {
    setExplorerFileDrawerOpen(false);
  }
});
```

- [ ] **Step 4: Update upload and clear behavior**

In `registerExplorerFiles`, keep parsing behavior but after upload call `renderExplorer()` only. The helper now returns no rows for empty query.

In clear button handler, use:

```js
elements.clearExplorerButton.addEventListener('click', () => {
  state.explorer.activeItemId = null;
  state.explorer.errors = [];
  state.explorer.isFileDrawerOpen = false;
  state.explorer.items = [];
  state.explorer.modalItemId = null;
  state.explorer.query = '';
  elements.explorerSearchInput.value = '';
  setExplorerUploadStatus('파일을 선택하면 검색 데이터가 준비됩니다.');
  closeExplorerModal();
  renderExplorer();
});
```

- [ ] **Step 5: Replace `renderExplorer`**

Replace the old `renderExplorer()` with:

```js
function renderExplorer() {
  const totalCount = state.explorer.items.length;
  const errorCount = state.explorer.errors.length;
  const searchTerms = parseExplorerSearchTerms(state.explorer.query);
  const filteredItems = filterExplorerItems(state.explorer.items, state.explorer.query);
  const hasQuery = searchTerms.length > 0;

  elements.explorerCount.textContent = `등록된 JSON ${totalCount}개`;
  elements.explorerFileCount.textContent = `등록된 파일 ${totalCount}개`;
  elements.explorerResultCount.textContent = `검색 결과 ${hasQuery ? filteredItems.length : 0}개`;
  elements.clearExplorerButton.disabled = totalCount === 0 && errorCount === 0;

  renderExplorerSuggestions();
  renderExplorerTable(filteredItems, hasQuery, searchTerms);
  renderExplorerRegisteredFiles();
  renderExplorerFileDrawer();
  renderExplorerModal();
}
```

- [ ] **Step 6: Add table rendering**

Add:

```js
function renderExplorerTable(filteredItems, hasQuery, searchTerms) {
  elements.explorerTableBody.replaceChildren();

  if (state.explorer.items.length === 0) {
    elements.explorerEmptyState.textContent = 'JSON 파일 또는 폴더를 먼저 등록하세요.';
    elements.explorerEmptyState.hidden = false;
    elements.explorerTableShell.hidden = true;
    return;
  }

  if (!hasQuery) {
    elements.explorerEmptyState.textContent = 'recognitionText 또는 파일명 등으로 검색하세요.';
    elements.explorerEmptyState.hidden = false;
    elements.explorerTableShell.hidden = true;
    return;
  }

  if (filteredItems.length === 0) {
    elements.explorerEmptyState.textContent = `다음 조건을 모두 만족하는 결과가 없습니다: ${searchTerms.join(', ')}`;
    elements.explorerEmptyState.hidden = false;
    elements.explorerTableShell.hidden = true;
    return;
  }

  const fragment = document.createDocumentFragment();
  for (const item of filteredItems) {
    fragment.append(renderExplorerTableRow(item));
  }

  elements.explorerTableBody.replaceChildren(fragment);
  elements.explorerEmptyState.hidden = true;
  elements.explorerTableShell.hidden = false;
}

function renderExplorerTableRow(item) {
  const row = document.createElement('tr');

  const cells = [
    item.sourceFilename || '-',
    item.recognitionText || '-',
    item.language || '-',
    item.slotSummary || '-',
    item.contentType || '-',
    item.tableVersion || '-'
  ];

  for (const value of cells) {
    const cell = document.createElement('td');
    cell.textContent = value;
    cell.title = value;
    row.append(cell);
  }

  const actionCell = document.createElement('td');
  const viewButton = document.createElement('button');
  viewButton.className = 'ghost-button compact-button';
  viewButton.type = 'button';
  viewButton.textContent = '보기';
  viewButton.addEventListener('click', () => {
    openExplorerModal(item.id);
  });
  actionCell.append(viewButton);
  row.append(actionCell);

  return row;
}
```

- [ ] **Step 7: Add suggestions rendering**

Add:

```js
function renderExplorerSuggestions() {
  const suggestions = buildExplorerSuggestions(state.explorer.items, state.explorer.query);

  if (suggestions.length === 0) {
    elements.explorerSuggestions.hidden = true;
    elements.explorerSuggestions.replaceChildren();
    return;
  }

  const fragment = document.createDocumentFragment();
  for (const suggestion of suggestions) {
    const button = document.createElement('button');
    button.className = 'suggestion-row';
    button.type = 'button';

    const title = document.createElement('span');
    title.className = 'suggestion-title';
    title.textContent = suggestion.recognitionText;

    const meta = document.createElement('span');
    meta.className = 'suggestion-meta';
    meta.textContent = suggestion.sourceFilename || '파일명 없음';

    button.append(title, meta);
    button.addEventListener('click', () => {
      state.explorer.query = suggestion.replacementQuery;
      elements.explorerSearchInput.value = suggestion.replacementQuery;
      elements.explorerSuggestions.hidden = true;
      renderExplorer();
    });
    fragment.append(button);
  }

  elements.explorerSuggestions.replaceChildren(fragment);
  elements.explorerSuggestions.hidden = false;
}
```

- [ ] **Step 8: Add registered-files drawer rendering**

Add:

```js
function toggleExplorerFileDrawer() {
  setExplorerFileDrawerOpen(!state.explorer.isFileDrawerOpen);
}

function setExplorerFileDrawerOpen(isOpen) {
  state.explorer.isFileDrawerOpen = isOpen;
  renderExplorer();
}

function renderExplorerFileDrawer() {
  elements.explorerFileDrawer.hidden = !state.explorer.isFileDrawerOpen;
  elements.toggleExplorerFilesButton.setAttribute('aria-expanded', String(state.explorer.isFileDrawerOpen));
}

function renderExplorerRegisteredFiles() {
  elements.explorerDrawerCount.textContent = `등록된 파일 ${state.explorer.items.length}개`;

  const fragment = document.createDocumentFragment();
  if (state.explorer.items.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'empty-state compact-empty';
    empty.textContent = '등록된 파일이 없습니다.';
    fragment.append(empty);
  }

  for (const item of state.explorer.items) {
    fragment.append(renderExplorerRegisteredFile(item));
  }

  elements.explorerRegisteredList.replaceChildren(fragment);
}

function renderExplorerRegisteredFile(item) {
  const wrapper = document.createElement('article');
  wrapper.className = 'registered-file-row';

  const text = document.createElement('div');
  const filename = document.createElement('strong');
  filename.textContent = item.sourceFilename || '파일명 없음';
  const recognitionText = document.createElement('span');
  recognitionText.textContent = item.recognitionText || 'recognitionText 없음';
  text.append(filename, recognitionText);

  const removeButton = document.createElement('button');
  removeButton.className = 'icon-button';
  removeButton.type = 'button';
  removeButton.title = '삭제';
  removeButton.textContent = 'X';
  removeButton.addEventListener('click', () => {
    removeExplorerItem(item.id);
  });

  wrapper.append(text, removeButton);
  return wrapper;
}

function removeExplorerItem(id) {
  state.explorer.items = state.explorer.items.filter((item) => item.id !== id);
  state.explorer.errors = state.explorer.errors.filter((error) => error.id !== id);
  if (state.explorer.modalItemId === id) {
    closeExplorerModal();
  }
  renderExplorer();
}
```

- [ ] **Step 9: Add JSON modal rendering**

Add:

```js
function openExplorerModal(id) {
  state.explorer.modalItemId = id;
  renderExplorer();
}

function closeExplorerModal() {
  state.explorer.modalItemId = null;
  elements.explorerModal.hidden = true;
}

function renderExplorerModal() {
  const item = state.explorer.items.find((candidate) => candidate.id === state.explorer.modalItemId);

  if (!item) {
    elements.explorerModal.hidden = true;
    return;
  }

  elements.explorerModalTitle.textContent = item.recognitionText || item.sourceFilename || 'JSON 상세';
  elements.explorerModalMeta.textContent = [
    item.sourceFilename || '파일명 없음',
    item.language || '',
    item.contentType || '',
    item.tableVersion || ''
  ].filter(Boolean).join(' | ');
  elements.explorerModalJson.textContent = formatDownloadContent(item);
  elements.explorerModal.hidden = false;
}
```

- [ ] **Step 10: Remove old Explorer detail helpers**

Delete old functions that are no longer used:

```js
renderExplorerRow
renderExplorerDetail
ensureActiveExplorerItem
selectExplorerItem
```

Also remove references to old IDs:

```js
explorerDetail
explorerDetailMeta
explorerDetailTitle
explorerJsonPreview
explorerList
```

- [ ] **Step 11: Run tests**

Run:

```powershell
npm test
```

Expected: all tests pass.

- [ ] **Step 12: Commit Task 3 changes**

Run:

```powershell
git add web/public/app.js
git commit -m "feat: render explorer search table"
```

---

### Task 4: Search-First Explorer Styling

**Files:**
- Modify: `web/public/styles.css`
- Modify: `web/tests/ui-structure.test.js`

- [ ] **Step 1: Add CSS selector assertions**

In `web/tests/ui-structure.test.js`, add assertions to the Explorer structure test:

```js
assert.match(css, /\.explorer-toolbar\s*{/);
assert.match(css, /\.explorer-search-area\s*{/);
assert.match(css, /\.explorer-suggestions\s*{/);
assert.match(css, /\.explorer-table-shell\s*{/);
assert.match(css, /\.explorer-table\s*{/);
assert.match(css, /\.explorer-file-drawer\s*{/);
assert.match(css, /\.json-modal\s*{/);
assert.match(css, /\.modal-panel\s*{/);
```

- [ ] **Step 2: Run UI structure test to verify CSS selectors fail**

Run:

```powershell
npm test -- --test-name-pattern "file-upload based recognitionText explorer"
```

Expected: fails because the new CSS selectors are missing.

- [ ] **Step 3: Add Explorer search-first CSS**

Append or merge these styles in `web/public/styles.css`:

```css
.search-first-workspace {
  display: grid;
  grid-template-rows: auto auto minmax(0, 1fr);
  gap: 14px;
  min-height: 0;
  position: relative;
}

.explorer-toolbar {
  align-items: center;
  background: var(--panel);
  border: 1px solid var(--border);
  border-radius: 8px;
  display: flex;
  gap: 12px;
  justify-content: space-between;
  padding: 12px;
}

.explorer-upload-tools,
.explorer-toolbar-actions,
.explorer-toolbar-meta {
  align-items: center;
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.explorer-toolbar-meta span {
  color: var(--muted);
  font-size: 13px;
  white-space: nowrap;
}

.explorer-search-area {
  position: relative;
}

.explorer-main-search input {
  font-size: 18px;
  min-height: 48px;
}

.explorer-suggestions {
  background: var(--panel);
  border: 1px solid var(--border);
  border-radius: 8px;
  box-shadow: var(--shadow);
  left: 0;
  max-height: 280px;
  overflow: auto;
  position: absolute;
  right: 0;
  top: calc(100% + 6px);
  z-index: 20;
}

.suggestion-row {
  background: transparent;
  border: 0;
  cursor: pointer;
  display: grid;
  gap: 3px;
  padding: 10px 12px;
  text-align: left;
  width: 100%;
}

.suggestion-row:hover,
.suggestion-row:focus-visible {
  background: var(--soft-panel);
  outline: none;
}

.suggestion-title {
  color: var(--text);
  font-weight: 700;
}

.suggestion-meta {
  color: var(--muted);
  font-size: 12px;
}

.explorer-results {
  min-height: 0;
}

.explorer-empty-state {
  min-height: 260px;
}

.explorer-table-shell {
  border: 1px solid var(--border);
  border-radius: 8px;
  max-height: 100%;
  min-height: 0;
  overflow: auto;
}

.explorer-table {
  border-collapse: collapse;
  min-width: 980px;
  width: 100%;
}

.explorer-table th,
.explorer-table td {
  border-bottom: 1px solid var(--border);
  padding: 10px 12px;
  text-align: left;
  vertical-align: top;
}

.explorer-table th {
  background: var(--panel);
  color: var(--muted);
  font-size: 12px;
  position: sticky;
  text-transform: none;
  top: 0;
  z-index: 2;
}

.explorer-table td {
  color: var(--text);
  font-size: 13px;
  max-width: 260px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.compact-button {
  min-height: 32px;
  padding: 6px 10px;
}

.explorer-file-drawer {
  background: var(--panel);
  border-left: 1px solid var(--border);
  bottom: 0;
  box-shadow: var(--shadow);
  display: grid;
  grid-template-rows: auto minmax(0, 1fr);
  position: fixed;
  right: 0;
  top: 0;
  width: min(420px, 92vw);
  z-index: 30;
}

.drawer-head {
  align-items: center;
  border-bottom: 1px solid var(--border);
  display: flex;
  justify-content: space-between;
  padding: 16px;
}

.registered-file-list {
  display: grid;
  gap: 8px;
  overflow: auto;
  padding: 12px;
}

.registered-file-row {
  align-items: center;
  border: 1px solid var(--border);
  border-radius: 8px;
  display: grid;
  gap: 10px;
  grid-template-columns: minmax(0, 1fr) auto;
  padding: 10px;
}

.registered-file-row strong,
.registered-file-row span {
  display: block;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.registered-file-row span {
  color: var(--muted);
  font-size: 12px;
  margin-top: 3px;
}

.json-modal {
  align-items: center;
  display: grid;
  inset: 0;
  justify-items: center;
  padding: 24px;
  position: fixed;
  z-index: 40;
}

.modal-backdrop {
  background: rgba(15, 23, 42, 0.48);
  border: 0;
  cursor: pointer;
  inset: 0;
  position: absolute;
}

.modal-panel {
  background: var(--panel);
  border: 1px solid var(--border);
  border-radius: 8px;
  box-shadow: var(--shadow);
  display: grid;
  grid-template-rows: auto minmax(0, 1fr);
  max-height: min(760px, 90vh);
  max-width: min(980px, 94vw);
  min-height: 420px;
  overflow: hidden;
  position: relative;
  width: 100%;
}

.modal-head {
  align-items: start;
  border-bottom: 1px solid var(--border);
  display: flex;
  justify-content: space-between;
  padding: 16px;
}

.explorer-modal-json {
  border: 0;
  border-radius: 0;
  margin: 0;
  overflow: auto;
}
```

Add mobile adjustments:

```css
@media (max-width: 900px) {
  .explorer-toolbar {
    align-items: stretch;
    flex-direction: column;
  }

  .explorer-table-shell {
    max-height: 60vh;
  }
}
```

- [ ] **Step 4: Run tests**

Run:

```powershell
npm test
```

Expected: all tests pass.

- [ ] **Step 5: Commit Task 4 changes**

Run:

```powershell
git add web/public/styles.css web/tests/ui-structure.test.js
git commit -m "style: add explorer search table layout"
```

---

### Task 5: Browser Verification And Regression Check

**Files:**
- No required file changes.

- [ ] **Step 1: Start local server on a non-3000 port**

Run:

```powershell
$env:PORT='5173'; node server.js
```

Expected:

```text
JSON formatter running at http://localhost:5173
```

- [ ] **Step 2: Open Explorer**

Open:

```text
http://localhost:5173/
```

Click `JSON Explorer`.

Expected:

- Toolbar is compact.
- Search input is visually primary.
- Empty state says `JSON 파일 또는 폴더를 먼저 등록하세요.` when no files exist.
- Results table is hidden.

- [ ] **Step 3: Upload sample JSON folder**

Use `JSON 폴더 선택` and select:

```text
C:\Users\mediazen\Desktop\json\json
```

Expected:

- Registered file count becomes the number of uploaded JSON files.
- Results table stays hidden until a search query is entered.

- [ ] **Step 4: Verify search and AND search**

Search:

```text
weather
```

Expected: rows containing `weather` in any visible table column appear.

Search:

```text
weather,en_AU
```

Expected: only rows satisfying both terms appear.

Search:

```text
weather,zz_no_match
```

Expected:

```text
다음 조건을 모두 만족하는 결과가 없습니다: weather, zz_no_match
```

- [ ] **Step 5: Verify suggestions**

Type a partial `recognitionText`, for example:

```text
nav
```

Expected:

- Suggestion list appears.
- Each suggestion shows `recognitionText` and filename.
- Clicking a suggestion fills the search input and updates results.

Type:

```text
weather, nav
```

Expected: clicking a `Navigate...` suggestion changes only the last term.

- [ ] **Step 6: Verify modal**

Click `보기` on a result row.

Expected:

- Modal opens over the table.
- Modal title is `recognitionText` or filename.
- Modal body shows formatted JSON.
- `닫기`, backdrop, and Escape close the modal.

- [ ] **Step 7: Verify registered-files drawer**

Click `등록 파일 보기`.

Expected:

- Right drawer opens.
- Each row shows filename, `recognitionText`, and delete button.
- Deleting a file updates file count and removes matching search results.

- [ ] **Step 8: Run final automated tests**

Run:

```powershell
npm test
```

Expected:

```text
fail 0
```

- [ ] **Step 9: Commit verification-ready branch**

Run:

```powershell
git status --short
git add web/public/core.js web/public/index.html web/public/app.js web/public/styles.css web/tests/explorer.test.js web/tests/ui-structure.test.js
git commit -m "feat: redesign explorer as search table"
```

---

## Self-Review Notes

- The plan covers all confirmed UX decisions from the design spec.
- The plan keeps JSON Formatter out of scope.
- The first implementation task is pure helper logic with failing tests.
- Empty query behavior changes intentionally from "show all" to "show no results".
- Search suggestions are limited to `recognitionText + filename`; richer suggestion metadata is a later improvement.
