import { createJSONEditor } from './vendor/vanilla-jsoneditor.js';
import {
  diffJsonValues,
  formatJsonText,
  parseJsonText,
  resolveJsonEditorDownloadName,
  sortJsonValue
} from './json-editor-core.js';

const DIFF_RENDER_LIMIT = 500;
const LEFT_EDITOR_PROPS = Object.freeze({
  mode: 'text'
});
const RIGHT_EDITOR_PROPS = Object.freeze({
  mode: 'tree'
});

export function initializeJsonEditorTool(elements) {
  const state = {
    left: createPaneState('left'),
    right: createPaneState('right')
  };

  state.left.editor = createEditor(
    elements.jsonEditorLeftMount,
    state.left,
    elements,
    state,
    LEFT_EDITOR_PROPS
  );
  state.right.editor = createEditor(
    elements.jsonEditorRightMount,
    state.right,
    elements,
    state,
    RIGHT_EDITOR_PROPS
  );

  elements.jsonEditorLeftFileInput.addEventListener('change', () => {
    void loadJsonEditorFile(elements, state, 'left', elements.jsonEditorLeftFileInput.files?.[0]);
  });
  elements.jsonEditorRightFileInput.addEventListener('change', () => {
    void loadJsonEditorFile(elements, state, 'right', elements.jsonEditorRightFileInput.files?.[0]);
  });
  elements.jsonEditorCopyRightButton.addEventListener('click', () => {
    copyJsonEditorPane(elements, state, 'left', 'right');
  });
  elements.jsonEditorCopyLeftButton.addEventListener('click', () => {
    copyJsonEditorPane(elements, state, 'right', 'left');
  });
  elements.jsonEditorSwapButton.addEventListener('click', () => {
    swapJsonEditorPanes(elements, state);
  });
  elements.jsonEditorCompareButton.addEventListener('click', () => {
    compareJsonEditorPanes(elements, state);
  });
  elements.jsonEditorLeftCopyButton.addEventListener('click', () => {
    void copyPaneFormattedJson(state.left);
  });
  elements.jsonEditorRightCopyButton.addEventListener('click', () => {
    void copyPaneFormattedJson(state.right);
  });
  elements.jsonEditorLeftDownloadButton.addEventListener('click', () => {
    downloadJsonEditorPane(state.left);
  });
  elements.jsonEditorRightDownloadButton.addEventListener('click', () => {
    downloadJsonEditorPane(state.right);
  });

  renderJsonEditorPaneStatus(elements, state, 'left');
  renderJsonEditorPaneStatus(elements, state, 'right');
  renderJsonEditorSummary(elements, state);
  return state;
}

export async function loadJsonEditorFile(elements, state, side, file) {
  if (!file) {
    return;
  }
  const text = await file.text();
  const pane = state[side];
  pane.name = file.name;
  setPaneContent(pane, { text });
  renderJsonEditorPaneStatus(elements, state, side);
  renderJsonEditorSummary(elements, state);
  clearJsonEditorDiff(elements);
}

export function copyJsonEditorPane(elements, state, from, to) {
  const content = state[from].editor.get();
  state[to].name = state[from].name;
  setPaneContent(state[to], content);
  renderJsonEditorPaneStatus(elements, state, to);
  renderJsonEditorSummary(elements, state);
  clearJsonEditorDiff(elements);
}

export function swapJsonEditorPanes(elements, state) {
  const leftContent = state.left.editor.get();
  const rightContent = state.right.editor.get();
  [state.left.name, state.right.name] = [state.right.name, state.left.name];
  setPaneContent(state.left, rightContent);
  setPaneContent(state.right, leftContent);
  renderJsonEditorPaneStatus(elements, state, 'left');
  renderJsonEditorPaneStatus(elements, state, 'right');
  renderJsonEditorSummary(elements, state);
  clearJsonEditorDiff(elements);
}

export function compareJsonEditorPanes(elements, state) {
  const left = parseEditorContent(state.left.editor.get());
  const right = parseEditorContent(state.right.editor.get());
  elements.jsonEditorDiffPanel.hidden = false;
  elements.jsonEditorDiffBody.replaceChildren();

  if (!left.ok || !right.ok) {
    elements.jsonEditorDiffSummary.textContent = '좌우 JSON 중 파싱할 수 없는 값이 있습니다.';
    return;
  }

  const changes = diffJsonValues(sortJsonValue(left.value), sortJsonValue(right.value));
  elements.jsonEditorDiffSummary.textContent = changes.length === 0
    ? '두 JSON이 같습니다.'
    : `다른 경로 ${changes.length.toLocaleString()}개`;

  const rows = changes.slice(0, DIFF_RENDER_LIMIT).map(renderJsonEditorDiffRow);
  elements.jsonEditorDiffBody.replaceChildren(...rows);

  if (changes.length > DIFF_RENDER_LIMIT) {
    const notice = document.createElement('p');
    notice.className = 'inline-status';
    notice.textContent = `먼저 ${DIFF_RENDER_LIMIT.toLocaleString()}개만 표시했습니다.`;
    elements.jsonEditorDiffBody.append(notice);
  }
}

function createPaneState(side) {
  return {
    side,
    name: `${side}.json`,
    content: createInitialContent(),
    editor: null
  };
}

function createInitialContent() {
  return { json: {} };
}

function createEditor(target, pane, elements, state, editorProps) {
  return createJSONEditor({
    target,
    props: {
      ...editorProps,
      content: pane.content,
      onChange: (content) => {
        pane.content = content;
        renderJsonEditorPaneStatus(elements, state, pane.side);
        renderJsonEditorSummary(elements, state);
        clearJsonEditorDiff(elements);
      }
    }
  });
}

function setPaneContent(pane, content) {
  pane.content = content;
  pane.editor.set(content);
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

function renderJsonEditorSummary(elements, state) {
  elements.jsonEditorSummary.textContent = `${state.left.name} ↔ ${state.right.name}`;
}

function clearJsonEditorDiff(elements) {
  elements.jsonEditorDiffPanel.hidden = true;
  elements.jsonEditorDiffSummary.textContent = '비교 결과가 없습니다.';
  elements.jsonEditorDiffBody.replaceChildren();
}

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
  values.textContent = `${previewJsonValue(change.left)} -> ${previewJsonValue(change.right)}`;

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

async function copyPaneFormattedJson(pane) {
  const parsed = parseEditorContent(pane.editor.get());
  if (!parsed.ok) {
    return;
  }
  await navigator.clipboard.writeText(formatJsonText(parsed.value));
}

function downloadJsonEditorPane(pane) {
  const parsed = parseEditorContent(pane.editor.get());
  if (!parsed.ok) {
    return;
  }
  const blob = new Blob([formatJsonText(parsed.value)], { type: 'application/json;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = resolveJsonEditorDownloadName(pane.name);
  document.body.append(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}
