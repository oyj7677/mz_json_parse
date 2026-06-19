# String Resource Upload Progress Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add file-based progress feedback while String Resource Explorer uploads multiple Excel workbooks.

**Architecture:** Add a compact progress component to the existing String Resource toolbar. Keep parsing in the current sequential `registerStringResourceFiles` flow and update file-count progress before and after each file is processed.

**Tech Stack:** Browser JavaScript modules, HTML/CSS, Node built-in test runner.

---

### Task 1: UI Structure Test Contract

**Files:**
- Modify: `web/tests/ui-structure.test.js`

- [ ] **Step 1: Add expected progress DOM and app contracts**

Add assertions inside the existing `provides a String Resource Explorer upload and search workspace` test:

```js
for (const id of [
  'stringResourceUploadProgress',
  'stringResourceUploadProgressBar',
  'stringResourceUploadProgressFill',
  'stringResourceUploadProgressText'
]) {
  assert.match(html, new RegExp(`id="${id}"`));
}
assert.match(app, /isUploading:\s*false/);
assert.match(app, /setStringResourceUploadProgress/);
assert.match(app, /finishStringResourceUploadProgress/);
assert.match(app, /setStringResourceUploadControlsDisabled/);
assert.match(app, /await yieldToBrowser\(\)/);
assert.match(css, /\.string-resource-upload-progress\s*{/);
assert.match(css, /\.string-resource-progress-track\s*{/);
assert.match(css, /\.string-resource-progress-fill\s*{/);
```

- [ ] **Step 2: Run targeted test and confirm it fails before implementation**

Run: `node --test --test-isolation=none tests/ui-structure.test.js`

Expected: FAIL because progress IDs/functions/styles do not exist yet.

### Task 2: Add Progress Markup

**Files:**
- Modify: `web/public/index.html`

- [ ] **Step 1: Add progress markup under the upload status**

Inside the String Resource toolbar `.upload-strip`, immediately after `#stringResourceUploadStatus`, add:

```html
<div class="string-resource-upload-progress" id="stringResourceUploadProgress" role="status" aria-live="polite" hidden>
  <div
    class="string-resource-progress-track"
    id="stringResourceUploadProgressBar"
    role="progressbar"
    aria-valuemin="0"
    aria-valuemax="100"
    aria-valuenow="0"
  >
    <span class="string-resource-progress-fill" id="stringResourceUploadProgressFill"></span>
  </div>
  <span class="string-resource-progress-text" id="stringResourceUploadProgressText">0/0</span>
</div>
```

- [ ] **Step 2: Run targeted test**

Run: `node --test --test-isolation=none tests/ui-structure.test.js`

Expected: still FAIL until app functions and CSS are added.

### Task 3: Add Upload Progress State And Flow

**Files:**
- Modify: `web/public/app.js`

- [ ] **Step 1: Add upload state and element references**

Add to `state.stringResource`:

```js
isUploading: false,
```

Add to `elements`:

```js
stringResourceUploadProgress: document.querySelector('#stringResourceUploadProgress'),
stringResourceUploadProgressBar: document.querySelector('#stringResourceUploadProgressBar'),
stringResourceUploadProgressFill: document.querySelector('#stringResourceUploadProgressFill'),
stringResourceUploadProgressText: document.querySelector('#stringResourceUploadProgressText'),
```

- [ ] **Step 2: Disable upload controls during processing**

Add helper:

```js
function setStringResourceUploadControlsDisabled(isDisabled) {
  state.stringResource.isUploading = isDisabled;
  elements.stringResourceFileInput.disabled = isDisabled;
  elements.stringResourceLanguageButton.disabled = isDisabled;
  elements.clearStringResourceButton.disabled = isDisabled
    || (state.stringResource.files.length === 0 && state.stringResource.errors.length === 0);
}
```

Update `renderStringResource()` so clear button respects upload state:

```js
elements.clearStringResourceButton.disabled = state.stringResource.isUploading
  || (state.stringResource.files.length === 0 && state.stringResource.errors.length === 0);
```

- [ ] **Step 3: Add progress update helpers**

Add:

```js
function setStringResourceUploadProgress({ completed, total, fileName, phase }) {
  const safeTotal = Math.max(total, 1);
  const percent = Math.min(100, Math.max(0, Math.round((completed / safeTotal) * 100)));
  elements.stringResourceUploadProgress.hidden = false;
  elements.stringResourceUploadProgressFill.style.width = `${percent}%`;
  elements.stringResourceUploadProgressBar.setAttribute('aria-valuenow', String(percent));
  elements.stringResourceUploadProgressText.textContent = `${Math.min(completed, total).toLocaleString()}/${total.toLocaleString()} ${phase} - ${fileName}`;
}

function finishStringResourceUploadProgress() {
  elements.stringResourceUploadProgress.hidden = true;
  elements.stringResourceUploadProgressFill.style.width = '0%';
  elements.stringResourceUploadProgressBar.setAttribute('aria-valuenow', '0');
  elements.stringResourceUploadProgressText.textContent = '0/0';
}

function yieldToBrowser() {
  return new Promise((resolve) => setTimeout(resolve, 0));
}
```

- [ ] **Step 4: Wire helpers into `registerStringResourceFiles`**

At upload start, set controls disabled, show 0 percent, and yield once. Before each file parse, update progress to `processing`; after each file attempt, update progress to `done`. Wrap processing in `try/finally` so controls are re-enabled and progress hides at the end.

- [ ] **Step 5: Run targeted test**

Run: `node --test --test-isolation=none tests/ui-structure.test.js`

Expected: still FAIL until CSS exists, then PASS.

### Task 4: Add Progress Styling

**Files:**
- Modify: `web/public/styles.css`

- [ ] **Step 1: Add compact progress styles**

Add near String Resource toolbar styles:

```css
.string-resource-upload-progress {
  display: grid;
  min-width: min(280px, 100%);
  gap: 5px;
}

.string-resource-progress-track {
  height: 6px;
  overflow: hidden;
  border-radius: 999px;
  background: #d7dee8;
}

.string-resource-progress-fill {
  display: block;
  width: 0%;
  height: 100%;
  border-radius: inherit;
  background: #1268d6;
  transition: width 160ms ease;
}

.string-resource-progress-text {
  color: var(--muted);
  font-size: 12px;
  line-height: 1.3;
}
```

- [ ] **Step 2: Run targeted test**

Run: `node --test --test-isolation=none tests/ui-structure.test.js`

Expected: PASS.

### Task 5: Verification And Commit

**Files:**
- Modify: `web/public/index.html`
- Modify: `web/public/app.js`
- Modify: `web/public/styles.css`
- Modify: `web/tests/ui-structure.test.js`

- [ ] **Step 1: Run verification**

Run:

```bash
node --check public/app.js
node --test --test-isolation=none
git diff --check
```

Expected: all commands exit 0 and the full test suite reports 76 passing tests or more.

- [ ] **Step 2: Browser smoke test**

Reload `http://localhost:5174/` and verify:

- App title is still `MZ Tools`.
- String Resource progress DOM exists.
- The progress container is hidden at idle.

- [ ] **Step 3: Commit implementation**

```bash
git add -- web/public/index.html web/public/app.js web/public/styles.css web/tests/ui-structure.test.js
git commit -m "feat: add string resource upload progress"
```