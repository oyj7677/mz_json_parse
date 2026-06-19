import {
  applyDedupedFilenames,
  buildExplorerSuggestions,
  buildZipBlob,
  createDownloadItem,
  createExplorerItem,
  defaultFilenameBase,
  ensureItemJsonFilename,
  filterExplorerItems,
  filterGroupIntentionRows,
  filterSlotReferenceRows,
  formatDownloadContent,
  formatJson,
  getGroupIntentionSlotCandidates,
  needsEnglishTranslation,
  normalizeMappingWorkbook,
  parseExplorerSearchTerms,
  parseUploadedJsonContent,
  parseJsonCandidates,
  resolveMappingGroupSelection,
  sanitizeFilenameBase
} from './core.js';

import {
  filterStringResourceRows,
  normalizeStringResourceWorkbook,
  resolveStringResourceQualifiers,
  STRING_RESOURCE_DEFAULT_QUALIFIERS
} from './string-resource-core.js';
import { parseStringResourceWorkbookFile } from './string-resource-xlsx.js';

const EXPLORER_COLUMN_STORAGE_KEY = 'mz-json-explorer-column-widths';
const EXPLORER_TABLE_COLUMNS = [
  { id: 'sourceFilename', defaultWidth: 180, minWidth: 120, maxWidth: 520 },
  { id: 'recognitionText', defaultWidth: 340, minWidth: 180, maxWidth: 760 },
  { id: 'language', defaultWidth: 100, minWidth: 88, maxWidth: 220 },
  { id: 'slot', defaultWidth: 220, minWidth: 110, maxWidth: 640 },
  { id: 'contentType', defaultWidth: 140, minWidth: 110, maxWidth: 360 },
  { id: 'tableVersion', defaultWidth: 130, minWidth: 110, maxWidth: 300 },
  { id: 'actions', defaultWidth: 100, minWidth: 86, maxWidth: 180 }
];

const state = {
  activeItemId: null,
  errors: [],
  explorer: {
    errors: [],
    isFileDrawerOpen: false,
    items: [],
    modalItemId: null,
    nextId: 1,
    query: ''
  },
  items: [],
  mapping: {
    error: '',
    isLoaded: false,
    isLoading: false,
    query: '',
    rows: [],
    selectedGroupId: '',
    selectedSlots: [],
    source: ''
  },
  stringResource: {
    errors: [],
    files: [],
    modalRowId: '',
    nextFileId: 1,
    query: '',
    rows: [],
    selectedSheetIds: new Set(),
    visibleQualifiers: [...STRING_RESOURCE_DEFAULT_QUALIFIERS]
  },
  nextId: 1,
  translateFilenames: true
};

const helpSteps = [
  {
    body: '여러 JSON 파일을 한 번에 선택하면 등록 목록에 추가됩니다.',
    selector: '.upload-strip',
    title: 'JSON 파일 업로드'
  },
  {
    body: '영어 변환은 다운로드 파일명에만 적용되고 JSON 내용은 바꾸지 않습니다.',
    selector: '.inline-option',
    title: '다운로드 옵션'
  },
  {
    body: '등록된 파일명을 누르면 오른쪽 상세 카드 위치로 바로 이동합니다.',
    selector: '.quick-title-panel',
    title: '빠른 선택'
  },
  {
    body: '파일명을 직접 수정하거나 필요 없는 항목을 삭제하고 JSON 내용을 미리 볼 수 있습니다.',
    selector: '.side-panel',
    title: '등록 목록'
  },
  {
    body: '등록된 항목을 포맷팅된 JSON 파일로 묶어 ZIP으로 다운로드합니다.',
    selector: '#downloadAllButton',
    title: '모두 다운로드'
  },
  {
    body: '로그 문자열에서 JSON을 직접 추출해야 할 때만 열어 사용합니다.',
    selector: '#togglePasteButton',
    title: '붙여넣기로 등록'
  }
];

