# String Resource Fullscreen Upload Overlay Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the String Resource Excel upload inline progress emphasis with a blocking fullscreen dim overlay that shows circular progress, percent, phase, and current file progress.

**Architecture:** Keep the existing upload loop and progress helpers as the single state path. Add overlay DOM to the String Resource app, wire it through the existing `elements` map, and update `setStringResourceUploadProgress()` / `finishStringResourceUploadProgress()` to drive both accessibility and visuals. Keep the old inline upload status as a compact summary after completion.

**Tech Stack:** Plain HTML, CSS, vanilla JavaScript, Node.js built-in test runner.

---

## File Structure

- Modify `web/tests/ui-structure.test.js`: add failing structure checks for fullscreen overlay IDs, CSS selectors, app contracts, and helper-driven overlay state fields.
- Modify `web/public/index.html`: add fullscreen upload overlay markup inside `#stringResourceApp` so it can cover the viewport while staying scoped to this tool.
- Modify `web/public/app.js`: add element references and update progress helpers to show/hide overlay, percent, phase, and detail text.
- Modify `web/public/styles.css`: add full viewport overlay styling, circular progress ring, hidden state, responsive card sizing, and retain existing inline upload strip behavior.

### Task 1: RED Test For Fullscreen Overlay Contract

**Files:**
- Modify: `web/tests/ui-structure.test.js`

- [ ] **Step 1: Add failing structure assertions**

Add these IDs to the String Resource ID list:

```js
'stringResourceUploadOverlay',
'stringResourceUploadOverlayProgress',
'stringResourceUploadOverlayPercent',
'stringResourceUploadOverlayTitle',
'stringResourceUploadOverlayDetail',
```

Add these CSS selectors to the String Resource selector list:

```js
'.string-resource-upload-overlay',
'.string-resource-upload-overlay-card',
'.string-resource-upload-ring',
'.string-resource-upload-ring-fill',
'.string-resource-upload-percent',
```

Add these app contracts to the upload helper contract list:

```js
'stringResourceUploadOverlay',
'stringResourceUploadOverlayProgress',
'stringResourceUploadOverlayPercent',
'stringResourceUploadOverlayTitle',
'stringResourceUploadOverlayDetail',
'--string-resource-upload-progress',
```

- [ ] **Step 2: Run test to verify RED**

Run:

```bash
node --test --test-isolation=none tests/ui-structure.test.js
```

Expected: fail in `provides a String Resource Explorer upload and search workspace` because the new overlay IDs/selectors/contracts do not exist yet.

### Task 2: Add Overlay DOM And JavaScript Wiring

**Files:**
- Modify: `web/public/index.html`
- Modify: `web/public/app.js`

- [ ] **Step 1: Add fullscreen overlay markup**

Insert this markup before the closing `</main>` of `#stringResourceApp`, after the existing detail modal:

```html
<div class="string-resource-upload-overlay" id="stringResourceUploadOverlay" role="status" aria-live="polite" hidden>
  <section class="string-resource-upload-overlay-card" aria-label="엑셀 업로드 진행 상태">
    <div
      class="string-resource-upload-ring"
      id="stringResourceUploadOverlayProgress"
      role="progressbar"
      aria-valuemin="0"
      aria-valuemax="100"
      aria-valuenow="0"
    >
      <span class="string-resource-upload-ring-fill"></span>
      <span class="string-resource-upload-percent" id="stringResourceUploadOverlayPercent">0%</span>
    </div>
    <strong id="stringResourceUploadOverlayTitle">엑셀 분석 중</strong>
    <span id="stringResourceUploadOverlayDetail">0/0</span>
  </section>
</div>
```

- [ ] **Step 2: Add `elements` references**

Add these entries near the existing `stringResourceUploadProgress` references:

```js
stringResourceUploadOverlay: document.querySelector('#stringResourceUploadOverlay'),
stringResourceUploadOverlayDetail: document.querySelector('#stringResourceUploadOverlayDetail'),
stringResourceUploadOverlayPercent: document.querySelector('#stringResourceUploadOverlayPercent'),
stringResourceUploadOverlayProgress: document.querySelector('#stringResourceUploadOverlayProgress'),
stringResourceUploadOverlayTitle: document.querySelector('#stringResourceUploadOverlayTitle'),
```

- [ ] **Step 3: Update progress helper behavior**

Change `setStringResourceUploadProgress({ completed, total, fileName, phase })` so it also:

```js
elements.stringResourceUploadOverlay.hidden = false;
elements.stringResourceUploadOverlayProgress.style.setProperty('--string-resource-upload-progress', `${percent}%`);
elements.stringResourceUploadOverlayProgress.setAttribute('aria-valuenow', String(percent));
elements.stringResourceUploadOverlayPercent.textContent = `${percent}%`;
elements.stringResourceUploadOverlayTitle.textContent = phase;
elements.stringResourceUploadOverlayDetail.textContent = `${Math.min(completed, total).toLocaleString()}/${total.toLocaleString()} ${phase} - ${fileName}`;
```

Change `finishStringResourceUploadProgress()` so it also:

```js
elements.stringResourceUploadOverlay.hidden = true;
elements.stringResourceUploadOverlayProgress.style.setProperty('--string-resource-upload-progress', '0%');
elements.stringResourceUploadOverlayProgress.setAttribute('aria-valuenow', '0');
elements.stringResourceUploadOverlayPercent.textContent = '0%';
elements.stringResourceUploadOverlayTitle.textContent = '엑셀 분석 중';
elements.stringResourceUploadOverlayDetail.textContent = '0/0';
```

Use Unicode escapes for new Korean strings inside JavaScript to avoid Windows shell encoding issues.

- [ ] **Step 4: Run test to verify partial GREEN is blocked only by CSS**

Run:

```bash
node --test --test-isolation=none tests/ui-structure.test.js
```

Expected: still fail only for missing CSS selectors if Task 3 has not been implemented yet.

### Task 3: Add Fullscreen Overlay Styles

**Files:**
- Modify: `web/public/styles.css`

- [ ] **Step 1: Add overlay CSS**

Add styles near the existing String Resource upload progress styles:

```css
.string-resource-upload-overlay {
  position: fixed;
  inset: 0;
  z-index: 80;
  display: grid;
  place-items: center;
  padding: 24px;
  background: rgba(231, 235, 241, 0.82);
  backdrop-filter: blur(1.5px);
}

.string-resource-upload-overlay[hidden] {
  display: none;
}

.string-resource-upload-overlay-card {
  display: grid;
  justify-items: center;
  width: min(320px, 100%);
  gap: 10px;
  border: 1px solid rgba(216, 224, 234, 0.95);
  border-radius: 8px;
  padding: 22px 20px;
  background: rgba(255, 255, 255, 0.96);
  box-shadow: 0 18px 42px rgba(16, 24, 40, 0.16);
  text-align: center;
}

.string-resource-upload-ring {
  --string-resource-upload-progress: 0%;
  position: relative;
  display: grid;
  place-items: center;
  width: 76px;
  height: 76px;
  border-radius: 50%;
  background: conic-gradient(var(--blue) 0 var(--string-resource-upload-progress), #d8e0ea var(--string-resource-upload-progress) 100%);
}

.string-resource-upload-ring::after {
  content: '';
  width: 54px;
  height: 54px;
  border-radius: 50%;
  background: white;
}

.string-resource-upload-ring-fill {
  display: none;
}

.string-resource-upload-percent {
  position: absolute;
  z-index: 1;
  color: var(--blue);
  font-size: 14px;
  font-weight: 850;
}

#stringResourceUploadOverlayTitle {
  font-size: 16px;
  font-weight: 850;
}

#stringResourceUploadOverlayDetail {
  max-width: 100%;
  overflow: hidden;
  color: var(--muted);
  font-size: 13px;
  line-height: 1.35;
  text-overflow: ellipsis;
  white-space: nowrap;
}
```

- [ ] **Step 2: Verify GREEN for structure tests**

Run:

```bash
node --test --test-isolation=none tests/ui-structure.test.js
```

Expected: pass.

### Task 4: Full Verification, Browser Smoke, And Commit

**Files:**
- Test: all modified files

- [ ] **Step 1: Run full verification**

Run:

```bash
node --check public/app.js
node --test --test-isolation=none
git diff --check
```

Expected: all commands exit 0; Node tests show all existing tests passing.

- [ ] **Step 2: Browser smoke test**

Open `http://localhost:5174/`, confirm:

```js
{
  overlayExists: true,
  overlayHiddenAtIdle: true,
  progressValueAtIdle: '0',
  percentAtIdle: '0%'
}
```

Then temporarily call the progress helper through the app page or inspect DOM state after setting the same attributes, and confirm the overlay becomes visible with `aria-valuenow` and percent text set.

- [ ] **Step 3: Commit implementation**

Run:

```bash
git add -- web/public/index.html web/public/app.js web/public/styles.css web/tests/ui-structure.test.js
git commit -m "feat: add fullscreen upload overlay"
```

Expected: one implementation commit containing only the overlay code and tests.
