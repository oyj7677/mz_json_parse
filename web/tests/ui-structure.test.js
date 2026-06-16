import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

describe('upload-first UI structure', () => {
  it('keeps paste registration hidden behind an explicit toggle', async () => {
    const html = await readFile(new URL('../public/index.html', import.meta.url), 'utf8');

    assert.match(html, /id="togglePasteButton"/);
    assert.match(html, /aria-expanded="false"/);
    assert.match(html, /id="pastePanel"[^>]*hidden/);
  });

  it('shows upload controls before the optional paste panel', async () => {
    const html = await readFile(new URL('../public/index.html', import.meta.url), 'utf8');
    const uploadIndex = html.indexOf('id="uploadPanel"');
    const pasteIndex = html.indexOf('id="pastePanel"');

    assert.notEqual(uploadIndex, -1);
    assert.notEqual(pasteIndex, -1);
    assert.ok(uploadIndex < pasteIndex);
  });

  it('keeps a quick title list in the upload panel and the detailed list in the side panel', async () => {
    const html = await readFile(new URL('../public/index.html', import.meta.url), 'utf8');
    const uploadPanel = html.slice(html.indexOf('id="uploadPanel"'), html.indexOf('</section>', html.indexOf('id="uploadPanel"')));
    const sidePanel = html.slice(html.indexOf('class="side-panel"'), html.indexOf('</aside>'));

    assert.match(uploadPanel, /id="quickTitleList"/);
    assert.match(sidePanel, /id="itemList"/);
    assert.doesNotMatch(sidePanel, /id="quickTitleList"/);
  });

  it('uses compact upload controls and makes quick selection scrollable', async () => {
    const html = await readFile(new URL('../public/index.html', import.meta.url), 'utf8');
    const css = await readFile(new URL('../public/styles.css', import.meta.url), 'utf8');
    const quickTitleRule = css.match(/\.quick-title-list\s*{[^}]+}/)?.[0] ?? '';

    assert.doesNotMatch(html, /upload-strip-large/);
    assert.doesNotMatch(html, /file-picker-large/);
    assert.match(quickTitleRule, /max-height:\s*\d+px/);
    assert.match(quickTitleRule, /overflow:\s*auto/);
  });

  it('stretches the quick selection area to the registration list bottom on desktop', async () => {
    const css = await readFile(new URL('../public/styles.css', import.meta.url), 'utf8');

    assert.match(css, /@media \(min-width: 901px\)/);
    assert.match(css, /@media \(min-width: 901px\)[\s\S]*body\s*{[\s\S]*overflow:\s*hidden/);
    assert.match(css, /@media \(min-width: 901px\)[\s\S]*\.app-shell\s*{[\s\S]*height:\s*100vh/);
    assert.match(css, /@media \(min-width: 901px\)[\s\S]*\.workspace\s*{[\s\S]*flex:\s*1/);
    assert.match(css, /@media \(min-width: 901px\)[\s\S]*\.input-panel\s*{[\s\S]*padding-bottom:\s*0/);
    assert.match(css, /@media \(min-width: 901px\)[\s\S]*\.upload-panel\s*{[\s\S]*align-self:\s*stretch/);
    assert.match(css, /@media \(min-width: 901px\)[\s\S]*\.quick-title-panel\s*{[\s\S]*flex:\s*1/);
    assert.match(css, /@media \(min-width: 901px\)[\s\S]*\.quick-title-list\s*{[\s\S]*overflow-y:\s*auto/);
    assert.match(css, /@media \(min-width: 901px\)[\s\S]*\.quick-title-list\s*{[\s\S]*scrollbar-gutter:\s*stable/);
    assert.match(css, /@media \(min-width: 901px\)[\s\S]*\.item-list\s*{[\s\S]*overflow-y:\s*auto/);
    assert.match(css, /@media \(min-width: 901px\)[\s\S]*\.item-list\s*{[\s\S]*scrollbar-gutter:\s*stable/);
  });

  it('provides a guided overlay anchored to screen locations', async () => {
    const html = await readFile(new URL('../public/index.html', import.meta.url), 'utf8');
    const css = await readFile(new URL('../public/styles.css', import.meta.url), 'utf8');
    const app = await readFile(new URL('../public/app.js', import.meta.url), 'utf8');

    assert.match(html, /id="openHelpButton"/);
    assert.match(html, /aria-controls="helpOverlay"/);
    assert.match(html, /id="helpOverlay"[^>]*hidden/);
    assert.doesNotMatch(html, /role="dialog"/);
    assert.match(html, /id="helpSpotlight"/);
    assert.match(html, /id="helpCallout"/);
    assert.match(html, /id="helpStepTitle"/);
    assert.match(html, /id="helpStepBody"/);
    assert.match(html, /id="helpStepCount"/);
    assert.match(html, /id="prevHelpButton"/);
    assert.match(html, /id="nextHelpButton"/);
    assert.match(html, /id="closeHelpButton"/);

    assert.match(css, /\.help-overlay\s*{/);
    assert.match(css, /\.help-spotlight\s*{/);
    assert.match(css, /\.help-callout\s*{/);
    assert.match(app, /openHelpButton/);
    assert.match(app, /closeHelpButton/);
    assert.match(app, /helpSteps/);
    assert.match(app, /positionHelpOverlay/);
    assert.match(app, /function openHelp/);
    assert.match(app, /function closeHelp/);
  });
});
