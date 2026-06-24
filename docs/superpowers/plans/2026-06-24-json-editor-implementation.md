# JSON Editor Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `/json-editor` 주소에서 두 JSON을 좌우로 열고, 편집/포맷팅/구조 보기/비교까지 할 수 있는 새 도구를 만든다.

**Architecture:** 기존 MZ Tools의 SPA 구조를 유지하고 새 라우트와 새 화면을 추가한다. JSON 편집기는 `vanilla-jsoneditor@3.12.0`의 standalone ES module을 `web/public/vendor`에 복사해서 브라우저에서 직접 import하고, 비교/파일명/다운로드 같은 팀 전용 기능은 `json-editor-core.js`와 `json-editor-tool.js`로 분리한다.

**Tech Stack:** Vanilla JavaScript modules, `vanilla-jsoneditor@3.12.0`, existing SPA router, Node test runner, Vercel static rewrites.

---

## 현재 코드 구조 기준

- `web/public/index.html`: 모든 도구 화면이 들어있는 단일 HTML.
- `web/public/routes.js`: `/formatter`, `/explorer`, `/mapping-table`, `/string-resource`, `/admin` 라우트 매핑.
- `web/public/app.js`: 허브 이동, 각 도구 초기화, 이벤트 바인딩.
- `web/public/styles.css`: 전체 도구 스타일.
- `web/vercel.json`: SPA 직접 접근을 위한 rewrite.
- `web/tests/routes.test.js`: 라우트 테스트.
- `web/tests/ui-structure.test.js`: HTML/CSS/앱 연결 구조 테스트.
- `web/scripts/copy-xlsx-vendor.js`: SheetJS vendor 파일 복사 패턴.

## 새로 만들 파일

- `web/public/json-editor-core.js`
  - JSON parse/format/compact/sort/normalize/diff/download filename 같은 순수 함수만 담당한다.
- `web/public/json-editor-tool.js`
  - DOM, `vanilla-jsoneditor`, 파일 업로드, 좌우 복사, swap, compare, download를 담당한다.
- `web/tests/json-editor-core.test.js`
  - 순수 함수 단위 테스트.
- `web/tests/json-editor-ui.test.js`
  - JSON Editor 화면 구조와 앱 연결 테스트.
- `web/scripts/copy-jsoneditor-vendor.js`
  - `node_modules/vanilla-jsoneditor/standalone.js`를 `web/public/vendor/vanilla-jsoneditor.js`로 복사한다.

## 수정할 파일

- `web/package.json`
- `web/package-lock.json`
- `web/public/index.html`
- `web/public/routes.js`
- `web/public/app.js`
- `web/public/styles.css`
- `web/vercel.json`
- `web/tests/routes.test.js`
- `web/tests/ui-structure.test.js`

---

### Task 1: JSON Editor vendor dependency 추가

**Files:**
- Modify: `web/package.json`
- Modify: `web/package-lock.json`
- Create: `web/scripts/copy-jsoneditor-vendor.js`
- Modify: `web/tests/ui-structure.test.js`

- [ ] **Step 1: 실패하는 구조 테스트 추가**

`web/tests/ui-structure.test.js`에 다음 테스트를 추가한다.

```js
it('declares local vanilla-jsoneditor vendor loading', async () => {
  const html = await readFile(new URL('../public/index.html', import.meta.url), 'utf8');
  const packageJson = await readFile(new URL('../package.json', import.meta.url), 'utf8');
  const pkg = JSON.parse(packageJson);

  assert.equal(pkg.dependencies['vanilla-jsoneditor'], '^3.12.0');
  assert.equal(
    pkg.scripts['prepare:vendor'],
    'node scripts/copy-xlsx-vendor.js && node scripts/copy-jsoneditor-vendor.js'
  );
  assert.match(html, /type="module" src="\.\/app\.js"/);
});
```

- [ ] **Step 2: 테스트 실패 확인**

Run:

```powershell
cd web
node --test tests/ui-structure.test.js
```

Expected: `pkg.dependencies['vanilla-jsoneditor']`가 없어서 FAIL.

- [ ] **Step 3: dependency와 vendor script 추가**

`web/package.json`의 `scripts`와 `dependencies`를 다음 형태로 맞춘다.