const elements = {
  backToHubButton: document.querySelector('#backToHubButton'),
  backToHubFromExplorerButton: document.querySelector('#backToHubFromExplorerButton'),
  backToHubFromMappingButton: document.querySelector('#backToHubFromMappingButton'),
  backToHubFromStringResourceButton: document.querySelector('#backToHubFromStringResourceButton'),
  clearInputButton: document.querySelector('#clearInputButton'),
  clearExplorerButton: document.querySelector('#clearExplorerButton'),
  clearItemsButton: document.querySelector('#clearItemsButton'),
  clearStringResourceButton: document.querySelector('#clearStringResourceButton'),
  closeHelpButton: document.querySelector('#closeHelpButton'),
  closeExplorerFilesButton: document.querySelector('#closeExplorerFilesButton'),
  closeExplorerModalButton: document.querySelector('#closeExplorerModalButton'),
  closeStringResourceDetailButton: document.querySelector('#closeStringResourceDetailButton'),
  downloadAllButton: document.querySelector('#downloadAllButton'),
  explorerApp: document.querySelector('#explorerApp'),
  explorerCount: document.querySelector('#explorerCount'),
  explorerDrawerCount: document.querySelector('#explorerDrawerCount'),
  explorerEmptyState: document.querySelector('#explorerEmptyState'),
  explorerFileCount: document.querySelector('#explorerFileCount'),
  explorerFileDrawer: document.querySelector('#explorerFileDrawer'),
  explorerFileInput: document.querySelector('#explorerFileInput'),
  explorerFolderInput: document.querySelector('#explorerFolderInput'),
  explorerModal: document.querySelector('#explorerModal'),
  explorerModalBackdrop: document.querySelector('#explorerModalBackdrop'),
  explorerModalJson: document.querySelector('#explorerModalJson'),
  explorerModalMeta: document.querySelector('#explorerModalMeta'),
  explorerModalTitle: document.querySelector('#explorerModalTitle'),
  explorerRegisteredList: document.querySelector('#explorerRegisteredList'),
  explorerResultCount: document.querySelector('#explorerResultCount'),
  explorerSearchArea: document.querySelector('#explorerSearchArea'),
  explorerSearchInput: document.querySelector('#explorerSearchInput'),
  explorerSuggestions: document.querySelector('#explorerSuggestions'),
  explorerTable: document.querySelector('#explorerTable'),
  explorerTableBody: document.querySelector('#explorerTableBody'),
  explorerTableShell: document.querySelector('#explorerTableShell'),
  explorerUploadStatus: document.querySelector('#explorerUploadStatus'),
  extractButton: document.querySelector('#extractButton'),
  formatterApp: document.querySelector('#formatterApp'),
  helpCallout: document.querySelector('#helpCallout'),
  helpOverlay: document.querySelector('#helpOverlay'),
  helpSpotlight: document.querySelector('#helpSpotlight'),
  helpStepBody: document.querySelector('#helpStepBody'),
  helpStepCount: document.querySelector('#helpStepCount'),
  helpStepTitle: document.querySelector('#helpStepTitle'),
  input: document.querySelector('#jsonInput'),
  inputStatus: document.querySelector('#inputStatus'),
  itemList: document.querySelector('#itemList'),
  jsonFileInput: document.querySelector('#jsonFileInput'),
  mappingApp: document.querySelector('#mappingApp'),
  mappingCount: document.querySelector('#mappingCount'),
  mappingGroupEmptyState: document.querySelector('#mappingGroupEmptyState'),
  mappingGroupResultCount: document.querySelector('#mappingGroupResultCount'),
  mappingGroupSearchInput: document.querySelector('#mappingGroupSearchInput'),
  mappingGroupTableBody: document.querySelector('#mappingGroupTableBody'),
  mappingGroupTableShell: document.querySelector('#mappingGroupTableShell'),
  mappingSlotEmptyState: document.querySelector('#mappingSlotEmptyState'),
  mappingSlotResultCount: document.querySelector('#mappingSlotResultCount'),
  mappingSlotTableBody: document.querySelector('#mappingSlotTableBody'),
  mappingSlotTableShell: document.querySelector('#mappingSlotTableShell'),
  mappingStatus: document.querySelector('#mappingStatus'),
  stringResourceApp: document.querySelector('#stringResourceApp'),
  stringResourceCount: document.querySelector('#stringResourceCount'),
  stringResourceDetailBackdrop: document.querySelector('#stringResourceDetailBackdrop'),
  stringResourceDetailBody: document.querySelector('#stringResourceDetailBody'),
  stringResourceDetailMeta: document.querySelector('#stringResourceDetailMeta'),
  stringResourceDetailModal: document.querySelector('#stringResourceDetailModal'),
  stringResourceDetailTitle: document.querySelector('#stringResourceDetailTitle'),
  stringResourceEmptyState: document.querySelector('#stringResourceEmptyState'),
  stringResourceFileInput: document.querySelector('#stringResourceFileInput'),
  stringResourceLanguageButton: document.querySelector('#stringResourceLanguageButton'),
  stringResourceLanguageList: document.querySelector('#stringResourceLanguageList'),
  stringResourceLanguagePanel: document.querySelector('#stringResourceLanguagePanel'),
  stringResourceResultCount: document.querySelector('#stringResourceResultCount'),
  stringResourceSearchInput: document.querySelector('#stringResourceSearchInput'),
  stringResourceSheetList: document.querySelector('#stringResourceSheetList'),
  stringResourceTableBody: document.querySelector('#stringResourceTableBody'),
  stringResourceTableHead: document.querySelector('#stringResourceTableHead'),
  stringResourceTableShell: document.querySelector('#stringResourceTableShell'),
  stringResourceUploadStatus: document.querySelector('#stringResourceUploadStatus'),
  openExplorerButton: document.querySelector('#openExplorerButton'),
  openFormatterButton: document.querySelector('#openFormatterButton'),
  openHelpButton: document.querySelector('#openHelpButton'),
  openMappingButton: document.querySelector('#openMappingButton'),
  openStringResourceButton: document.querySelector('#openStringResourceButton'),
  pastePanel: document.querySelector('#pastePanel'),
  prevHelpButton: document.querySelector('#prevHelpButton'),
  quickTitleList: document.querySelector('#quickTitleList'),
  resultCount: document.querySelector('#resultCount'),
  summaryText: document.querySelector('#summaryText'),
  nextHelpButton: document.querySelector('#nextHelpButton'),
  toggleExplorerFilesButton: document.querySelector('#toggleExplorerFilesButton'),
  togglePasteButton: document.querySelector('#togglePasteButton'),
  toolHub: document.querySelector('#toolHub'),
  translateToggle: document.querySelector('#translateToggle'),
  uploadStatus: document.querySelector('#uploadStatus')
};

let activeHelpStep = 0;
let helpFocusReturnTarget = null;
let explorerModalFocusReturnTarget = null;
let explorerDrawerFocusReturnTarget = null;
let explorerColumnWidths = loadExplorerColumnWidths();

elements.openFormatterButton.addEventListener('click', () => {
  showFormatterTool();
});

elements.openExplorerButton.addEventListener('click', () => {
  showExplorerTool();
});

elements.openMappingButton.addEventListener('click', () => {
  showMappingTool();
});

elements.openStringResourceButton.addEventListener('click', showStringResourceTool);

elements.backToHubButton.addEventListener('click', () => {
  showToolHub();
});

elements.backToHubFromExplorerButton.addEventListener('click', () => {
  showToolHub();
});

elements.backToHubFromMappingButton.addEventListener('click', () => {
  showToolHub();
});

elements.backToHubFromStringResourceButton.addEventListener('click', showToolHub);


elements.stringResourceSearchInput.addEventListener('input', (event) => {
  state.stringResource.query = event.target.value;
  renderStringResource();
});

elements.stringResourceFileInput.addEventListener('change', async () => {
  await registerStringResourceFiles(elements.stringResourceFileInput.files);
  elements.stringResourceFileInput.value = '';
});

elements.clearStringResourceButton.addEventListener('click', () => {
  state.stringResource.errors = [];
  state.stringResource.files = [];
  state.stringResource.modalRowId = '';
  state.stringResource.nextFileId = 1;
  state.stringResource.query = '';
  state.stringResource.rows = [];
  state.stringResource.selectedSheetIds = new Set();
  state.stringResource.visibleQualifiers = [...STRING_RESOURCE_DEFAULT_QUALIFIERS];
  elements.stringResourceSearchInput.value = '';
  setStringResourceUploadStatus('다국어 문자열 리소스 엑셀을 선택하세요.');
  renderStringResource();
});

elements.stringResourceLanguageButton.addEventListener('click', () => {
  const nextHidden = !elements.stringResourceLanguagePanel.hidden;
  elements.stringResourceLanguagePanel.hidden = nextHidden;
  elements.stringResourceLanguageButton.setAttribute('aria-expanded', String(!nextHidden));
});

elements.closeStringResourceDetailButton.addEventListener('click', closeStringResourceDetail);

elements.stringResourceDetailBackdrop.addEventListener('click', closeStringResourceDetail);

elements.mappingGroupSearchInput.addEventListener('input', (event) => {
  state.mapping.query = event.target.value;
  state.mapping.selectedGroupId = '';
  state.mapping.selectedSlots = [];
  renderMappingWorkflow();
});

elements.explorerFileInput.addEventListener('change', async () => {
  await registerExplorerFiles(elements.explorerFileInput.files);
  elements.explorerFileInput.value = '';
});

elements.explorerFolderInput.addEventListener('change', async () => {
  await registerExplorerFiles(elements.explorerFolderInput.files);
  elements.explorerFolderInput.value = '';
});

elements.explorerSearchInput.addEventListener('input', (event) => {
  state.explorer.query = event.target.value;
  renderExplorer();
});

elements.explorerSearchInput.addEventListener('keydown', (event) => {
  if (event.key === 'Enter' && !event.isComposing) {
    event.preventDefault();
    hideExplorerSuggestions();
  }
});

