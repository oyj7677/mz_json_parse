import {
  applyDedupedFilenames,
  buildZipBlob,
  createDownloadItem,
  defaultFilenameBase,
  ensureItemJsonFilename,
  formatDownloadContent,
  formatJson,
  needsEnglishTranslation,
  parseUploadedJsonContent,
  parseJsonCandidates,
  sanitizeFilenameBase
} from './core.js';

const state = {
  activeItemId: null,
  errors: [],
  items: [],
  nextId: 1,
  translateFilenames: true
};

const elements = {
  clearInputButton: document.querySelector('#clearInputButton'),
  clearItemsButton: document.querySelector('#clearItemsButton'),
  downloadAllButton: document.querySelector('#downloadAllButton'),
  extractButton: document.querySelector('#extractButton'),
  input: document.querySelector('#jsonInput'),
  inputStatus: document.querySelector('#inputStatus'),
  itemList: document.querySelector('#itemList'),
  jsonFileInput: document.querySelector('#jsonFileInput'),
  pastePanel: document.querySelector('#pastePanel'),
  quickTitleList: document.querySelector('#quickTitleList'),
  resultCount: document.querySelector('#resultCount'),
  summaryText: document.querySelector('#summaryText'),
  togglePasteButton: document.querySelector('#togglePasteButton'),
  translateToggle: document.querySelector('#translateToggle'),
  uploadStatus: document.querySelector('#uploadStatus')
};

elements.pastePanel.addEventListener('submit', async (event) => {
  event.preventDefault();
  await registerInput();
});

elements.clearInputButton.addEventListener('click', () => {
  elements.input.value = '';
  setInputStatus('');
});

elements.clearItemsButton.addEventListener('click', () => {
  state.items = [];
  state.errors = [];
  render();
});

elements.togglePasteButton.addEventListener('click', () => {
  const willShow = elements.pastePanel.hidden;
  elements.pastePanel.hidden = !willShow;
  elements.togglePasteButton.setAttribute('aria-expanded', String(willShow));
  elements.togglePasteButton.textContent = willShow ? '붙여넣기 닫기' : '붙여넣기로 등록';

  if (willShow) {
    elements.input.focus();
  }
});

elements.translateToggle.addEventListener('change', () => {
  state.translateFilenames = elements.translateToggle.checked;
});

elements.downloadAllButton.addEventListener('click', () => {
  downloadAll();
});

elements.jsonFileInput.addEventListener('change', async () => {
  await registerUploadedFiles(elements.jsonFileInput.files);
  elements.jsonFileInput.value = '';
});

render();

async function registerInput() {
  const input = elements.input.value;
  const result = parseJsonCandidates(input, { keepInvalidAsRaw: true });

  if (result.valid.length === 0 && result.errors.length === 0) {
    setInputStatus('JSON 후보가 없습니다.');
    return;
  }

  const addedItems = result.valid.map(({ value, valueKind, warning }) => createItem(value, {
    parseWarning: warning ?? '',
    valueKind: valueKind ?? 'json'
  }));
  state.items.push(...addedItems);
  state.errors.push(...result.errors.map(createErrorItem));
  applyFilenameDedupe();
  render();
  setInputStatus(`정상 ${result.valid.length}개, 오류 ${result.errors.length}개`);

  if (state.translateFilenames) {
    await translatePendingItems(addedItems);
  }
}

async function registerUploadedFiles(fileList) {
  const files = Array.from(fileList ?? []);
  if (files.length === 0) {
    setUploadStatus('선택된 파일이 없습니다.');
    return;
  }

  let addedCount = 0;
  let errorCount = 0;
  const addedItems = [];

  for (const file of files) {
    try {
      const text = await file.text();
      const result = parseUploadedJsonContent(file.name, text);
      if (!result.ok) {
        throw new Error(result.message);
      }
      const item = createItem(result.value, {
        parseWarning: result.warning ?? '',
        sourceFilename: file.name,
        sourceType: 'upload',
        valueKind: result.valueKind
      });
      state.items.push(item);
      addedItems.push(item);
      addedCount += 1;
    } catch (error) {
      state.errors.push({
        id: `upload-error-${Date.now()}-${errorCount}`,
        message: `${file.name}: ${error instanceof Error ? error.message : String(error)}`,
        source: ''
      });
      errorCount += 1;
    }
  }

  applyFilenameDedupe();
  render();
  setUploadStatus(`업로드 ${addedCount}개, 오류 ${errorCount}개`);

  if (state.translateFilenames) {
    await translatePendingItems(addedItems);
  }
}