```json
{
  "scripts": {
    "deploy:vercel": "npx vercel --prod",
    "dev:vercel": "npx vercel dev",
    "start": "node server.js",
    "test": "node --test",
    "prepare:vendor": "node scripts/copy-xlsx-vendor.js && node scripts/copy-jsoneditor-vendor.js"
  },
  "dependencies": {
    "@neondatabase/serverless": "^1.1.0",
    "vanilla-jsoneditor": "^3.12.0",
    "xlsx": "0.18.5"
  }
}
```

`web/scripts/copy-jsoneditor-vendor.js`를 생성한다.

```js
import { mkdir, copyFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const __dirname = dirname(fileURLToPath(import.meta.url));
const vendorDir = join(__dirname, '..', 'public', 'vendor');

const source = require.resolve('vanilla-jsoneditor/standalone.js');
const destination = join(vendorDir, 'vanilla-jsoneditor.js');

await mkdir(vendorDir, { recursive: true });
await copyFile(source, destination);

console.log(`Copied ${source} to ${destination}`);
```

- [ ] **Step 4: npm install과 vendor 복사 실행**

Run:

```powershell
cd web
npm install
npm run prepare:vendor
```

Expected: `web/public/vendor/vanilla-jsoneditor.js`가 생성된다.

- [ ] **Step 5: 테스트 통과 확인**

Run:

```powershell
cd web
node --test tests/ui-structure.test.js
```

Expected: PASS.

---

### Task 2: JSON Editor core helper 작성

**Files:**
- Create: `web/public/json-editor-core.js`
- Create: `web/tests/json-editor-core.test.js`

- [ ] **Step 1: 실패하는 core 테스트 작성**

`web/tests/json-editor-core.test.js`를 생성한다.

```js
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  compactJsonText,
  diffJsonValues,
  formatJsonText,
  parseJsonText,
  resolveJsonEditorDownloadName,
  sortJsonValue
} from '../public/json-editor-core.js';

describe('json editor core helpers', () => {
  it('parses valid JSON and reports invalid JSON', () => {
    assert.deepEqual(parseJsonText('{"a":1}'), { ok: true, value: { a: 1 }, error: '' });

    const invalid = parseJsonText('{"a":');
    assert.equal(invalid.ok, false);
    assert.match(invalid.error, /Unexpected|position|JSON/);
  });

  it('formats and compacts JSON text', () => {
    assert.equal(formatJsonText('{"a":1,"b":[2]}'), '{\n  "a": 1,\n  "b": [\n    2\n  ]\n}');
    assert.equal(compactJsonText('{\n  "a": 1\n}'), '{"a":1}');
  });

  it('sorts object keys recursively without reordering arrays', () => {
    assert.deepEqual(sortJsonValue({ b: 1, a: { d: 4, c: 3 }, list: [{ z: 1, y: 2 }] }), {
      a: { c: 3, d: 4 },
      b: 1,
      list: [{ y: 2, z: 1 }]
    });
  });

  it('diffs added, removed, and changed JSON paths', () => {
    assert.deepEqual(diffJsonValues({ a: 1, b: 2, same: true }, { a: 9, c: 3, same: true }), [
      { path: '/a', type: 'changed', left: 1, right: 9 },
      { path: '/b', type: 'removed', left: 2, right: undefined },
      { path: '/c', type: 'added', left: undefined, right: 3 }
    ]);
  });

  it('resolves safe download filenames', () => {
    assert.equal(resolveJsonEditorDownloadName('sample.json'), 'sample.json');
    assert.equal(resolveJsonEditorDownloadName('sample'), 'sample.json');
    assert.equal(resolveJsonEditorDownloadName(''), 'json_editor_document.json');
  });
});
```

- [ ] **Step 2: 테스트 실패 확인**

Run:

```powershell
cd web
node --test tests/json-editor-core.test.js
```

Expected: `json-editor-core.js`가 없어서 FAIL.

- [ ] **Step 3: core helper 구현**

`web/public/json-editor-core.js`를 생성한다.