elements.explorerSearchArea.addEventListener('focusout', () => {
  requestAnimationFrame(() => {
    if (!elements.explorerSearchArea.contains(document.activeElement)) {
      hideExplorerSuggestions();
    }
  });
});

elements.explorerTableShell.addEventListener('scroll', hideExplorerSuggestions);

elements.toggleExplorerFilesButton.addEventListener('click', () => {
  toggleExplorerFileDrawer();
});

elements.closeExplorerFilesButton.addEventListener('click', () => {
  toggleExplorerFileDrawer(false);
});

elements.closeExplorerModalButton.addEventListener('click', () => {
  closeExplorerModal();
});

elements.explorerModalBackdrop.addEventListener('click', () => {
  closeExplorerModal();
});

elements.clearExplorerButton.addEventListener('click', () => {
  state.explorer.errors = [];
  state.explorer.isFileDrawerOpen = false;
  state.explorer.items = [];
  state.explorer.modalItemId = null;
  state.explorer.query = '';
  elements.explorerFileInput.value = '';
  elements.explorerFolderInput.value = '';
  elements.explorerSearchInput.value = '';
  setExplorerUploadStatus('JSON 파일을 선택하거나 폴더를 선택하세요.');
  renderExplorer();
});

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

elements.openHelpButton.addEventListener('click', () => {
  openHelp();
});

elements.closeHelpButton.addEventListener('click', () => {
  closeHelp();
});

elements.prevHelpButton.addEventListener('click', () => {
  showHelpStep(activeHelpStep - 1);
});

elements.nextHelpButton.addEventListener('click', () => {
  if (activeHelpStep === helpSteps.length - 1) {
    closeHelp();
    return;
  }

  showHelpStep(activeHelpStep + 1);
});

elements.helpOverlay.addEventListener('click', (event) => {
  if (event.target instanceof HTMLElement && event.target.dataset.helpClose !== undefined) {
    closeHelp();
  }
});

document.addEventListener('keydown', (event) => {
  if (event.key === 'Tab' && !elements.explorerModal.hidden) {
    trapExplorerModalFocus(event);
    return;
  }

  if (event.key !== 'Escape') {
    return;
  }

  if (!elements.helpOverlay.hidden) {
    closeHelp();
    return;
  }

  if (!elements.explorerModal.hidden) {
    closeExplorerModal();
    return;
  }

  if (!elements.explorerSuggestions.hidden) {
    hideExplorerSuggestions();
    return;
  }

  if (state.explorer.isFileDrawerOpen) {
    toggleExplorerFileDrawer(false);
  }
});

document.addEventListener('pointerdown', handleExplorerOutsidePointerDown);

window.addEventListener('resize', () => {
  if (!elements.helpOverlay.hidden) {
    positionHelpOverlay();
  }
  applyExplorerColumnWidths();
});

window.addEventListener('scroll', () => {
  if (!elements.helpOverlay.hidden) {
    positionHelpOverlay();
  }
}, true);

initializeExplorerColumnResizing();
render();
renderExplorer();
renderMappingWorkflow();
renderStringResource();

function showToolHub() {
  if (!elements.helpOverlay.hidden) {
    closeHelp();
  }

  elements.toolHub.hidden = false;
  elements.formatterApp.hidden = true;
  elements.explorerApp.hidden = true;
  elements.mappingApp.hidden = true;
  elements.stringResourceApp.hidden = true;
  document.body.classList.remove('formatter-active', 'mapping-active');
  elements.openFormatterButton.focus();
}

function showFormatterTool() {
  elements.toolHub.hidden = true;
  elements.formatterApp.hidden = false;
  elements.explorerApp.hidden = true;
  elements.mappingApp.hidden = true;
  elements.stringResourceApp.hidden = true;
  document.body.classList.remove('mapping-active');
  document.body.classList.add('formatter-active');
  elements.backToHubButton.focus();
}

function showExplorerTool() {
  if (!elements.helpOverlay.hidden) {
    closeHelp();
  }

  elements.toolHub.hidden = true;
  elements.formatterApp.hidden = true;
  elements.explorerApp.hidden = false;
  elements.mappingApp.hidden = true;
  elements.stringResourceApp.hidden = true;
  document.body.classList.remove('formatter-active', 'mapping-active');
  elements.backToHubFromExplorerButton.focus();
}

function showMappingTool() {
  if (!elements.helpOverlay.hidden) {
    closeHelp();
  }

  elements.toolHub.hidden = true;
  elements.formatterApp.hidden = true;
  elements.explorerApp.hidden = true;
  elements.mappingApp.hidden = false;
  elements.stringResourceApp.hidden = true;
  document.body.classList.remove('formatter-active');
  document.body.classList.add('mapping-active');
  elements.mappingGroupSearchInput.focus();
  void loadMappingData();
}

function showStringResourceTool() {
  if (!elements.helpOverlay.hidden) {
    closeHelp();
  }

  elements.toolHub.hidden = true;
  elements.formatterApp.hidden = true;
  elements.explorerApp.hidden = true;
  elements.mappingApp.hidden = true;
  elements.stringResourceApp.hidden = false;
  document.body.classList.remove('formatter-active', 'mapping-active');
  elements.stringResourceSearchInput.focus();
  renderStringResource();
}

