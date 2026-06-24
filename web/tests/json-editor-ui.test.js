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
      assert.match(css, new RegExp(`${escapeRegExp(selector)}\\s*{`));
    }
  });

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

  it('starts the left JSON editor in text mode while keeping mode controls available', async () => {
    const controller = await readFile(new URL('../public/json-editor-tool.js', import.meta.url), 'utf8');

    assert.match(controller, /LEFT_EDITOR_PROPS/);
    assert.match(controller, /RIGHT_EDITOR_PROPS/);
    assert.match(controller, /LEFT_EDITOR_PROPS[\s\S]*mode:\s*'text'/);
    assert.match(controller, /RIGHT_EDITOR_PROPS[\s\S]*mode:\s*'tree'/);
    assert.match(controller, /jsonEditorLeftMount,[\s\S]*LEFT_EDITOR_PROPS/);
    assert.match(controller, /jsonEditorRightMount,[\s\S]*RIGHT_EDITOR_PROPS/);
    assert.doesNotMatch(controller, /mainMenuBar:\s*false/);
  });
});

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