```js
export function parseJsonText(text) {
  try {
    return { ok: true, value: JSON.parse(String(text ?? '')), error: '' };
  } catch (error) {
    return {
      ok: false,
      value: undefined,
      error: error instanceof Error ? error.message : String(error)
    };
  }
}

export function formatJsonText(textOrValue) {
  const value = typeof textOrValue === 'string' ? JSON.parse(textOrValue) : textOrValue;
  return JSON.stringify(value, null, 2);
}

export function compactJsonText(textOrValue) {
  const value = typeof textOrValue === 'string' ? JSON.parse(textOrValue) : textOrValue;
  return JSON.stringify(value);
}

export function sortJsonValue(value) {
  if (Array.isArray(value)) {
    return value.map(sortJsonValue);
  }
  if (!value || typeof value !== 'object') {
    return value;
  }
  return Object.keys(value)
    .sort((left, right) => left.localeCompare(right))
    .reduce((sorted, key) => {
      sorted[key] = sortJsonValue(value[key]);
      return sorted;
    }, {});
}

export function diffJsonValues(left, right) {
  const changes = [];
  collectDiffs(left, right, [], changes);
  return changes;
}

export function resolveJsonEditorDownloadName(name) {
  const trimmed = String(name ?? '').trim();
  const safe = trimmed.replace(/[<>:"/\\|?*\u0000-\u001f]/g, '_');
  if (!safe) {
    return 'json_editor_document.json';
  }
  return safe.toLowerCase().endsWith('.json') ? safe : `${safe}.json`;
}

function collectDiffs(left, right, path, changes) {
  if (Object.is(left, right)) {
    return;
  }

  const leftObject = isContainer(left);
  const rightObject = isContainer(right);

  if (!leftObject || !rightObject || Array.isArray(left) !== Array.isArray(right)) {
    changes.push({ path: jsonPointer(path), type: 'changed', left, right });
    return;
  }

  const keys = Array.isArray(left) || Array.isArray(right)
    ? arrayIndexes(left, right)
    : objectKeys(left, right);

  for (const key of keys) {
    const hasLeft = Object.prototype.hasOwnProperty.call(left, key);
    const hasRight = Object.prototype.hasOwnProperty.call(right, key);
    if (!hasLeft) {
      changes.push({ path: jsonPointer([...path, key]), type: 'added', left: undefined, right: right[key] });
      continue;
    }
    if (!hasRight) {
      changes.push({ path: jsonPointer([...path, key]), type: 'removed', left: left[key], right: undefined });
      continue;
    }
    collectDiffs(left[key], right[key], [...path, key], changes);
  }
}

function isContainer(value) {
  return Boolean(value) && typeof value === 'object';
}

function objectKeys(left, right) {
  return [...new Set([...Object.keys(left), ...Object.keys(right)])]
    .sort((a, b) => a.localeCompare(b));
}

function arrayIndexes(left, right) {
  return Array.from({ length: Math.max(left.length, right.length) }, (_, index) => String(index));
}

function jsonPointer(path) {
  if (path.length === 0) {
    return '/';
  }
  return `/${path.map((part) => String(part).replace(/~/g, '~0').replace(/\//g, '~1')).join('/')}`;
}
```

- [ ] **Step 4: core 테스트 통과 확인**

Run:

```powershell
cd web
node --test tests/json-editor-core.test.js
```

Expected: PASS.

---

### Task 3: `/json-editor` 라우트와 허브 카드 추가

**Files:**
- Modify: `web/public/routes.js`
- Modify: `web/public/index.html`
- Modify: `web/public/app.js`
- Modify: `web/vercel.json`
- Modify: `web/tests/routes.test.js`
- Modify: `web/tests/ui-structure.test.js`

- [ ] **Step 1: 라우트 테스트 추가**

`web/tests/routes.test.js`에 `/json-editor` 검증을 추가한다.

```js
assert.equal(normalizeToolRoute('/json-editor').tool, 'jsonEditor');
assert.equal(pathForTool('jsonEditor'), '/json-editor');
```

- [ ] **Step 2: UI 구조 테스트 추가**

`web/tests/ui-structure.test.js`의 첫 번째 테스트에 다음 검증을 추가한다.

```js
const jsonEditorIndex = html.indexOf('id="jsonEditorApp"');
assert.notEqual(jsonEditorIndex, -1);
assert.ok(hubIndex < jsonEditorIndex);
assert.match(html, /id="openJsonEditorButton"/);
assert.match(html, /id="backToHubFromJsonEditorButton"/);
assert.match(html, /JSON Editor/);
assert.match(app, /showJsonEditorTool/);
assert.match(app, /navigateToTool\('jsonEditor'\)/);
assert.ok(rewriteSources.has('/json-editor'), 'Expected Vercel rewrite for /json-editor');
```

- [ ] **Step 3: 테스트 실패 확인**

Run:

```powershell
cd web
node --test tests/routes.test.js tests/ui-structure.test.js
```

Expected: `/json-editor` 라우트와 DOM이 없어서 FAIL.

- [ ] **Step 4: 라우트와 허브 카드 구현**

`web/public/routes.js`에 라우트를 추가한다.

```js
jsonEditor: Object.freeze({ path: '/json-editor', tool: 'jsonEditor' }),
```

`web/public/index.html`의 허브 카드 영역에 추가한다.

```html
<button class="tool-card" id="openJsonEditorButton" type="button">
  <span class="tool-card-kicker">Editor</span>
  <strong>JSON Editor</strong>
  <span>두 JSON 비교 / 구조 편집</span>
  <em>사용하기</em>
</button>
```

`web/vercel.json` rewrite에 추가한다.

```json
{ "source": "/json-editor", "destination": "/index.html" }
```

- [ ] **Step 5: app navigation 연결**

`web/public/app.js`의 `elements`에 추가한다.

```js
jsonEditorApp: document.querySelector('#jsonEditorApp'),
openJsonEditorButton: document.querySelector('#openJsonEditorButton'),
backToHubFromJsonEditorButton: document.querySelector('#backToHubFromJsonEditorButton'),
```

이벤트를 추가한다.

```js
elements.openJsonEditorButton.addEventListener('click', () => {
  navigateToTool('jsonEditor');
});

elements.backToHubFromJsonEditorButton.addEventListener('click', () => {
  navigateToTool('hub');
});
```

도구 표시 함수와 라우팅 분기에 추가한다.

```js
function showJsonEditorTool() {
  hideAllToolViews();
  document.body.classList.add('json-editor-active');
  elements.jsonEditorApp.hidden = false;
}
```

```js
case 'jsonEditor':
  showJsonEditorTool();
  break;
```

- [ ] **Step 6: 라우트/UI 테스트 통과 확인**

Run:

```powershell
cd web
node --test tests/routes.test.js tests/ui-structure.test.js
```

Expected: PASS.

---

### Task 4: JSON Editor 화면 shell 작성

**Files:**
- Modify: `web/public/index.html`
- Modify: `web/public/styles.css`
- Create: `web/tests/json-editor-ui.test.js`

- [ ] **Step 1: 실패하는 JSON Editor UI 테스트 작성**

`web/tests/json-editor-ui.test.js`를 생성한다.

```js
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

describe('JSON Editor UI structure', () => {
  it('provides a two-pane JSON editor workspace', async () => {
    const html = await readFile(new URL('../public/index.html', import.meta.url), 'utf8');
    const css = await readFile(new URL('../public/styles.css', import.meta.url), 'utf8');

    for (const id of [
      'jsonEditorApp',
      'jsonEditorSummary',
      'jsonEditorLeftMount',
      'jsonEditorRightMount',
      'jsonEditorLeftFileInput',
      'jsonEditorRightFileInput',
      'jsonEditorCopyLeftButton',
      'jsonEditorCopyRightButton',
      'jsonEditorSwapButton',
      'jsonEditorCompareButton',
      'jsonEditorDiffPanel',
      'jsonEditorDiffSummary',
      'jsonEditorDiffBody'
    ]) {
      assert.match(html, new RegExp(`id="${id}"`));
    }

    for (const selector of [
      '.json-editor-workspace',
      '.json-editor-pane-grid',
      '.json-editor-pane',
      '.json-editor-mount',
      '.json-editor-control-rail',
      '.json-editor-diff-panel',
      '.json-editor-diff-table'
    ]) {
      assert.match(css, new RegExp(`${selector.replace(/[.*+?^${}()|[\\]\\\\]/g, '\\\\$&')}\\\\s*{`));
    }
  });
});
```

- [ ] **Step 2: 테스트 실패 확인**

Run:

```powershell
cd web
node --test tests/json-editor-ui.test.js
```

Expected: `jsonEditorApp` shell이 없어서 FAIL.

- [ ] **Step 3: HTML shell 추가**

`web/public/index.html`에 추가한다.

```html
<main class="app-shell tool-view" id="jsonEditorApp" hidden>
  <header class="topbar">
    <div>
      <h1>JSON Editor</h1>
      <p class="summary" id="jsonEditorSummary">좌우 JSON을 열어 비교하세요.</p>
    </div>
    <div class="topbar-actions">
      <button class="ghost-button" id="backToHubFromJsonEditorButton" type="button">도구 목록</button>
    </div>
  </header>

  <section class="json-editor-workspace" aria-label="JSON Editor workspace">
    <section class="json-editor-pane-grid">
      <article class="json-editor-pane">
        <div class="panel-header">
          <div>
            <h2>Left JSON</h2>
            <p id="jsonEditorLeftStatus">파일을 열거나 JSON을 붙여넣으세요.</p>
          </div>
          <label class="file-picker" for="jsonEditorLeftFileInput">파일 선택</label>
          <input id="jsonEditorLeftFileInput" type="file" accept=".json,application/json">
        </div>
        <div class="json-editor-mount" id="jsonEditorLeftMount"></div>
      </article>

      <div class="json-editor-control-rail" aria-label="JSON Editor actions">
        <button class="ghost-button" id="jsonEditorCopyRightButton" type="button">→</button>
        <button class="ghost-button" id="jsonEditorCopyLeftButton" type="button">←</button>
        <button class="ghost-button" id="jsonEditorSwapButton" type="button">Swap</button>
        <button class="primary-action" id="jsonEditorCompareButton" type="button">Compare</button>
      </div>

      <article class="json-editor-pane">
        <div class="panel-header">
          <div>
            <h2>Right JSON</h2>
            <p id="jsonEditorRightStatus">파일을 열거나 JSON을 붙여넣으세요.</p>
          </div>
          <label class="file-picker" for="jsonEditorRightFileInput">파일 선택</label>
          <input id="jsonEditorRightFileInput" type="file" accept=".json,application/json">
        </div>
        <div class="json-editor-mount" id="jsonEditorRightMount"></div>
      </article>
    </section>

    <section class="json-editor-diff-panel" id="jsonEditorDiffPanel" aria-live="polite" hidden>
      <div class="panel-header">
        <div>
          <h2>Compare Result</h2>
          <p id="jsonEditorDiffSummary">비교 결과가 없습니다.</p>
        </div>
      </div>
      <div class="json-editor-diff-table" id="jsonEditorDiffBody"></div>
    </section>
  </section>
</main>
```

- [ ] **Step 4: 기본 CSS 추가**

`web/public/styles.css`에 추가한다.

```css
.json-editor-workspace {
  display: flex;
  flex-direction: column;
  gap: 14px;
  min-height: 0;
}

.json-editor-pane-grid {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto minmax(0, 1fr);
  gap: 12px;
  min-height: min(680px, calc(100vh - 210px));
}

.json-editor-pane,
.json-editor-diff-panel {
  background: #ffffff;
  border: 1px solid #d8e0eb;
  border-radius: 8px;
  box-shadow: 0 12px 28px rgba(15, 23, 42, 0.08);
  min-width: 0;
  overflow: hidden;
  padding: 14px;
}

.json-editor-pane {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.json-editor-mount {
  border: 1px solid #d8e0eb;
  border-radius: 6px;
  flex: 1;
  min-height: 420px;
  overflow: hidden;
}

.json-editor-control-rail {
  align-self: center;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.json-editor-diff-table {
  max-height: 280px;
  overflow: auto;
}

@media (max-width: 900px) {
  .json-editor-pane-grid {
    grid-template-columns: 1fr;
  }

  .json-editor-control-rail {
    align-self: stretch;
    flex-direction: row;
    justify-content: center;
  }
}
```

- [ ] **Step 5: UI 테스트 통과 확인**

Run:

```powershell
cd web
node --test tests/json-editor-ui.test.js
```

Expected: PASS.

---

### Task 5: editor controller 연결

**Files:**
- Create: `web/public/json-editor-tool.js`
- Modify: `web/public/app.js`
- Modify: `web/tests/json-editor-ui.test.js`

- [ ] **Step 1: controller 연결 테스트 추가**

`web/tests/json-editor-ui.test.js`에 추가한다.

```js
it('wires JSON Editor controller contracts', async () => {
  const app = await readFile(new URL('../public/app.js', import.meta.url), 'utf8');
  const controller = await readFile(new URL('../public/json-editor-tool.js', import.meta.url), 'utf8');

  assert.match(app, /initializeJsonEditorTool/);
  assert.match(app, /from '\.\/json-editor-tool\.js'/);
  assert.match(controller, /createJSONEditor/);
  assert.match(controller, /initializeJsonEditorTool/);
  assert.match(controller, /loadJsonEditorFile/);
  assert.match(controller, /copyJsonEditorPane/);
  assert.match(controller, /swapJsonEditorPanes/);
  assert.match(controller, /compareJsonEditorPanes/);
});
```

- [ ] **Step 2: 테스트 실패 확인**

Run:

```powershell
cd web
node --test tests/json-editor-ui.test.js
```

Expected: `json-editor-tool.js`가 없어서 FAIL.

- [ ] **Step 3: controller 파일 생성**

`web/public/json-editor-tool.js`를 생성한다.

```js
import { createJSONEditor } from './vendor/vanilla-jsoneditor.js';
import {
  diffJsonValues,
  formatJsonText,
  parseJsonText,
  resolveJsonEditorDownloadName
} from './json-editor-core.js';

const initialContent = { text: '{\n  \n}' };

export function initializeJsonEditorTool(elements) {
  const state = {
    initialized: true,
    left: createPaneState('left'),
    right: createPaneState('right')
  };

  state.left.editor = createJSONEditor({
    target: elements.jsonEditorLeftMount,
    props: {
      content: initialContent,
      mode: 'text',
      onChange: (content) => {
        state.left.content = content;
        renderJsonEditorPaneStatus(elements, state, 'left');
      }
    }
  });

  state.right.editor = createJSONEditor({
    target: elements.jsonEditorRightMount,
    props: {
      content: initialContent,
      mode: 'text',
      onChange: (content) => {
        state.right.content = content;
        renderJsonEditorPaneStatus(elements, state, 'right');
      }
    }
  });

  elements.jsonEditorLeftFileInput.addEventListener('change', () => {
    void loadJsonEditorFile(elements, state, 'left', elements.jsonEditorLeftFileInput.files?.[0]);
  });
  elements.jsonEditorRightFileInput.addEventListener('change', () => {
    void loadJsonEditorFile(elements, state, 'right', elements.jsonEditorRightFileInput.files?.[0]);
  });
  elements.jsonEditorCopyRightButton.addEventListener('click', () => copyJsonEditorPane(elements, state, 'left', 'right'));
  elements.jsonEditorCopyLeftButton.addEventListener('click', () => copyJsonEditorPane(elements, state, 'right', 'left'));
  elements.jsonEditorSwapButton.addEventListener('click', () => swapJsonEditorPanes(elements, state));
  elements.jsonEditorCompareButton.addEventListener('click', () => compareJsonEditorPanes(elements, state));

  renderJsonEditorPaneStatus(elements, state, 'left');
  renderJsonEditorPaneStatus(elements, state, 'right');
  return state;
}

export async function loadJsonEditorFile(elements, state, side, file) {
  if (!file) {
    return;
  }
  const text = await file.text();
  const pane = state[side];
  pane.name = file.name;
  pane.content = { text };
  pane.editor.set({ text });
  renderJsonEditorPaneStatus(elements, state, side);
}

export function copyJsonEditorPane(elements, state, from, to) {
  const content = state[from].editor.get();
  state[to].content = content;
  state[to].editor.set(content);
  renderJsonEditorPaneStatus(elements, state, to);
}

export function swapJsonEditorPanes(elements, state) {
  const leftContent = state.left.editor.get();
  const rightContent = state.right.editor.get();
  state.left.editor.set(rightContent);
  state.right.editor.set(leftContent);
  [state.left.name, state.right.name] = [state.right.name, state.left.name];
  renderJsonEditorPaneStatus(elements, state, 'left');
  renderJsonEditorPaneStatus(elements, state, 'right');
}

export function compareJsonEditorPanes(elements, state) {
  const left = parseEditorContent(state.left.editor.get());
  const right = parseEditorContent(state.right.editor.get());
  if (!left.ok || !right.ok) {
    elements.jsonEditorDiffPanel.hidden = false;
    elements.jsonEditorDiffSummary.textContent = '좌우 JSON 중 파싱할 수 없는 값이 있습니다.';
    elements.jsonEditorDiffBody.replaceChildren();
    return;
  }
  const changes = diffJsonValues(left.value, right.value);
  renderJsonEditorDiff(elements, changes);
}

function createPaneState(side) {
  return {
    side,
    name: `${side}.json`,
    content: initialContent,
    editor: null
  };
}

function parseEditorContent(content) {
  if (content?.json !== undefined) {
    return { ok: true, value: content.json, error: '' };
  }
  return parseJsonText(content?.text ?? '');
}

function renderJsonEditorPaneStatus(elements, state, side) {
  const parsed = parseEditorContent(state[side].editor?.get?.() ?? state[side].content);
  const target = side === 'left' ? elements.jsonEditorLeftStatus : elements.jsonEditorRightStatus;
  target.textContent = parsed.ok ? `${state[side].name} · JSON 정상` : `JSON 오류: ${parsed.error}`;
}

function renderJsonEditorDiff(elements, changes) {
  elements.jsonEditorDiffPanel.hidden = false;
  elements.jsonEditorDiffSummary.textContent = changes.length === 0
    ? '두 JSON이 같습니다.'
    : `다른 경로 ${changes.length.toLocaleString()}개`;
  elements.jsonEditorDiffBody.replaceChildren(...changes.slice(0, 500).map(renderJsonEditorDiffRow));
}

function renderJsonEditorDiffRow(change) {
  const row = document.createElement('div');
  row.className = 'json-editor-diff-row';
  row.textContent = `${change.type} ${change.path}`;
  return row;
}
```

- [ ] **Step 4: app.js에서 initialize 연결**

`web/public/app.js` 상단 import에 추가한다.

```js
import { initializeJsonEditorTool } from './json-editor-tool.js';
```

상태 변수 추가:

```js
let jsonEditorToolState = null;
```

`showJsonEditorTool()` 안에서 최초 1회 초기화한다.

```js
function showJsonEditorTool() {
  hideAllToolViews();
  document.body.classList.add('json-editor-active');
  elements.jsonEditorApp.hidden = false;

  if (!jsonEditorToolState) {
    jsonEditorToolState = initializeJsonEditorTool(elements);
  }
}
```

- [ ] **Step 5: controller 테스트 통과 확인**

Run:

```powershell
cd web
node --test tests/json-editor-ui.test.js
```

Expected: PASS.

---

### Task 6: 비교 결과 UI 개선

**Files:**
- Modify: `web/public/json-editor-tool.js`
- Modify: `web/public/styles.css`
- Modify: `web/tests/json-editor-ui.test.js`

- [ ] **Step 1: diff row 구조 테스트 추가**

`web/tests/json-editor-ui.test.js`에 다음 검증을 추가한다.

```js
it('renders JSON Editor diff rows with readable classes', async () => {
  const controller = await readFile(new URL('../public/json-editor-tool.js', import.meta.url), 'utf8');
  const css = await readFile(new URL('../public/styles.css', import.meta.url), 'utf8');

  assert.match(controller, /json-editor-diff-row/);
  assert.match(controller, /json-editor-diff-type/);
  assert.match(controller, /json-editor-diff-path/);
  assert.match(css, /\.json-editor-diff-row\s*{/);
  assert.match(css, /\.json-editor-diff-type\s*{/);
  assert.match(css, /\.json-editor-diff-path\s*{/);
});
```

- [ ] **Step 2: 테스트 실패 확인**

Run:

```powershell
cd web
node --test tests/json-editor-ui.test.js
```

Expected: diff class가 아직 부족해서 FAIL.

- [ ] **Step 3: diff row DOM 개선**

`renderJsonEditorDiffRow`를 교체한다.

```js
function renderJsonEditorDiffRow(change) {
  const row = document.createElement('article');
  row.className = `json-editor-diff-row is-${change.type}`;

  const type = document.createElement('span');
  type.className = 'json-editor-diff-type';
  type.textContent = change.type;

  const path = document.createElement('strong');
  path.className = 'json-editor-diff-path';
  path.textContent = change.path;

  const values = document.createElement('code');
  values.className = 'json-editor-diff-values';
  values.textContent = `${previewJsonValue(change.left)} → ${previewJsonValue(change.right)}`;

  row.append(type, path, values);
  return row;
}

function previewJsonValue(value) {
  if (value === undefined) {
    return 'undefined';
  }
  const text = JSON.stringify(value);
  return text.length > 140 ? `${text.slice(0, 137)}...` : text;
}
```

- [ ] **Step 4: diff CSS 추가**

`web/public/styles.css`에 추가한다.

```css
.json-editor-diff-row {
  align-items: center;
  border-bottom: 1px solid #e5ebf3;
  display: grid;
  gap: 10px;
  grid-template-columns: 88px minmax(220px, 1fr) minmax(240px, 1.2fr);
  padding: 10px 4px;
}

.json-editor-diff-type {
  border-radius: 999px;
  background: #edf4ff;
  color: #185da8;
  font-size: 12px;
  font-weight: 700;
  padding: 4px 8px;
  text-align: center;
}

.json-editor-diff-path {
  color: #172033;
  font-family: Consolas, 'Courier New', monospace;
  font-size: 13px;
  min-width: 0;
  overflow-wrap: anywhere;
}

.json-editor-diff-values {
  color: #3f4d63;
  font-size: 12px;
  overflow-wrap: anywhere;
  white-space: pre-wrap;
}
```

- [ ] **Step 5: diff UI 테스트 통과 확인**

Run:

```powershell
cd web
node --test tests/json-editor-ui.test.js
```

Expected: PASS.

---

### Task 7: 전체 검증

**Files:**
- Modify only if verification reveals a defect.

- [ ] **Step 1: syntax check**

Run:

```powershell
cd web
node --check public/app.js
node --check public/routes.js
node --check public/json-editor-core.js
node --check public/json-editor-tool.js
```

Expected: all commands exit with code 0.

- [ ] **Step 2: full test**

Run:

```powershell
cd web
node --test --test-isolation=none
```

Expected: all tests PASS.

- [ ] **Step 3: whitespace check**

Run:

```powershell
git diff --check
```

Expected: no output.

- [ ] **Step 4: local browser smoke test**

Run:

```powershell
cd web
npm start
```

브라우저에서 확인:

- `/json-editor` 직접 접근 시 화면이 열린다.
- 허브에서 `JSON Editor` 카드 클릭 시 `/json-editor`로 이동한다.
- 뒤로가기 버튼으로 허브에 돌아간다.
- 왼쪽과 오른쪽에 각각 JSON 파일을 열 수 있다.
- 편집기에서 text/tree/table 전환이 가능하다.
- `→`, `←`, `Swap`, `Compare`가 동작한다.
- JSON이 다르면 diff row가 표시된다.
- JSON이 같으면 "두 JSON이 같습니다."가 표시된다.

- [ ] **Step 5: commit**

Run:

```powershell
git add web/package.json web/package-lock.json web/scripts/copy-jsoneditor-vendor.js web/public/index.html web/public/routes.js web/public/app.js web/public/styles.css web/public/json-editor-core.js web/public/json-editor-tool.js web/tests/routes.test.js web/tests/ui-structure.test.js web/tests/json-editor-core.test.js web/tests/json-editor-ui.test.js docs/superpowers/plans/2026-06-24-json-editor-implementation.md
git commit -m "feat: add json editor implementation plan"
```

Expected: commit succeeds after implementation and verification.

## 구현 방식 선택

추천은 `Subagent-Driven` 방식이다. Task 1-3은 라우팅/셸, Task 4-6은 편집기/비교 기능으로 책임이 나뉘기 때문에 작업 단위를 분리하기 좋다. 각 task가 끝날 때마다 테스트를 돌리고, 브라우저 확인은 마지막에 한 번 묶어서 진행한다.