async function registerStringResourceFiles(fileList) {
  const files = Array.from(fileList ?? []);
  if (files.length === 0) {
    setStringResourceUploadStatus('선택된 엑셀 파일이 없습니다.');
    return;
  }

  let addedCount = 0;
  let errorCount = 0;

  for (const file of files) {
    try {
      const workbook = await parseStringResourceWorkbookFile(file);
      const normalized = normalizeStringResourceWorkbook(workbook, file.name);
      const fileId = nextStringResourceFileId();
      const rows = normalized.rows.map((row) => ({ ...row, fileId }));
      state.stringResource.files.push({
        fileId,
        fileName: file.name,
        rows,
        sheetSummaries: normalized.sheetSummaries
      });

      for (const summary of normalized.sheetSummaries) {
        if (summary.isCandidate) {
          state.stringResource.selectedSheetIds.add(stringResourceSheetId(fileId, summary.name));
        }
      }

      addedCount += 1;
    } catch (error) {
      errorCount += 1;
      state.stringResource.errors.push(`${file.name}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  state.stringResource.rows = state.stringResource.files.flatMap((file) => file.rows);
  setStringResourceUploadStatus(`${addedCount}개 파일 등록, 오류 ${errorCount}개`);
  renderStringResource();
}
function renderStringResource() {
  elements.stringResourceCount.textContent = `업로드된 엑셀 ${state.stringResource.files.length.toLocaleString()}개`;
  elements.clearStringResourceButton.disabled = state.stringResource.files.length === 0 && state.stringResource.errors.length === 0;
  renderStringResourceSheets();
  renderStringResourceResults();
}

function renderStringResourceSheets() {
  elements.stringResourceSheetList.replaceChildren();

  if (state.stringResource.files.length === 0) {
    elements.stringResourceSheetList.innerHTML = '<div class="empty-state compact-empty">엑셀을 업로드하면 시트 목록이 표시됩니다.</div>';
    return;
  }

  const fragment = document.createDocumentFragment();
  for (const file of state.stringResource.files) {
    const group = document.createElement('section');
    group.className = 'string-resource-sheet-group';

    const title = document.createElement('h3');
    title.textContent = file.fileName;
    group.append(title);

    for (const summary of file.sheetSummaries) {
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
      group.append(label);
    }

    fragment.append(group);
  }

  elements.stringResourceSheetList.append(fragment);
}

function toggleStringResourceSheet(sheetId) {
  if (state.stringResource.selectedSheetIds.has(sheetId)) {
    state.stringResource.selectedSheetIds.delete(sheetId);
  } else {
    state.stringResource.selectedSheetIds.add(sheetId);
  }
  renderStringResource();
}

function selectedStringResourceRows() {
  return state.stringResource.rows.filter((row) =>
    state.stringResource.selectedSheetIds.has(stringResourceSheetId(row.fileId, row.sheetName))
  );
}

function renderStringResourceResults() {
  const rows = selectedStringResourceRows();
  const query = state.stringResource.query.trim();
  const filteredRows = query ? filterStringResourceRows(rows, query) : [];
  const availableQualifiers = resolveStringResourceQualifiers(rows);
  const visibleQualifiers = state.stringResource.visibleQualifiers.filter((qualifier) => availableQualifiers.includes(qualifier));

  renderStringResourceLanguageControls(availableQualifiers);
  renderStringResourceTableHeader(visibleQualifiers);
  elements.stringResourceTableBody.replaceChildren();
  elements.stringResourceTableShell.hidden = true;
  elements.stringResourceEmptyState.hidden = false;
  elements.stringResourceResultCount.textContent = `검색 결과 ${filteredRows.length.toLocaleString()}개`;

  if (state.stringResource.files.length === 0) {
    elements.stringResourceEmptyState.textContent = '엑셀 파일을 업로드하세요.';
    return;
  }

  if (!query) {
    elements.stringResourceEmptyState.textContent = '문자열 내용을 검색하세요.';
    return;
  }

  if (filteredRows.length === 0) {
    elements.stringResourceEmptyState.textContent = `검색 결과가 없습니다: ${query}`;
    return;
  }

  const fragment = document.createDocumentFragment();
  for (const row of filteredRows) {
    fragment.append(renderStringResourceTableRow(row, visibleQualifiers));
  }

  elements.stringResourceEmptyState.hidden = true;
  elements.stringResourceTableShell.hidden = false;
  elements.stringResourceTableBody.append(fragment);
}

function renderStringResourceTableHeader(qualifiers) {
  const headerRow = document.createElement('tr');
  for (const label of ['Resource ID', 'File', 'Sheet', ...qualifiers, '보기']) {
    const th = document.createElement('th');
    th.scope = 'col';
    th.textContent = label;
    headerRow.append(th);
  }
  elements.stringResourceTableHead.replaceChildren(headerRow);
}

function renderStringResourceTableRow(row, qualifiers) {
  const tr = document.createElement('tr');
  appendStringResourceCell(tr, row.resourceId, 'string-resource-id-cell');
  appendStringResourceCell(tr, row.fileName);
  appendStringResourceCell(tr, `${row.sheetName} · row ${row.rowNumber}`);

  for (const qualifier of qualifiers) {
    appendStringResourceCell(tr, row.languages[qualifier] ?? '', 'string-resource-language-cell');
  }

  const actionCell = document.createElement('td');
  const button = document.createElement('button');
  button.className = 'ghost-button';
  button.type = 'button';
  button.textContent = '보기';
  button.addEventListener('click', () => openStringResourceDetail(row.id));
  actionCell.append(button);
  tr.append(actionCell);
  return tr;
}

function appendStringResourceCell(row, value, className = '') {
  const cell = document.createElement('td');
  cell.textContent = String(value ?? '');
  cell.title = cell.textContent;
  if (className) {
    cell.className = className;
  }
  row.append(cell);
}

function renderStringResourceLanguageControls(availableQualifiers) {
  elements.stringResourceLanguageList.replaceChildren();

  if (availableQualifiers.length === 0) {
    elements.stringResourceLanguageList.innerHTML = '<div class="empty-state compact-empty">표시할 언어 컬럼이 없습니다.</div>';
    return;
  }

  const fragment = document.createDocumentFragment();
  for (const qualifier of availableQualifiers) {
    const label = document.createElement('label');
    label.className = 'string-resource-language-option';

    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.checked = state.stringResource.visibleQualifiers.includes(qualifier);
    checkbox.addEventListener('change', () => toggleStringResourceQualifier(qualifier));

    const text = document.createElement('span');
    text.textContent = qualifier;
    label.append(checkbox, text);
    fragment.append(label);
  }

  elements.stringResourceLanguageList.append(fragment);
}

function toggleStringResourceQualifier(qualifier) {
  const set = new Set(state.stringResource.visibleQualifiers);
  if (set.has(qualifier)) {
    set.delete(qualifier);
  } else {
    set.add(qualifier);
  }
  state.stringResource.visibleQualifiers = [...STRING_RESOURCE_DEFAULT_QUALIFIERS, ...[...set].sort()]
    .filter((item, index, array) => array.indexOf(item) === index && set.has(item));
  renderStringResource();
}

function openStringResourceDetail() {}

function closeStringResourceDetail() {
  state.stringResource.modalRowId = '';
  elements.stringResourceDetailModal.hidden = true;
}

function setStringResourceUploadStatus(message) {
  elements.stringResourceUploadStatus.textContent = message;
}

function nextStringResourceFileId() {
  const fileId = `string-resource-file-${state.stringResource.nextFileId}`;
  state.stringResource.nextFileId += 1;
  return fileId;
}

function stringResourceSheetId(fileId, sheetName) {
  return `${fileId}::${sheetName}`;
}

async function loadMappingData() {
  if (state.mapping.isLoaded || state.mapping.isLoading) {
    renderMappingWorkflow();
    return;
  }

  state.mapping.isLoading = true;
  state.mapping.error = '';
  renderMappingWorkflow();

  try {
    const response = await fetch('./mapping-table-v3.3.19.json');
    if (!response.ok) {
      throw new Error(`Mapping data request failed: ${response.status}`);
    }
    const workbook = await response.json();
    state.mapping.rows = normalizeMappingWorkbook(workbook);
    state.mapping.source = workbook.source ?? 'Mapping table_v3.3.19.xlsx';
    state.mapping.isLoaded = true;
  } catch (error) {
    state.mapping.error = error instanceof Error ? error.message : String(error);
  } finally {
    state.mapping.isLoading = false;
    renderMappingWorkflow();
  }
}

function renderMappingWorkflow() {
  const query = state.mapping.query.trim();
  const groupRows = state.mapping.isLoaded
    ? filterGroupIntentionRows(state.mapping.rows, query)
    : [];

  const selection = resolveMappingGroupSelection(
    groupRows,
    state.mapping.selectedGroupId,
    state.mapping.selectedSlots
  );
  state.mapping.selectedGroupId = selection.selectedGroupId;
  state.mapping.selectedSlots = selection.selectedSlots;

  const selectedGroup = selection.selectedGroup;
  const selectedSlotRows = selectedGroup
    ? filterSlotReferenceRows(state.mapping.rows, state.mapping.selectedSlots)
    : [];

  elements.mappingCount.textContent = state.mapping.isLoaded
    ? `${state.mapping.source} · ${state.mapping.rows.length.toLocaleString()} rows`
    : 'Mapping table loading';
  elements.mappingGroupResultCount.textContent = `GROUP INTENTIONS ${query ? groupRows.length.toLocaleString() : 0}개`;
  elements.mappingSlotResultCount.textContent = `SLOT REFERENCE ${selectedSlotRows.length.toLocaleString()}개`;

  if (state.mapping.error) {
    elements.mappingStatus.textContent = `Mapping table data 로드 실패: ${state.mapping.error}`;
  } else if (state.mapping.isLoading) {
    elements.mappingStatus.textContent = 'Mapping table data를 불러오는 중입니다.';
  } else if (state.mapping.isLoaded) {
    elements.mappingStatus.textContent = 'GROUP INTENTIONS에서 발화 또는 대표 명령어를 검색한 뒤 행을 선택하세요.';
  } else {
    elements.mappingStatus.textContent = 'Mapping table data를 불러오기 전입니다.';
  }

  renderGroupIntentionTable(groupRows, query);
  renderSlotReferenceTable(selectedGroup, selectedSlotRows);
}

function renderGroupIntentionTable(rows, query) {
  elements.mappingGroupTableBody.replaceChildren();
  elements.mappingGroupTableShell.hidden = true;
  elements.mappingGroupEmptyState.hidden = false;

  if (state.mapping.error) {
    elements.mappingGroupEmptyState.textContent = 'Mapping table data를 불러오지 못했습니다.';
    return;
  }

  if (!state.mapping.isLoaded) {
    elements.mappingGroupEmptyState.textContent = 'Mapping table data를 불러오는 중입니다.';
    return;
  }

  if (!query) {
    elements.mappingGroupEmptyState.textContent = '대표 명령어 또는 발화 패턴을 검색하세요.';
    return;
  }

  if (rows.length === 0) {
    elements.mappingGroupEmptyState.textContent = `GROUP INTENTIONS 검색 결과가 없습니다: ${query}`;
    return;
  }

  const fragment = document.createDocumentFragment();
  for (const row of rows) {
    fragment.append(renderGroupIntentionTableRow(row));
  }

  elements.mappingGroupEmptyState.hidden = true;
  elements.mappingGroupTableShell.hidden = false;
  elements.mappingGroupTableBody.replaceChildren(fragment);
}

function renderGroupIntentionTableRow(item) {
  const row = document.createElement('tr');
  row.tabIndex = 0;
  row.className = item.id === state.mapping.selectedGroupId ? 'is-selected' : '';
  row.addEventListener('click', () => selectMappingGroupRow(item.id));
  row.addEventListener('keydown', (event) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      selectMappingGroupRow(item.id);
    }
  });

  appendMappingCell(row, item.rowNumber);
  appendMappingCell(row, item.domainText);
  appendMappingCell(row, item.primaryText);
  appendMappingCell(row, item.values['발화 패턴']);
  appendMappingCell(row, item.intentionText);
  appendMappingCell(row, item.mappingIntent);
  appendMappingCell(row, item.slotText);

  return row;
}

function selectMappingGroupRow(id) {
  const query = state.mapping.query.trim();
  const groupRows = filterGroupIntentionRows(state.mapping.rows, query);
  const selectedGroup = groupRows.find((row) => row.id === id);
  if (!selectedGroup) {
    return;
  }

  state.mapping.selectedGroupId = id;
  state.mapping.selectedSlots = getGroupIntentionSlotCandidates(selectedGroup);
  renderMappingWorkflow();
}

function renderSlotReferenceTable(selectedGroup, rows) {
  elements.mappingSlotTableBody.replaceChildren();
  elements.mappingSlotTableShell.hidden = true;
  elements.mappingSlotEmptyState.hidden = false;

  if (state.mapping.error) {
    elements.mappingSlotEmptyState.textContent = 'Mapping table data를 불러오지 못했습니다.';
    return;
  }

  if (!state.mapping.isLoaded) {
    elements.mappingSlotEmptyState.textContent = 'Mapping table data를 불러오는 중입니다.';
    return;
  }

  if (!selectedGroup) {
    elements.mappingSlotEmptyState.textContent = 'GROUP INTENTIONS 결과 행을 선택하면 Slot Reference가 표시됩니다.';
    return;
  }

  const slotCandidates = getGroupIntentionSlotCandidates(selectedGroup);
  if (slotCandidates.length === 0) {
    elements.mappingSlotEmptyState.textContent = '선택한 행에 연결할 Slot 후보가 없습니다.';
    return;
  }

  if (state.mapping.selectedSlots.length === 0) {
    elements.mappingSlotEmptyState.textContent = '확인할 Slot 칩을 하나 이상 선택하세요.';
    return;
  }

  if (rows.length === 0) {
    elements.mappingSlotEmptyState.textContent = '선택한 Slot과 일치하는 SLOT REFERENCE 결과가 없습니다.';
    return;
  }

  const fragment = document.createDocumentFragment();
  for (const row of rows) {
    fragment.append(renderSlotReferenceTableRow(row));
  }

  elements.mappingSlotEmptyState.hidden = true;
  elements.mappingSlotTableShell.hidden = false;
  elements.mappingSlotTableBody.replaceChildren(fragment);
}

function renderSlotReferenceTableRow(item) {
  const row = document.createElement('tr');
  appendMappingCell(row, item.values['Slot Reference']);
  appendMappingCell(row, item.values['Slot name']);
  appendMappingCell(row, item.values['Slot Value']);
  appendMappingCell(row, item.values['Slot Canonical']);
  appendMappingCell(row, item.values['발화 패턴']);
  appendMappingCell(row, item.noteText);
  return row;
}

function appendMappingCell(row, value) {
  const cell = document.createElement('td');
  cell.textContent = explorerDisplayValue(value);
  cell.title = cell.textContent;
  row.append(cell);
}

async function registerExplorerFiles(fileList) {
  const files = Array.from(fileList ?? []);
  if (files.length === 0) {
    setExplorerUploadStatus('선택된 파일이 없습니다.');
    return;
  }

  let addedCount = 0;
  let errorCount = 0;

  for (const file of files) {
    try {
      const text = await file.text();
      const result = parseUploadedJsonContent(file.name, text);
      if (!result.ok) {
        throw new Error(result.message);
      }

      const item = createExplorerItem({
        id: state.explorer.nextId,
        sourceFilename: file.name,
        value: result.value,
        valueKind: result.valueKind,
        warning: result.warning ?? ''
      });
      state.explorer.nextId += 1;
      state.explorer.items.push(item);
      addedCount += 1;
    } catch (error) {
      state.explorer.errors.push({
        id: `explorer-error-${Date.now()}-${errorCount}`,
        message: `${file.name}: ${error instanceof Error ? error.message : String(error)}`
      });
      errorCount += 1;
    }
  }

  setExplorerUploadStatus(`업로드 ${addedCount}개, 오류 ${errorCount}개`);
  renderExplorer();
}

function initializeExplorerColumnResizing() {
  applyExplorerColumnWidths();

  const resizers = elements.explorerTable.querySelectorAll('.explorer-table-resizer');
  for (const resizer of resizers) {
    const columnId = resizer.dataset.explorerColumn;
    if (!columnId) {
      continue;
    }

    resizer.addEventListener('pointerdown', (event) => {
      if (event.detail > 1) {
        return;
      }
      beginExplorerColumnResize(event, columnId);
    });
    resizer.addEventListener('dblclick', (event) => {
      event.preventDefault();
      autofitExplorerColumn(columnId);
    });
    resizer.addEventListener('keydown', (event) => {
      if (event.key !== 'Enter' && event.key !== ' ') {
        return;
      }
      event.preventDefault();
      autofitExplorerColumn(columnId);
    });
  }
}

function applyExplorerColumnWidths() {
  const tableColumns = elements.explorerTable.querySelectorAll('[data-explorer-column]');
  for (const columnElement of tableColumns) {
    if (columnElement.tagName !== 'COL' && columnElement.tagName !== 'TH') {
      continue;
    }

    const columnId = columnElement.dataset.explorerColumn;
    if (!columnId) {
      continue;
    }

    const width = getExplorerColumnWidth(columnId);
    columnElement.style.width = `${width}px`;
  }

  const tableWidth = EXPLORER_TABLE_COLUMNS
    .reduce((total, column) => total + getExplorerColumnWidth(column.id), 0);
  elements.explorerTable.style.width = `${tableWidth}px`;
  elements.explorerTable.style.minWidth = `${tableWidth}px`;
}

function beginExplorerColumnResize(event, columnId) {
  if (event.button !== 0) {
    return;
  }

  event.preventDefault();
  hideExplorerSuggestions();

  const activeResizer = event.currentTarget instanceof HTMLElement
    ? event.currentTarget
    : elements.explorerTable.querySelector(`.explorer-table-resizer[data-explorer-column="${columnId}"]`);
  const startX = event.clientX;
  const startWidth = getExplorerColumnWidth(columnId);
  let latestWidth = startWidth;

  const handlePointerMove = (moveEvent) => {
    latestWidth = clampExplorerColumnWidth(columnId, startWidth + moveEvent.clientX - startX);
    explorerColumnWidths = {
      ...explorerColumnWidths,
      [columnId]: latestWidth
    };
    applyExplorerColumnWidths();
  };

  const finishResize = () => {
    document.body.classList.remove('resizing-explorer-column');
    activeResizer?.classList.remove('is-resizing');
    document.removeEventListener('pointermove', handlePointerMove);
    document.removeEventListener('pointerup', finishResize);
    document.removeEventListener('pointercancel', finishResize);
    explorerColumnWidths = {
      ...explorerColumnWidths,
      [columnId]: latestWidth
    };
    saveExplorerColumnWidths();
  };

  document.body.classList.add('resizing-explorer-column');
  activeResizer?.classList.add('is-resizing');
  document.addEventListener('pointermove', handlePointerMove);
  document.addEventListener('pointerup', finishResize);
  document.addEventListener('pointercancel', finishResize);
}

function autofitExplorerColumn(columnId) {
  const candidates = [
    elements.explorerTable.querySelector(`th[data-explorer-column="${columnId}"] .explorer-column-label`),
    ...elements.explorerTable.querySelectorAll(`tbody td[data-explorer-column="${columnId}"]`)
  ].filter((element) => element instanceof HTMLElement);

  const measurer = document.createElement('span');
  Object.assign(measurer.style, {
    left: '-9999px',
    maxWidth: 'none',
    position: 'fixed',
    top: '-9999px',
    visibility: 'hidden',
    whiteSpace: 'pre'
  });
  document.body.append(measurer);

  let maxContentWidth = 0;
  for (const candidate of candidates) {
    const style = window.getComputedStyle(candidate);
    measurer.style.font = style.font;
    measurer.textContent = candidate.textContent || '';
    maxContentWidth = Math.max(maxContentWidth, measurer.getBoundingClientRect().width);
  }

  measurer.remove();

  explorerColumnWidths = {
    ...explorerColumnWidths,
    [columnId]: clampExplorerColumnWidth(columnId, Math.ceil(maxContentWidth + 34))
  };
  applyExplorerColumnWidths();
  saveExplorerColumnWidths();
}

function loadExplorerColumnWidths() {
  const defaults = Object.fromEntries(
    EXPLORER_TABLE_COLUMNS.map((column) => [column.id, column.defaultWidth])
  );

  try {
    const storedWidths = JSON.parse(localStorage.getItem(EXPLORER_COLUMN_STORAGE_KEY) ?? '{}');
    if (!storedWidths || typeof storedWidths !== 'object') {
      return defaults;
    }

    return EXPLORER_TABLE_COLUMNS.reduce((widths, column) => ({
      ...widths,
      [column.id]: clampExplorerColumnWidth(column.id, storedWidths[column.id] ?? column.defaultWidth)
    }), defaults);
  } catch {
    return defaults;
  }
}

function saveExplorerColumnWidths() {
  try {
    localStorage.setItem(EXPLORER_COLUMN_STORAGE_KEY, JSON.stringify(explorerColumnWidths));
  } catch {
    // Column resizing still works for the current session when storage is unavailable.
  }
}

function getExplorerColumnWidth(columnId) {
  const column = getExplorerColumnConfig(columnId);
  return clampExplorerColumnWidth(columnId, explorerColumnWidths[columnId] ?? column.defaultWidth);
}

function clampExplorerColumnWidth(columnId, width) {
  const column = getExplorerColumnConfig(columnId);
  const numericWidth = Number(width);
  if (!Number.isFinite(numericWidth)) {
    return column.defaultWidth;
  }
  return Math.min(column.maxWidth, Math.max(column.minWidth, Math.round(numericWidth)));
}

function getExplorerColumnConfig(columnId) {
  return EXPLORER_TABLE_COLUMNS.find((column) => column.id === columnId) ?? EXPLORER_TABLE_COLUMNS[0];
}

function renderExplorer() {
  const totalCount = state.explorer.items.length;
  const errorCount = state.explorer.errors.length;
  const searchTerms = parseExplorerSearchTerms(state.explorer.query);
  const filteredItems = searchTerms.length > 0
    ? filterExplorerItems(state.explorer.items, state.explorer.query)
    : [];

  elements.explorerCount.textContent = `등록된 JSON ${totalCount}개`;
  elements.explorerFileCount.textContent = `등록된 파일 ${totalCount}개`;
  elements.explorerResultCount.textContent = `검색 결과 ${searchTerms.length > 0 ? filteredItems.length : 0}개`;
  elements.explorerDrawerCount.textContent = `등록된 파일 ${totalCount}개`;
  elements.clearExplorerButton.disabled = totalCount === 0 && errorCount === 0;

  renderExplorerSuggestions();
  renderExplorerTable(filteredItems, searchTerms);
  renderExplorerRegisteredFiles();
  renderExplorerFileDrawer();
  renderExplorerModal();
}

function renderExplorerTable(items, searchTerms) {
  elements.explorerTableBody.replaceChildren();
  elements.explorerTableShell.hidden = true;
  elements.explorerEmptyState.hidden = false;

  if (state.explorer.items.length === 0) {
    elements.explorerEmptyState.textContent = 'JSON 파일 또는 폴더를 먼저 등록하세요.';
    return;
  }

  if (searchTerms.length === 0) {
    elements.explorerEmptyState.textContent = 'recognitionText 또는 파일명 등으로 검색하세요.';
    return;
  }

  if (items.length === 0) {
    elements.explorerEmptyState.textContent = `다음 조건을 모두 만족하는 결과가 없습니다: ${searchTerms.join(', ')}`;
    return;
  }

  const fragment = document.createDocumentFragment();
  for (const item of items) {
    fragment.append(renderExplorerTableRow(item));
  }

  elements.explorerEmptyState.hidden = true;
  elements.explorerTableShell.hidden = false;
  elements.explorerTableBody.replaceChildren(fragment);
  applyExplorerColumnWidths();
}

function renderExplorerTableRow(item) {
  const row = document.createElement('tr');
  appendExplorerTableCell(row, 'sourceFilename', item.sourceFilename, '파일명 없음');
  appendExplorerTableCell(row, 'recognitionText', item.recognitionText);
  appendExplorerTableCell(row, 'language', item.language);
  appendExplorerTableCell(row, 'slot', item.slotSummary);
  appendExplorerTableCell(row, 'contentType', item.contentType);
  appendExplorerTableCell(row, 'tableVersion', item.tableVersion);

  const actionCell = document.createElement('td');
  actionCell.dataset.explorerColumn = 'actions';
  const viewButton = document.createElement('button');
  viewButton.className = 'ghost-button';
  viewButton.type = 'button';
  viewButton.textContent = '보기';
  viewButton.addEventListener('click', () => {
    openExplorerModal(item.id);
  });
  actionCell.append(viewButton);
  row.append(actionCell);

  return row;
}

function appendExplorerTableCell(row, columnId, value, fallback = '-') {
  const cell = document.createElement('td');
  cell.dataset.explorerColumn = columnId;
  cell.textContent = explorerDisplayValue(value, fallback);
  row.append(cell);
}

function explorerDisplayValue(value, fallback = '-') {
  const text = String(value ?? '').trim();
  return text || fallback;
}

function renderExplorerSuggestions() {
  const suggestions = buildExplorerSuggestions(state.explorer.items, state.explorer.query);
  elements.explorerSuggestions.replaceChildren();

  if (suggestions.length === 0) {
    hideExplorerSuggestions();
    return;
  }

  const fragment = document.createDocumentFragment();
  for (const suggestion of suggestions) {
    const option = document.createElement('button');
    option.className = 'explorer-suggestion';
    option.type = 'button';
    option.setAttribute('role', 'option');

    const title = document.createElement('span');
    title.className = 'explorer-suggestion-title';
    title.textContent = suggestion.recognitionText;

    const meta = document.createElement('span');
    meta.className = 'item-meta';
    meta.textContent = suggestion.sourceFilename || '파일명 없음';

    option.append(title, meta);
    option.addEventListener('click', () => {
      state.explorer.query = suggestion.replacementQuery;
      elements.explorerSearchInput.value = suggestion.replacementQuery;
      renderExplorer();
      hideExplorerSuggestions();
    });
    fragment.append(option);
  }

  elements.explorerSuggestions.hidden = false;
  elements.explorerSearchInput.setAttribute('aria-expanded', 'true');
  elements.explorerSuggestions.replaceChildren(fragment);
}

function hideExplorerSuggestions() {
  elements.explorerSuggestions.hidden = true;
  elements.explorerSuggestions.replaceChildren();
  elements.explorerSearchInput.setAttribute('aria-expanded', 'false');
}

function handleExplorerOutsidePointerDown(event) {
  if (elements.explorerSuggestions.hidden) {
    return;
  }

  if (
    event.target instanceof HTMLElement &&
    elements.explorerSearchArea.contains(event.target)
  ) {
    return;
  }

  hideExplorerSuggestions();
}

function toggleExplorerFileDrawer(forceOpen) {
  const nextOpen = typeof forceOpen === 'boolean'
    ? forceOpen
    : !state.explorer.isFileDrawerOpen;

  if (nextOpen === state.explorer.isFileDrawerOpen) {
    renderExplorerFileDrawer();
    return;
  }

  if (nextOpen) {
    openExplorerFileDrawer();
    return;
  }

  closeExplorerFileDrawer();
}

function openExplorerFileDrawer() {
  explorerDrawerFocusReturnTarget = document.activeElement instanceof HTMLElement
    ? document.activeElement
    : null;
  state.explorer.isFileDrawerOpen = true;
  renderExplorerFileDrawer();
  elements.closeExplorerFilesButton.focus();
}

function closeExplorerFileDrawer() {
  state.explorer.isFileDrawerOpen = false;
  renderExplorerFileDrawer();
  restoreExplorerFocus(explorerDrawerFocusReturnTarget, elements.toggleExplorerFilesButton);
  explorerDrawerFocusReturnTarget = null;
}

function renderExplorerFileDrawer() {
  elements.explorerFileDrawer.hidden = !state.explorer.isFileDrawerOpen;
  elements.toggleExplorerFilesButton.setAttribute('aria-expanded', String(state.explorer.isFileDrawerOpen));
}

function renderExplorerRegisteredFiles() {
  const fragment = document.createDocumentFragment();

  if (state.explorer.items.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'empty-state compact-empty';
    empty.textContent = '등록된 파일이 없습니다.';
    fragment.append(empty);
  }

  for (const item of state.explorer.items) {
    const row = document.createElement('article');
    row.className = 'quick-title-row';

    const text = document.createElement('div');
    text.className = 'quick-title-button';

    const filename = document.createElement('strong');
    filename.textContent = item.sourceFilename || '파일명 없음';

    const recognitionText = document.createElement('span');
    recognitionText.className = 'item-meta';
    recognitionText.textContent = item.recognitionText || 'recognitionText 없음';

    text.append(filename, recognitionText);

    const tools = document.createElement('div');
    tools.className = 'item-tools';

    const deleteButton = document.createElement('button');
    deleteButton.className = 'icon-button';
    deleteButton.type = 'button';
    deleteButton.title = '삭제';
    deleteButton.textContent = 'X';
    deleteButton.setAttribute('aria-label', `${item.sourceFilename || 'JSON'} 삭제`);
    deleteButton.addEventListener('click', () => {
      removeExplorerItem(item.id);
    });

    tools.append(deleteButton);
    row.append(text, tools);
    fragment.append(row);
  }

  elements.explorerRegisteredList.replaceChildren(fragment);
}

function removeExplorerItem(id) {
  state.explorer.items = state.explorer.items.filter((item) => item.id !== id);
  if (state.explorer.modalItemId === id) {
    state.explorer.modalItemId = null;
  }
  renderExplorer();
}

function openExplorerModal(id) {
  explorerModalFocusReturnTarget = document.activeElement instanceof HTMLElement
    ? document.activeElement
    : null;
  hideExplorerSuggestions();
  state.explorer.modalItemId = id;
  renderExplorerModal();
  if (!elements.explorerModal.hidden) {
    elements.closeExplorerModalButton.focus();
  }
}

function closeExplorerModal() {
  state.explorer.modalItemId = null;
  renderExplorerModal();
  restoreExplorerFocus(explorerModalFocusReturnTarget, elements.explorerSearchInput);
  explorerModalFocusReturnTarget = null;
}

function renderExplorerModal() {
  const item = state.explorer.items.find((candidate) => candidate.id === state.explorer.modalItemId);

  if (!item) {
    state.explorer.modalItemId = null;
    elements.explorerModal.hidden = true;
    elements.explorerModalTitle.textContent = 'JSON 상세';
    elements.explorerModalMeta.textContent = '선택된 JSON이 없습니다.';
    elements.explorerModalJson.textContent = 'JSON 상세를 선택하세요.';
    return;
  }

  const meta = [
    item.sourceFilename,
    item.language,
    item.contentType,
    item.tableVersion
  ].map((part) => String(part ?? '').trim()).filter(Boolean);

  elements.explorerModal.hidden = false;
  elements.explorerModalTitle.textContent = item.recognitionText || item.sourceFilename || 'JSON 상세';
  elements.explorerModalMeta.textContent = meta.join(' | ');
  elements.explorerModalJson.textContent = formatDownloadContent(item);
}

function restoreExplorerFocus(savedTarget, fallbackTarget) {
  const focusTarget = savedTarget instanceof HTMLElement && savedTarget.isConnected
    ? savedTarget
    : fallbackTarget;
  focusTarget?.focus();
}

function trapExplorerModalFocus(event) {
  const focusableElements = getExplorerModalFocusableElements();

  if (focusableElements.length === 0) {
    event.preventDefault();
    return;
  }

  const firstFocusable = focusableElements[0];
  const lastFocusable = focusableElements.at(-1);
  const activeElement = document.activeElement instanceof HTMLElement
    ? document.activeElement
    : null;

  if (!activeElement || !elements.explorerModal.contains(activeElement)) {
    event.preventDefault();
    firstFocusable.focus();
    return;
  }

  if (event.shiftKey && activeElement === firstFocusable) {
    event.preventDefault();
    lastFocusable.focus();
    return;
  }

  if (!event.shiftKey && activeElement === lastFocusable) {
    event.preventDefault();
    firstFocusable.focus();
  }
}

function getExplorerModalFocusableElements() {
  const focusableSelector = [
    'a[href]',
    'button:not([disabled])',
    'input:not([disabled])',
    'select:not([disabled])',
    'textarea:not([disabled])',
    '[tabindex]:not([tabindex="-1"])'
  ].join(',');

  return Array.from(elements.explorerModal.querySelectorAll(focusableSelector))
    .filter((element) => element instanceof HTMLElement && !element.hidden);
}

function openHelp() {
  helpFocusReturnTarget = document.activeElement instanceof HTMLElement
    ? document.activeElement
    : elements.openHelpButton;
  activeHelpStep = 0;
  elements.helpOverlay.hidden = false;
  elements.openHelpButton.setAttribute('aria-expanded', 'true');
  document.body.classList.add('help-open');
  showHelpStep(activeHelpStep);
  elements.helpCallout.focus();
}

function closeHelp() {
  elements.helpOverlay.hidden = true;
  elements.openHelpButton.setAttribute('aria-expanded', 'false');
  document.body.classList.remove('help-open');
  elements.helpSpotlight.removeAttribute('style');
  elements.helpCallout.removeAttribute('style');
  helpFocusReturnTarget?.focus();
  helpFocusReturnTarget = null;
}

function showHelpStep(index) {
  activeHelpStep = Math.min(Math.max(index, 0), helpSteps.length - 1);
  const step = helpSteps[activeHelpStep];

  elements.helpStepTitle.textContent = step.title;
  elements.helpStepBody.textContent = step.body;
  elements.helpStepCount.textContent = `${activeHelpStep + 1} / ${helpSteps.length}`;
  elements.prevHelpButton.disabled = activeHelpStep === 0;
  elements.nextHelpButton.textContent = activeHelpStep === helpSteps.length - 1 ? '종료' : '다음';

  const target = document.querySelector(step.selector);
  target?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  requestAnimationFrame(() => {
    positionHelpOverlay();
  });
}

function positionHelpOverlay() {
  const step = helpSteps[activeHelpStep];
  const target = document.querySelector(step.selector);

  if (!target) {
    return;
  }

  const rect = target.getBoundingClientRect();
  const padding = 8;
  const spotlightTop = Math.max(rect.top - padding, 8);
  const spotlightLeft = Math.max(rect.left - padding, 8);
  const spotlightWidth = Math.min(rect.width + padding * 2, window.innerWidth - spotlightLeft - 8);
  const spotlightHeight = Math.min(rect.height + padding * 2, window.innerHeight - spotlightTop - 8);

  Object.assign(elements.helpSpotlight.style, {
    height: `${spotlightHeight}px`,
    left: `${spotlightLeft}px`,
    top: `${spotlightTop}px`,
    width: `${spotlightWidth}px`
  });

  const calloutRect = elements.helpCallout.getBoundingClientRect();
  const maxLeft = window.innerWidth - calloutRect.width - 16;
  const maxTop = window.innerHeight - calloutRect.height - 16;
  let left = Math.min(Math.max(rect.left, 16), Math.max(maxLeft, 16));
  let top = rect.bottom + 14;

  if (top > maxTop) {
    top = rect.top - calloutRect.height - 14;
  }

  if (top < 16) {
    top = Math.min(Math.max(rect.top, 16), Math.max(maxTop, 16));
    left = rect.right + 14;
    if (left > maxLeft) {
      left = rect.left - calloutRect.width - 14;
    }
    left = Math.min(Math.max(left, 16), Math.max(maxLeft, 16));
  }

  Object.assign(elements.helpCallout.style, {
    left: `${left}px`,
    top: `${top}px`
  });
}

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

function setExplorerUploadStatus(message) {
  elements.explorerUploadStatus.textContent = message;
}