function createItem(value, options = {}) {
  const id = state.nextId;
  state.nextId += 1;
  return createDownloadItem({ id, value, ...options });
}

function createErrorItem(error, index) {
  return {
    id: `error-${Date.now()}-${index}`,
    message: error.message,
    source: error.candidate?.text ?? ''
  };
}

async function translatePendingItems(items) {
  const targets = items.filter(
    (item) => item.recognitionText && needsEnglishTranslation(item.recognitionText)
  );

  for (const item of targets) {
    item.translationStatus = 'translating';
    item.warning = '';
    render();

    try {
      const response = await fetch('/api/translate-filename', {
        body: JSON.stringify({ text: item.recognitionText }),
        headers: { 'Content-Type': 'application/json' },
        method: 'POST'
      });
      const body = await response.json().catch(() => ({}));

      if (!response.ok) {
        item.translationStatus = 'warning';
        item.warning = body.error ?? '파일명 번역 실패';
        continue;
      }

      if (!item.manuallyEdited) {
        const translatedBase = sanitizeFilenameBase(body.translatedText, defaultFilenameBase(item.id));
        item.filename = translatedBase;
        item.filename = ensureItemJsonFilename(item);
      }
      item.translationStatus = 'translated';
    } catch (error) {
      item.translationStatus = 'warning';
      item.warning = error instanceof Error ? error.message : String(error);
    } finally {
      applyFilenameDedupe();
      render();
    }
  }
}

function applyFilenameDedupe() {
  applyDedupedFilenames(state.items);
}

function render() {
  const validCount = state.items.length;
  const errorCount = state.errors.length;
  ensureActiveItem();

  elements.summaryText.textContent = `등록된 JSON ${validCount}개`;
  elements.resultCount.textContent = `정상 ${validCount}개, 오류 ${errorCount}개`;
  elements.downloadAllButton.disabled = validCount === 0;
  elements.clearItemsButton.disabled = validCount === 0 && errorCount === 0;

  const quickTitleFragment = document.createDocumentFragment();
  const itemFragment = document.createDocumentFragment();

  if (validCount === 0) {
    const empty = document.createElement('div');
    empty.className = 'empty-state compact-empty';
    empty.textContent = 'JSON 파일을 업로드하면 파일명이 여기에 표시됩니다.';
    quickTitleFragment.append(empty);
  }

  if (validCount === 0 && errorCount === 0) {
    const empty = document.createElement('div');
    empty.className = 'empty-state';
    empty.textContent = 'JSON을 등록하면 상세 목록이 여기에 표시됩니다.';
    itemFragment.append(empty);
  }

  for (const item of state.items) {
    quickTitleFragment.append(renderQuickTitleRow(item));
    itemFragment.append(renderItem(item));
  }

  for (const error of state.errors) {
    itemFragment.append(renderError(error));
  }

  elements.quickTitleList.replaceChildren(quickTitleFragment);
  elements.itemList.replaceChildren(itemFragment);
}

function renderQuickTitleRow(item) {
  const wrapper = document.createElement('article');
  wrapper.className = `quick-title-row${item.id === state.activeItemId ? ' active' : ''}`;
  wrapper.dataset.quickTitleId = String(item.id);

  const selectButton = document.createElement('button');
  selectButton.className = 'quick-title-button';
  selectButton.type = 'button';
  selectButton.setAttribute('aria-current', item.id === state.activeItemId ? 'true' : 'false');
  selectButton.addEventListener('click', () => {
    selectItem(item.id);
  });

  const title = document.createElement('span');
  title.className = 'quick-title-text';
  title.textContent = item.filename;
  selectButton.append(title);

  const tools = document.createElement('div');
  tools.className = 'item-tools';

  const removeButton = document.createElement('button');
  removeButton.className = 'icon-button';
  removeButton.type = 'button';
  removeButton.title = '삭제';
  removeButton.textContent = 'X';
  removeButton.addEventListener('click', () => {
    removeItem(item.id);
  });

  tools.append(removeButton);
  wrapper.append(selectButton, tools);

  return wrapper;
}

function renderItem(item) {
  const wrapper = document.createElement('article');
  wrapper.className = `json-item${item.id === state.activeItemId ? ' active' : ''}`;
  wrapper.dataset.detailItemId = String(item.id);

  const topLine = document.createElement('div');
  topLine.className = 'item-topline';

  const title = document.createElement('div');
  title.className = 'item-title';
  title.textContent = item.filename;

  const tools = document.createElement('div');
  tools.className = 'item-tools';

  const removeButton = document.createElement('button');
  removeButton.className = 'icon-button';
  removeButton.type = 'button';
  removeButton.title = '삭제';
  removeButton.textContent = 'X';
  removeButton.addEventListener('click', () => {
    removeItem(item.id);
  });

  tools.append(removeButton);
  topLine.append(title, tools);

  const filenameInput = document.createElement('input');
  filenameInput.className = 'filename-input';
  filenameInput.value = item.filename;
  filenameInput.setAttribute('aria-label', '파일명');
  filenameInput.addEventListener('input', (event) => {
    item.filename = event.target.value;
    item.manuallyEdited = true;
    const fallbackName = `${defaultFilenameBase(item.id)}.json`;
    const displayName = event.target.value || fallbackName;
    title.textContent = displayName;
    const quickTitle = document.querySelector(`[data-quick-title-id="${item.id}"] .quick-title-text`);
    if (quickTitle) {
      quickTitle.textContent = displayName;
    }
  });
  filenameInput.addEventListener('blur', (event) => {
    item.filename = event.target.value;
    item.filename = ensureItemJsonFilename(item);
    applyFilenameDedupe();
    render();
  });

  const meta = document.createElement('div');
  meta.className = 'item-meta';
  const sourceLabel = item.sourceType === 'upload' && item.sourceFilename ? `업로드: ${item.sourceFilename} | ` : '';
  meta.textContent = item.recognitionText
    ? `${sourceLabel}recognitionText: ${item.recognitionText}`
    : `${sourceLabel}recognitionText 없음`;

  const status = document.createElement('span');
  status.className = `status-pill ${statusTone(item)}`;
  status.textContent = statusText(item);

  const preview = document.createElement('pre');
  preview.className = 'json-preview';
  preview.textContent = formatDownloadContent(item);

  wrapper.append(topLine, filenameInput, meta, status);
  if (item.warning) {
    const warning = document.createElement('div');
    warning.className = 'item-meta';
    warning.textContent = item.warning;
    wrapper.append(warning);
  }
  wrapper.append(preview);

  return wrapper;
}

function ensureActiveItem() {
  if (state.items.length === 0) {
    state.activeItemId = null;
    return;
  }

  const activeExists = state.items.some((item) => item.id === state.activeItemId);
  if (!activeExists) {
    state.activeItemId = state.items[0].id;
  }
}

function selectItem(id) {
  state.activeItemId = id;
  render();
  requestAnimationFrame(() => {
    const target = document.querySelector(`[data-detail-item-id="${id}"]`);
    target?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  });
}

function removeItem(id) {
  state.items = state.items.filter((candidate) => candidate.id !== id);
  if (state.activeItemId === id) {
    state.activeItemId = state.items[0]?.id ?? null;
  }
  applyFilenameDedupe();
  render();
}

function renderError(error) {
  const wrapper = document.createElement('article');
  wrapper.className = 'error-item';

  const title = document.createElement('div');
  title.className = 'item-title';
  title.textContent = 'JSON 파싱 실패';

  const message = document.createElement('span');
  message.className = 'status-pill error';
  message.textContent = error.message;

  const preview = document.createElement('pre');
  preview.className = 'json-preview';
  preview.textContent = error.source;

  wrapper.append(title, message, preview);
  return wrapper;
}

function statusTone(item) {
  if (item.translationStatus === 'warning' || item.translationStatus === 'missing') {
    return 'warning';
  }
  if (item.translationStatus === 'translated') {
    return 'ok';
  }
  return '';
}

function statusText(item) {
  if (item.valueKind === 'raw-string') {
    return '문자열 저장';
  }
  if (item.translationStatus === 'translating') {
    return '번역 중';
  }
  if (item.translationStatus === 'translated') {
    return '파일명 번역됨';
  }
  if (item.translationStatus === 'warning') {
    return '수동 수정 가능';
  }
  if (item.translationStatus === 'missing') {
    return '대체 파일명';
  }
  if (item.recognitionText && !needsEnglishTranslation(item.recognitionText)) {
    return '영어 파일명';
  }
  return '파일명 준비';
}

function downloadAll() {
  if (state.items.length === 0) {
    return;
  }

  applyFilenameDedupe();
  render();
  const files = state.items.map((item) => ({
    content: formatDownloadContent(item),
    name: item.filename
  }));
  const blob = buildZipBlob(files);
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');

  link.href = url;
  link.download = `formatted_json_${new Date().toISOString().slice(0, 10)}.zip`;
  document.body.append(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

function setInputStatus(message) {
  elements.inputStatus.textContent = message;
}

function setUploadStatus(message) {
  elements.uploadStatus.textContent = message;
}
