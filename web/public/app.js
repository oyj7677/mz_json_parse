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
  resolveActiveAdminDatasetId,
  resolveMappingGroupSelection,
  sanitizeFilenameBase
} from './core.js';

import {
  filterStringResourceRows,
  normalizeStringResourceWorkbook,
  resolveStringResourceQualifiers,
  resolveStringResourceVisibleQualifierState,
  STRING_RESOURCE_DEFAULT_QUALIFIERS,
  toggleStringResourceVisibleQualifier
} from './string-resource-core.js';
import { parseMappingWorkbookFile } from './mapping-table-xlsx.js';
import { parseStringResourceWorkbookFile } from './string-resource-xlsx.js';
import { initializeJsonEditorTool } from './json-editor-tool.js';
import { normalizeToolRoute, pathForTool } from './routes.js';

const EXPLORER_COLUMN_STORAGE_KEY = 'mz-json-explorer-column-widths';
const ADMIN_LANGUAGE_OPTIONS_STORAGE_KEY = 'mz-json-admin-language-options';
const STRING_RESOURCE_RESULT_RENDER_LIMIT = 500;
const ADMIN_DATASET_TOOL_TYPES = {
  json: 'json',
  mapping: 'mapping_table',
  stringResource: 'string_resource'
};
const DATASET_API_URLS = {
  json: '/api/datasets?tool=json',
  mapping_table: '/api/datasets?tool=mapping_table',
  string_resource: '/api/datasets?tool=string_resource'
};
const DEFAULT_ADMIN_LANGUAGE_OPTIONS = [
  'ko_KR',
  'en_US',
  'en_GB',
  'en_AU',
  'es_MX',
  'es_ES',
  'fr_FR',
  'ar_AE'
];
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
    countries: [],
    datasets: [],
    errors: [],
    isFileDrawerOpen: false,
    isDbLoaded: false,
    isDbLoading: false,
    items: [],
    modalItemId: null,
    nextId: 1,
    query: '',
    selectedCountry: '',
    selectedDatasetId: ''
  },
  items: [],
  mapping: {
    datasets: [],
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
    datasets: [],
    errors: [],
    expandedFileIds: new Set(),
    files: [],
    hiddenQualifiers: new Set(),
    isUploading: false,
    modalRowId: '',
    nextFileId: 1,
    query: '',
    rows: [],
    selectedDatasetId: '',
    selectedSheetIds: new Set(),
    visibleQualifiers: [...STRING_RESOURCE_DEFAULT_QUALIFIERS]
  },
  admin: {
    datasets: [],
    isLoading: false,
    languageOptions: loadAdminLanguageOptions(),
    records: [],
    query: '',
    recentBatches: [],
    selectedDatasetId: '',
    selectedFiles: [],
    status: null
  },
  adminDb: {
    activeTool: 'json',
    datasets: [],
    selectedDatasetIds: {
      json: '',
      mapping: '',
      stringResource: ''
    }
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

const adminHelpSteps = [
  {
    body: '관리자에게 공유된 Admin key를 입력합니다. 이 키는 업로드와 삭제 같은 관리자 작업에 사용됩니다.',
    selector: '.admin-auth-panel',
    title: 'Admin key'
  },
  {
    body: '입력한 Admin key로 DB 상태, 저장된 JSON 개수, 최근 업로드 배치를 다시 불러옵니다.',
    selector: '#adminRefreshButton',
    title: 'DB 상태 새로고침'
  },
  {
    body: 'Language를 선택한 뒤 Batch name과 설명으로 업로드 묶음을 구분합니다. 선택한 language는 모든 JSON에 적용됩니다.',
    selector: '.admin-upload-panel',
    title: 'DB에 업로드'
  },
  {
    body: '저장된 JSON은 recognitionText 또는 파일명으로 검색할 수 있고, 필요 없는 항목은 개별 삭제할 수 있습니다.',
    selector: '.admin-records-panel',
    title: '최근 JSON'
  },
  {
    body: '업로드 묶음 단위로 기록을 확인합니다. 배치를 삭제하면 해당 업로드에 포함된 JSON들이 검색 대상에서 제외됩니다.',
    selector: '.admin-batches-panel',
    title: '최근 배치'
  }
];

const elements = {
  adminApp: document.querySelector('#adminApp'),
  adminBatchCount: document.querySelector('#adminBatchCount'),
  adminBatchNameInput: document.querySelector('#adminBatchNameInput'),
  adminCountryRegionInput: document.querySelector('#adminCountryRegionInput'),
  adminCreateDatasetButton: document.querySelector('#adminCreateDatasetButton'),
  adminDatasetDescriptionInput: document.querySelector('#adminDatasetDescriptionInput'),
  adminDatasetList: document.querySelector('#adminDatasetList'),
  adminDatasetNameInput: document.querySelector('#adminDatasetNameInput'),
  adminDatasetSelect: document.querySelector('#adminDatasetSelect'),
  adminDescriptionInput: document.querySelector('#adminDescriptionInput'),
  adminHelpButton: document.querySelector('#adminHelpButton'),
  adminImportButton: document.querySelector('#adminImportButton'),
  adminImportStatus: document.querySelector('#adminImportStatus'),
  adminJsonTab: document.querySelector('#adminJsonTab'),
  adminJsonUploadPanel: document.querySelector('#adminJsonUploadPanel'),
  adminJsonFileInput: document.querySelector('#adminJsonFileInput'),
  adminKeyInput: document.querySelector('#adminKeyInput'),
  adminAddLanguageButton: document.querySelector('#adminAddLanguageButton'),
  adminLanguageInput: document.querySelector('#adminLanguageInput'),
  adminLanguageOptions: document.querySelector('#adminLanguageOptions'),
  adminMappingFileInput: document.querySelector('#adminMappingFileInput'),
  adminMappingImportStatus: document.querySelector('#adminMappingImportStatus'),
  adminMappingTab: document.querySelector('#adminMappingTab'),
  adminMappingUploadButton: document.querySelector('#adminMappingUploadButton'),
  adminMappingUploadPanel: document.querySelector('#adminMappingUploadPanel'),
  adminRecentBatches: document.querySelector('#adminRecentBatches'),
  adminRecordCount: document.querySelector('#adminRecordCount'),
  adminRecordSearchInput: document.querySelector('#adminRecordSearchInput'),
  adminRecordsTableBody: document.querySelector('#adminRecordsTableBody'),
  adminRefreshButton: document.querySelector('#adminRefreshButton'),
  adminSelectedFileCount: document.querySelector('#adminSelectedFileCount'),
  adminStatus: document.querySelector('#adminStatus'),
  adminStringResourceFileInput: document.querySelector('#adminStringResourceFileInput'),
  adminStringResourceImportStatus: document.querySelector('#adminStringResourceImportStatus'),
  adminStringResourceTab: document.querySelector('#adminStringResourceTab'),
  adminStringResourceUploadButton: document.querySelector('#adminStringResourceUploadButton'),
  adminStringResourceUploadPanel: document.querySelector('#adminStringResourceUploadPanel'),
  adminSummary: document.querySelector('#adminSummary'),
  backToHubButton: document.querySelector('#backToHubButton'),
  backToHubFromAdminButton: document.querySelector('#backToHubFromAdminButton'),
  backToHubFromExplorerButton: document.querySelector('#backToHubFromExplorerButton'),
  backToHubFromJsonEditorButton: document.querySelector('#backToHubFromJsonEditorButton'),
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
  explorerCountrySelect: document.querySelector('#explorerCountrySelect'),
  explorerDatasetSelect: document.querySelector('#explorerDatasetSelect'),
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
  jsonEditorApp: document.querySelector('#jsonEditorApp'),
  jsonEditorCompareButton: document.querySelector('#jsonEditorCompareButton'),
  jsonEditorCopyLeftButton: document.querySelector('#jsonEditorCopyLeftButton'),
  jsonEditorCopyRightButton: document.querySelector('#jsonEditorCopyRightButton'),
  jsonEditorDiffBody: document.querySelector('#jsonEditorDiffBody'),
  jsonEditorDiffPanel: document.querySelector('#jsonEditorDiffPanel'),
  jsonEditorDiffSummary: document.querySelector('#jsonEditorDiffSummary'),
  jsonEditorLeftCopyButton: document.querySelector('#jsonEditorLeftCopyButton'),
  jsonEditorLeftDownloadButton: document.querySelector('#jsonEditorLeftDownloadButton'),
  jsonEditorLeftFileInput: document.querySelector('#jsonEditorLeftFileInput'),
  jsonEditorLeftMount: document.querySelector('#jsonEditorLeftMount'),
  jsonEditorLeftStatus: document.querySelector('#jsonEditorLeftStatus'),
  jsonEditorRightCopyButton: document.querySelector('#jsonEditorRightCopyButton'),
  jsonEditorRightDownloadButton: document.querySelector('#jsonEditorRightDownloadButton'),
  jsonEditorRightFileInput: document.querySelector('#jsonEditorRightFileInput'),
  jsonEditorRightMount: document.querySelector('#jsonEditorRightMount'),
  jsonEditorRightStatus: document.querySelector('#jsonEditorRightStatus'),
  jsonEditorSummary: document.querySelector('#jsonEditorSummary'),
  jsonEditorSwapButton: document.querySelector('#jsonEditorSwapButton'),
  mappingApp: document.querySelector('#mappingApp'),
  mappingCount: document.querySelector('#mappingCount'),
  mappingDatasetSelect: document.querySelector('#mappingDatasetSelect'),
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
  stringResourceDatasetSelect: document.querySelector('#stringResourceDatasetSelect'),
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
  stringResourceUploadProgress: document.querySelector('#stringResourceUploadProgress'),
  stringResourceUploadOverlay: document.querySelector('#stringResourceUploadOverlay'),
  stringResourceUploadOverlayDetail: document.querySelector('#stringResourceUploadOverlayDetail'),
  stringResourceUploadOverlayPercent: document.querySelector('#stringResourceUploadOverlayPercent'),
  stringResourceUploadOverlayProgress: document.querySelector('#stringResourceUploadOverlayProgress'),
  stringResourceUploadOverlayTitle: document.querySelector('#stringResourceUploadOverlayTitle'),
  stringResourceUploadProgressBar: document.querySelector('#stringResourceUploadProgressBar'),
  stringResourceUploadProgressFill: document.querySelector('#stringResourceUploadProgressFill'),
  stringResourceUploadProgressText: document.querySelector('#stringResourceUploadProgressText'),
  stringResourceUploadStatus: document.querySelector('#stringResourceUploadStatus'),
  openExplorerButton: document.querySelector('#openExplorerButton'),
  openFormatterButton: document.querySelector('#openFormatterButton'),
  openHelpButton: document.querySelector('#openHelpButton'),
  openJsonEditorButton: document.querySelector('#openJsonEditorButton'),
  openMappingButton: document.querySelector('#openMappingButton'),
  openAdminButton: document.querySelector('#openAdminButton'),
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
let activeHelpSteps = helpSteps;
let helpControlButton = null;
let helpFocusReturnTarget = null;
let explorerModalFocusReturnTarget = null;
let explorerDrawerFocusReturnTarget = null;
let stringResourceDetailFocusReturnTarget = null;
let explorerColumnWidths = loadExplorerColumnWidths();
let jsonEditorToolState = null;

elements.openFormatterButton.addEventListener('click', () => {
  navigateToTool('formatter');
});

elements.openExplorerButton.addEventListener('click', () => {
  navigateToTool('explorer');
});

elements.openMappingButton.addEventListener('click', () => {
  navigateToTool('mapping');
});

elements.openStringResourceButton.addEventListener('click', () => {
  navigateToTool('stringResource');
});

elements.openJsonEditorButton.addEventListener('click', () => {
  navigateToTool('jsonEditor');
});

elements.openAdminButton.addEventListener('click', () => {
  navigateToTool('admin');
});

elements.backToHubButton.addEventListener('click', () => {
  navigateToTool('hub');
});

elements.backToHubFromAdminButton.addEventListener('click', () => {
  navigateToTool('hub');
});

elements.backToHubFromExplorerButton.addEventListener('click', () => {
  navigateToTool('hub');
});

elements.backToHubFromJsonEditorButton.addEventListener('click', () => {
  navigateToTool('hub');
});

elements.backToHubFromMappingButton.addEventListener('click', () => {
  navigateToTool('hub');
});

elements.backToHubFromStringResourceButton.addEventListener('click', () => {
  navigateToTool('hub');
});

elements.adminJsonFileInput.addEventListener('change', () => {
  state.admin.selectedFiles = Array.from(elements.adminJsonFileInput.files ?? []);
  renderAdminUploadState();
});

elements.adminJsonTab.addEventListener('click', () => {
  void setAdminTool('json');
});

elements.adminMappingTab.addEventListener('click', () => {
  void setAdminTool('mapping');
});

elements.adminStringResourceTab.addEventListener('click', () => {
  void setAdminTool('stringResource');
});

elements.adminCreateDatasetButton.addEventListener('click', () => {
  void createAdminDataset();
});

elements.adminRefreshButton.addEventListener('click', () => {
  void refreshAdminDashboard();
});

elements.adminImportButton.addEventListener('click', () => {
  void uploadAdminJsonDatasetFiles();
});

elements.adminDatasetSelect.addEventListener('change', (event) => {
  state.admin.selectedDatasetId = event.target.value;
  state.adminDb.selectedDatasetIds.json = event.target.value;
  renderAdminUploadState();
  renderAdminDatasetList();
});

elements.adminMappingFileInput.addEventListener('change', () => {
  renderAdminUploadState();
});

elements.adminMappingUploadButton.addEventListener('click', () => {
  void uploadAdminMappingDataset();
});

elements.adminStringResourceFileInput.addEventListener('change', () => {
  renderAdminUploadState();
});

elements.adminStringResourceUploadButton.addEventListener('click', () => {
  void uploadAdminStringResourceDataset();
});

elements.adminCountryRegionInput.addEventListener('input', () => {
  renderAdminUploadState();
});

elements.adminLanguageInput.addEventListener('input', () => {
  renderAdminUploadState();
});

elements.adminAddLanguageButton.addEventListener('click', () => {
  registerAdminLanguageOption();
});

elements.adminRecordSearchInput.addEventListener('input', (event) => {
  state.admin.query = event.target.value;
  void loadAdminRecords().catch((error) => {
    setAdminStatus(error instanceof Error ? error.message : String(error));
  });
});

elements.stringResourceSearchInput.addEventListener('input', (event) => {
  state.stringResource.query = event.target.value;
  if (state.stringResource.selectedDatasetId) {
    void loadStringResourceDatasetRows(state.stringResource.selectedDatasetId, state.stringResource.query);
  } else {
    renderStringResource();
  }
});

elements.stringResourceDatasetSelect.addEventListener('change', (event) => {
  state.stringResource.selectedDatasetId = event.target.value;
  if (!state.stringResource.selectedDatasetId) {
    clearDbStringResourceRows();
    renderStringResource();
    return;
  }
  void loadStringResourceDatasetRows(state.stringResource.selectedDatasetId, state.stringResource.query);
});

elements.stringResourceFileInput.addEventListener('change', async () => {
  state.stringResource.selectedDatasetId = '';
  elements.stringResourceDatasetSelect.value = '';
  await registerStringResourceFiles(elements.stringResourceFileInput.files);
  elements.stringResourceFileInput.value = '';
});

elements.clearStringResourceButton.addEventListener('click', () => {
  state.stringResource.errors = [];
  state.stringResource.files = [];
  state.stringResource.hiddenQualifiers = new Set();
  state.stringResource.modalRowId = '';
  state.stringResource.nextFileId = 1;
  state.stringResource.query = '';
  state.stringResource.rows = [];
  state.stringResource.expandedFileIds = new Set();
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

elements.mappingDatasetSelect.addEventListener('change', (event) => {
  state.mapping.source = '';
  state.mapping.selectedGroupId = '';
  state.mapping.selectedSlots = [];
  if (!event.target.value) {
    state.mapping.isLoaded = false;
    state.mapping.isLoading = true;
    state.mapping.rows = [];
    renderMappingWorkflow();
    void loadStaticMappingData()
      .catch((error) => {
        state.mapping.error = error instanceof Error ? error.message : String(error);
      })
      .finally(() => {
        state.mapping.isLoading = false;
        renderMappingWorkflow();
      });
    return;
  }
  void loadMappingDatasetRows(event.target.value);
});

elements.explorerFileInput.addEventListener('change', async () => {
  state.explorer.selectedDatasetId = '';
  state.explorer.selectedCountry = '';
  elements.explorerDatasetSelect.value = '';
  renderExplorerCountries([]);
  await registerExplorerFiles(elements.explorerFileInput.files);
  elements.explorerFileInput.value = '';
});

elements.explorerFolderInput.addEventListener('change', async () => {
  state.explorer.selectedDatasetId = '';
  state.explorer.selectedCountry = '';
  elements.explorerDatasetSelect.value = '';
  renderExplorerCountries([]);
  await registerExplorerFiles(elements.explorerFolderInput.files);
  elements.explorerFolderInput.value = '';
});

elements.explorerSearchInput.addEventListener('input', (event) => {
  state.explorer.query = event.target.value;
  if (state.explorer.selectedDatasetId) {
    void searchDbExplorerRecords();
  } else {
    renderExplorer();
  }
});

elements.explorerDatasetSelect.addEventListener('change', (event) => {
  state.explorer.selectedDatasetId = event.target.value;
  state.explorer.selectedCountry = '';
  if (!state.explorer.selectedDatasetId) {
    clearDbExplorerRows();
    renderExplorerCountries([]);
    renderExplorer();
    return;
  }
  void loadExplorerCountries().then(() => searchDbExplorerRecords());
});

elements.explorerCountrySelect.addEventListener('change', (event) => {
  state.explorer.selectedCountry = event.target.value;
  void searchDbExplorerRecords();
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
  openHelp(helpSteps, elements.openHelpButton);
});

elements.adminHelpButton.addEventListener('click', () => {
  openHelp(adminHelpSteps, elements.adminHelpButton);
});

elements.closeHelpButton.addEventListener('click', () => {
  closeHelp();
});

elements.prevHelpButton.addEventListener('click', () => {
  showHelpStep(activeHelpStep - 1);
});

elements.nextHelpButton.addEventListener('click', () => {
  if (activeHelpStep === activeHelpSteps.length - 1) {
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
  if (event.key === 'Tab' && !elements.stringResourceDetailModal.hidden) {
    trapModalFocus(event, elements.stringResourceDetailModal);
    return;
  }

  if (event.key === 'Tab' && !elements.explorerModal.hidden) {
    trapModalFocus(event, elements.explorerModal);
    return;
  }

  if (event.key !== 'Escape') {
    return;
  }

  if (!elements.helpOverlay.hidden) {
    closeHelp();
    return;
  }

  if (!elements.stringResourceDetailModal.hidden) {
    closeStringResourceDetail();
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
window.addEventListener('popstate', renderToolRoute);

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
renderAdminLanguageOptions();
renderAdminDashboard();
renderToolRoute();

function navigateToTool(tool) {
  const nextPath = pathForTool(tool);

  if (window.location.pathname !== nextPath) {
    history.pushState({ tool }, '', nextPath);
  }

  renderToolRoute();
}

function renderToolRoute() {
  const route = normalizeToolRoute(window.location.pathname);

  if (window.location.pathname !== route.path) {
    history.replaceState({ tool: route.tool }, '', route.path);
  }

  showToolView(route.tool);
}

function showToolView(tool) {
  if (tool === 'formatter') {
    showFormatterTool();
    return;
  }

  if (tool === 'explorer') {
    showExplorerTool();
    return;
  }

  if (tool === 'mapping') {
    showMappingTool();
    return;
  }

  if (tool === 'stringResource') {
    showStringResourceTool();
    return;
  }

  if (tool === 'jsonEditor') {
    showJsonEditorTool();
    return;
  }

  if (tool === 'admin') {
    showAdminTool();
    return;
  }

  showToolHub();
}

function showToolHub() {
  if (!elements.helpOverlay.hidden) {
    closeHelp();
  }

  elements.toolHub.hidden = false;
  elements.formatterApp.hidden = true;
  elements.explorerApp.hidden = true;
  elements.mappingApp.hidden = true;
  elements.stringResourceApp.hidden = true;
  elements.jsonEditorApp.hidden = true;
  elements.adminApp.hidden = true;
  document.body.classList.remove('formatter-active', 'mapping-active', 'json-editor-active');
  elements.openFormatterButton.focus();
}

function showFormatterTool() {
  elements.toolHub.hidden = true;
  elements.formatterApp.hidden = false;
  elements.explorerApp.hidden = true;
  elements.mappingApp.hidden = true;
  elements.stringResourceApp.hidden = true;
  elements.jsonEditorApp.hidden = true;
  elements.adminApp.hidden = true;
  document.body.classList.remove('mapping-active', 'json-editor-active');
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
  elements.jsonEditorApp.hidden = true;
  elements.adminApp.hidden = true;
  document.body.classList.remove('formatter-active', 'mapping-active', 'json-editor-active');
  elements.backToHubFromExplorerButton.focus();
  void loadExplorerDatasets();
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
  elements.jsonEditorApp.hidden = true;
  elements.adminApp.hidden = true;
  document.body.classList.remove('formatter-active', 'json-editor-active');
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
  elements.jsonEditorApp.hidden = true;
  elements.adminApp.hidden = true;
  document.body.classList.remove('formatter-active', 'mapping-active', 'json-editor-active');
  elements.stringResourceSearchInput.focus();
  void loadStringResourceDatasets();
  renderStringResource();
}

function showJsonEditorTool() {
  if (!elements.helpOverlay.hidden) {
    closeHelp();
  }

  elements.toolHub.hidden = true;
  elements.formatterApp.hidden = true;
  elements.explorerApp.hidden = true;
  elements.mappingApp.hidden = true;
  elements.stringResourceApp.hidden = true;
  elements.jsonEditorApp.hidden = false;
  elements.adminApp.hidden = true;
  document.body.classList.remove('formatter-active', 'mapping-active');
  document.body.classList.add('json-editor-active');

  if (!jsonEditorToolState) {
    jsonEditorToolState = initializeJsonEditorTool(elements);
  }

  elements.backToHubFromJsonEditorButton.focus();
}

function showAdminTool() {
  if (!elements.helpOverlay.hidden) {
    closeHelp();
  }

  elements.toolHub.hidden = true;
  elements.formatterApp.hidden = true;
  elements.explorerApp.hidden = true;
  elements.mappingApp.hidden = true;
  elements.stringResourceApp.hidden = true;
  elements.jsonEditorApp.hidden = true;
  elements.adminApp.hidden = false;
  document.body.classList.remove('formatter-active', 'mapping-active', 'json-editor-active');
  elements.adminKeyInput.focus();
  renderAdminDashboard();
}

async function refreshAdminDashboard() {
  if (!adminKey()) {
    setAdminStatus('관리자 키를 입력하세요.');
    renderAdminDashboard();
    return;
  }

  state.admin.isLoading = true;
  renderAdminDashboard();

  try {
    await loadAdminDatasets();
    await loadAdminStatus();
    await loadAdminRecords();
    setAdminStatus('DB 상태를 불러왔습니다.');
  } catch (error) {
    setAdminStatus(error instanceof Error ? error.message : String(error));
  } finally {
    state.admin.isLoading = false;
    renderAdminDashboard();
  }
}

async function setAdminTool(tool) {
  state.adminDb.activeTool = normalizeAdminTool(tool);
  renderAdminDashboard();
  if (!adminKey()) {
    return;
  }

  state.admin.isLoading = true;
  renderAdminDashboard();
  try {
    await loadAdminDatasets(state.adminDb.activeTool);
    setAdminStatus('Dataset list loaded.');
  } catch (error) {
    setAdminStatus(error instanceof Error ? error.message : String(error));
  } finally {
    state.admin.isLoading = false;
    renderAdminDashboard();
  }
}

async function createAdminDataset() {
  if (!adminKey()) {
    setAdminStatus('愿由ъ옄 ?ㅻ? ?낅젰?섏꽭??');
    return;
  }

  const name = elements.adminDatasetNameInput.value.trim();
  if (!name) {
    setAdminStatus('Dataset name is required.');
    return;
  }

  state.admin.isLoading = true;
  renderAdminDashboard();

  try {
    const response = await fetch('/api/admin/datasets', {
      body: JSON.stringify({
        description: elements.adminDatasetDescriptionInput.value.trim(),
        name,
        toolType: adminDatasetToolType()
      }),
      headers: adminHeaders({ json: true }),
      method: 'POST'
    });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(body.error ?? `Dataset create failed (${response.status})`);
    }

    elements.adminDatasetNameInput.value = '';
    elements.adminDatasetDescriptionInput.value = '';
    const createdDataset = body.dataset ?? body;
    const createdDatasetId = String(createdDataset?.id ?? '').trim();
    if (createdDatasetId) {
      state.adminDb.selectedDatasetIds[state.adminDb.activeTool] = createdDatasetId;
      if (state.adminDb.activeTool === 'json') {
        state.admin.selectedDatasetId = createdDatasetId;
      }
    }
    await loadAdminDatasets(state.adminDb.activeTool);
    setAdminStatus('Dataset created.');
  } catch (error) {
    setAdminStatus(error instanceof Error ? error.message : String(error));
  } finally {
    state.admin.isLoading = false;
    renderAdminDashboard();
  }
}

async function setAdminDatasetActive(id) {
  if (!adminKey()) {
    setAdminStatus('愿由ъ옄 ?ㅻ? ?낅젰?섏꽭??');
    return;
  }

  state.admin.isLoading = true;
  renderAdminDashboard();

  try {
    const response = await fetch(`/api/admin/datasets/${encodeURIComponent(id)}/active`, {
      headers: adminHeaders({ json: true }),
      method: 'PATCH'
    });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(body.error ?? `Dataset activate failed (${response.status})`);
    }

    state.adminDb.selectedDatasetIds[state.adminDb.activeTool] = String(id ?? '').trim();
    if (state.adminDb.activeTool === 'json') {
      state.admin.selectedDatasetId = String(id ?? '').trim();
    }
    await loadAdminDatasets(state.adminDb.activeTool);
    setAdminStatus('Dataset activated.');
  } catch (error) {
    setAdminStatus(error instanceof Error ? error.message : String(error));
  } finally {
    state.admin.isLoading = false;
    renderAdminDashboard();
  }
}

async function uploadAdminJsonDatasetFiles() {
  await importAdminJsonFiles();
}

async function importAdminJsonFiles() {
  if (!adminKey()) {
    setAdminImportStatus('관리자 키를 입력하세요.', 'json');
    return;
  }
  if (!adminLanguage()) {
    setAdminImportStatus('Language 값을 선택하거나 입력하세요.', 'json');
    return;
  }
  if (!adminDatasetId()) {
    setAdminImportStatus('Dataset을 선택하세요.', 'json');
    return;
  }
  if (!adminCountryRegion()) {
    setAdminImportStatus('Country/Region 값을 입력하세요.', 'json');
    return;
  }
  if (state.admin.selectedFiles.length === 0) {
    setAdminImportStatus('업로드할 JSON 파일을 선택하세요.', 'json');
    return;
  }

  state.admin.isLoading = true;
  renderAdminDashboard();
  setAdminImportStatus(`파일 ${state.admin.selectedFiles.length}개를 읽는 중입니다.`, 'json');

  try {
    const files = [];
    for (const file of state.admin.selectedFiles) {
      files.push({
        filename: file.name,
        text: await file.text()
      });
    }

    const response = await fetch('/api/admin/json-records/import', {
      body: JSON.stringify({
        batchName: elements.adminBatchNameInput.value,
        countryRegion: adminCountryRegion(),
        description: elements.adminDescriptionInput.value,
        datasetId: adminDatasetId(),
        language: adminLanguage(),
        files
      }),
      headers: adminHeaders({ json: true }),
      method: 'POST'
    });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(body.error ?? `업로드 실패 (${response.status})`);
    }

    setAdminImportStatus(`업로드 완료: 저장 ${body.insertedCount ?? 0}개, 중복 ${body.skippedCount ?? 0}개`, 'json');
    rememberAdminLanguageOption(adminLanguage());
    elements.adminJsonFileInput.value = '';
    state.admin.selectedFiles = [];
    await refreshAdminDashboard();
  } catch (error) {
    setAdminImportStatus(error instanceof Error ? error.message : String(error), 'json');
  } finally {
    state.admin.isLoading = false;
    renderAdminDashboard();
  }
}

async function uploadAdminMappingDataset() {
  if (!adminKey()) {
    setAdminImportStatus('Admin key is required.', 'mapping');
    return;
  }
  const datasetId = adminDbDatasetId();
  if (!datasetId) {
    setAdminImportStatus('Dataset is required.', 'mapping');
    return;
  }
  const file = elements.adminMappingFileInput.files?.[0];
  if (!file) {
    setAdminImportStatus('Mapping workbook is required.', 'mapping');
    return;
  }

  state.admin.isLoading = true;
  renderAdminDashboard();
  setAdminImportStatus('Parsing mapping workbook.', 'mapping');

  try {
    const workbook = await parseMappingWorkbookFile(file);
    const rows = normalizeMappingWorkbook(workbook).map((row) => ({
      ...row,
      sourceFilename: file.name
    }));
    if (rows.length === 0) {
      throw new Error('Mapping workbook has no importable rows.');
    }

    const response = await fetch('/api/admin/mapping-table/import', {
      body: JSON.stringify({
        datasetId,
        rows,
        summary: {
          source: file.name,
          rowCount: rows.length,
          sheetCount: workbook.sheets.length
        }
      }),
      headers: adminHeaders({ json: true }),
      method: 'POST'
    });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(body.error ?? `Mapping import failed (${response.status})`);
    }

    elements.adminMappingFileInput.value = '';
    setAdminImportStatus(`Mapping import complete: ${body.insertedCount ?? 0} rows.`, 'mapping');
  } catch (error) {
    setAdminImportStatus(error instanceof Error ? error.message : String(error), 'mapping');
  } finally {
    state.admin.isLoading = false;
    renderAdminDashboard();
  }
}

async function uploadAdminStringResourceDataset() {
  if (!adminKey()) {
    setAdminImportStatus('Admin key is required.', 'stringResource');
    return;
  }
  const datasetId = adminDbDatasetId();
  if (!datasetId) {
    setAdminImportStatus('Dataset is required.', 'stringResource');
    return;
  }
  const files = Array.from(elements.adminStringResourceFileInput.files ?? []);
  if (files.length === 0) {
    setAdminImportStatus('String Resource workbook is required.', 'stringResource');
    return;
  }

  state.admin.isLoading = true;
  renderAdminDashboard();
  setAdminImportStatus(`Parsing ${files.length} string resource workbook(s).`, 'stringResource');

  try {
    const rows = [];
    const sheetSummaries = [];
    for (const file of files) {
      const workbook = await parseStringResourceWorkbookFile(file);
      const normalized = normalizeStringResourceWorkbook(workbook, file.name);
      rows.push(...normalized.rows.map((row) => ({
        ...row,
        sourceFilename: file.name
      })));
      sheetSummaries.push(...normalized.sheetSummaries.map((summary) => ({
        ...summary,
        fileName: file.name
      })));
    }
    if (rows.length === 0) {
      throw new Error('String Resource workbook has no importable rows.');
    }

    const qualifiers = resolveStringResourceQualifiers(rows);
    const response = await fetch('/api/admin/string-resources/import', {
      body: JSON.stringify({
        datasetId,
        rows,
        summary: {
          source: files.map((file) => file.name).join(', '),
          fileCount: files.length,
          rowCount: rows.length,
          locales: qualifiers,
          qualifiers,
          sheets: sheetSummaries
        }
      }),
      headers: adminHeaders({ json: true }),
      method: 'POST'
    });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(body.error ?? `String Resource import failed (${response.status})`);
    }

    elements.adminStringResourceFileInput.value = '';
    setAdminImportStatus(`String Resource import complete: ${body.insertedCount ?? 0} rows.`, 'stringResource');
  } catch (error) {
    setAdminImportStatus(error instanceof Error ? error.message : String(error), 'stringResource');
  } finally {
    state.admin.isLoading = false;
    renderAdminDashboard();
  }
}

async function loadAdminDatasets(tool = state.adminDb.activeTool) {
  const normalizedTool = normalizeAdminTool(tool);
  const response = normalizedTool === 'json'
    ? await fetch('/api/admin/datasets?tool=json', {
      headers: adminHeaders(),
      method: 'GET'
    })
    : await fetch(`/api/admin/datasets?tool=${encodeURIComponent(adminDatasetToolType(normalizedTool))}`, {
      headers: adminHeaders(),
      method: 'GET'
    });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(body.error ?? `Dataset 조회 실패 (${response.status})`);
  }

  const datasets = Array.isArray(body.datasets) ? body.datasets : [];
  state.adminDb.datasets = datasets;
  state.adminDb.selectedDatasetIds[normalizedTool] = resolveActiveAdminDatasetId(
    datasets,
    state.adminDb.selectedDatasetIds[normalizedTool]
  );
  if (normalizedTool === 'json') {
    state.admin.datasets = datasets;
    state.admin.selectedDatasetId = state.adminDb.selectedDatasetIds.json;
  }
}

async function loadAdminStatus() {
  const response = await fetch('/api/admin/json-records/status', {
    headers: adminHeaders(),
    method: 'GET'
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(body.error ?? `상태 조회 실패 (${response.status})`);
  }

  state.admin.status = body.status ?? null;
  state.admin.recentBatches = state.admin.status?.recentBatches ?? [];
}

async function loadAdminRecords() {
  const url = new URL('/api/json-records', window.location.origin);
  url.searchParams.set('limit', '100');
  if (state.admin.query.trim()) {
    url.searchParams.set('q', state.admin.query.trim());
  }

  const response = await fetch(url.href);
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(body.error ?? `JSON 목록 조회 실패 (${response.status})`);
  }

  state.admin.records = body.records ?? [];
  renderAdminDashboard();
}

async function deleteAdminRecord(id) {
  if (!adminKey()) {
    setAdminStatus('관리자 키를 입력하세요.');
    return;
  }

  state.admin.isLoading = true;
  renderAdminDashboard();

  try {
    const response = await fetch(`/api/admin/json-records/${encodeURIComponent(id)}`, {
      headers: adminHeaders(),
      method: 'DELETE'
    });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(body.error ?? `삭제 실패 (${response.status})`);
    }

    setAdminStatus(`삭제 완료: ${body.deletedCount ?? 0}개`);
    await refreshAdminDashboard();
  } catch (error) {
    setAdminStatus(error instanceof Error ? error.message : String(error));
  } finally {
    state.admin.isLoading = false;
    renderAdminDashboard();
  }
}

async function deleteAdminBatch(id) {
  if (!adminKey()) {
    setAdminStatus('관리자 키를 입력하세요.');
    return;
  }

  state.admin.isLoading = true;
  renderAdminDashboard();

  try {
    const response = await fetch(`/api/admin/json-batches/${encodeURIComponent(id)}`, {
      headers: adminHeaders(),
      method: 'DELETE'
    });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(body.error ?? `배치 삭제 실패 (${response.status})`);
    }

    setAdminStatus(`배치 삭제 완료: ${body.deletedCount ?? 0}개`);
    await refreshAdminDashboard();
  } catch (error) {
    setAdminStatus(error instanceof Error ? error.message : String(error));
  } finally {
    state.admin.isLoading = false;
    renderAdminDashboard();
  }
}

function renderAdminDashboard() {
  const status = state.admin.status ?? {};
  const recordCount = Number(status.recordCount ?? 0);
  const batchCount = Number(status.batchCount ?? 0);

  elements.adminSummary.textContent = state.admin.isLoading
    ? 'JSON DB 작업을 처리하는 중입니다.'
    : `Records ${recordCount.toLocaleString()}개, batches ${batchCount.toLocaleString()}개`;
  elements.adminRecordCount.textContent = recordCount.toLocaleString();
  elements.adminBatchCount.textContent = batchCount.toLocaleString();
  elements.adminRefreshButton.disabled = state.admin.isLoading;
  renderAdminDatasetOptions();
  renderAdminDatasetList();
  renderAdminUploadState();
  renderAdminRecords();
  renderAdminBatches();
}

function renderAdminUploadState() {
  const fileCount = state.admin.selectedFiles.length;
  elements.adminSelectedFileCount.textContent = fileCount.toLocaleString();
  renderAdminToolTabs();
  elements.adminDatasetSelect.value = state.admin.selectedDatasetId;
  elements.adminDatasetSelect.disabled = state.admin.isLoading || !adminKey() || state.admin.datasets.length === 0;
  elements.adminCountryRegionInput.disabled = state.admin.isLoading;
  elements.adminCreateDatasetButton.disabled = state.admin.isLoading || !adminKey();
  elements.adminDatasetNameInput.disabled = state.admin.isLoading;
  elements.adminDatasetDescriptionInput.disabled = state.admin.isLoading;
  elements.adminMappingUploadButton.disabled = state.admin.isLoading
    || !adminKey()
    || state.adminDb.activeTool !== 'mapping'
    || !adminDbDatasetId()
    || !elements.adminMappingFileInput.files?.[0];
  elements.adminStringResourceUploadButton.disabled = state.admin.isLoading
    || !adminKey()
    || state.adminDb.activeTool !== 'stringResource'
    || !adminDbDatasetId()
    || (elements.adminStringResourceFileInput.files?.length ?? 0) === 0;
  elements.adminImportButton.disabled = state.admin.isLoading
    || !adminKey()
    || fileCount === 0
    || !adminLanguage()
    || !adminDatasetId()
    || !adminCountryRegion();
  if (fileCount > 0) {
    elements.adminImportStatus.textContent = `선택된 파일 ${fileCount.toLocaleString()}개`;
  }
}

function renderAdminToolTabs() {
  const tool = state.adminDb.activeTool;
  const tabEntries = [
    ['json', elements.adminJsonTab, elements.adminJsonUploadPanel],
    ['mapping', elements.adminMappingTab, elements.adminMappingUploadPanel],
    ['stringResource', elements.adminStringResourceTab, elements.adminStringResourceUploadPanel]
  ];

  for (const [entryTool, tab, panel] of tabEntries) {
    const isActive = entryTool === tool;
    tab.classList.toggle('is-active', isActive);
    tab.setAttribute('aria-selected', String(isActive));
    panel.hidden = !isActive;
  }
}

function renderAdminDatasetOptions() {
  const fragment = document.createDocumentFragment();
  if (state.admin.datasets.length === 0) {
    const option = document.createElement('option');
    option.value = '';
    option.textContent = 'Dataset 없음';
    fragment.append(option);
  } else if (!resolveActiveAdminDatasetId(state.admin.datasets, state.admin.selectedDatasetId)) {
    const option = document.createElement('option');
    option.value = '';
    option.textContent = 'Active dataset 없음';
    fragment.append(option);
  }
  for (const dataset of state.admin.datasets) {
    const option = document.createElement('option');
    option.value = dataset.id;
    option.disabled = !dataset.isActive;
    option.textContent = dataset.isActive ? `${dataset.name} (active)` : `${dataset.name} (inactive)`;
    fragment.append(option);
  }
  elements.adminDatasetSelect.replaceChildren(fragment);
}

function renderAdminDatasetList() {
  const fragment = document.createDocumentFragment();
  const datasets = state.adminDb.activeTool === 'json' ? state.admin.datasets : state.adminDb.datasets;
  const selectedDatasetId = adminDbDatasetId();

  if (datasets.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'empty-state compact-empty';
    empty.textContent = adminKey() ? 'No datasets for this tool.' : 'Load datasets after entering the admin key.';
    fragment.append(empty);
  }

  for (const dataset of datasets) {
    const row = document.createElement('article');
    row.className = 'admin-dataset-row';
    row.classList.toggle('is-selected', String(dataset.id) === selectedDatasetId);
    row.classList.toggle('is-active', Boolean(dataset.isActive));

    const text = document.createElement('div');
    const title = document.createElement('strong');
    title.textContent = dataset.name || 'Untitled dataset';
    const meta = document.createElement('span');
    meta.className = 'item-meta';
    meta.textContent = [
      dataset.isActive ? 'active' : 'inactive',
      String(dataset.description ?? '').trim()
    ].filter(Boolean).join(' | ');
    text.append(title, meta);

    const action = document.createElement('button');
    action.className = 'ghost-button';
    action.type = 'button';
    action.textContent = dataset.isActive ? 'Selected' : 'Activate';
    action.disabled = state.admin.isLoading || !adminKey() || dataset.isActive;
    action.addEventListener('click', () => {
      void setAdminDatasetActive(dataset.id);
    });

    row.append(text, action);
    fragment.append(row);
  }

  elements.adminDatasetList.replaceChildren(fragment);
}

function renderAdminRecords() {
  const fragment = document.createDocumentFragment();

  if (state.admin.records.length === 0) {
    const row = document.createElement('tr');
    const cell = document.createElement('td');
    cell.colSpan = 6;
    cell.textContent = '표시할 JSON이 없습니다.';
    row.append(cell);
    fragment.append(row);
  }

  for (const record of state.admin.records) {
    const row = document.createElement('tr');
    appendAdminCell(row, record.sourceFilename || '-');
    appendAdminCell(row, record.recognitionText || '-');
    appendAdminCell(row, record.language || '-');
    appendAdminCell(row, record.contentType || '-');
    appendAdminCell(row, record.tableVersion || '-');

    const actionCell = document.createElement('td');
    const deleteButton = document.createElement('button');
    deleteButton.className = 'ghost-button danger-action';
    deleteButton.type = 'button';
    deleteButton.textContent = '삭제';
    deleteButton.disabled = state.admin.isLoading;
    deleteButton.addEventListener('click', () => {
      void deleteAdminRecord(record.id);
    });
    actionCell.append(deleteButton);
    row.append(actionCell);
    fragment.append(row);
  }

  elements.adminRecordsTableBody.replaceChildren(fragment);
}

function renderAdminBatches() {
  const fragment = document.createDocumentFragment();

  if (state.admin.recentBatches.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'empty-state compact-empty';
    empty.textContent = '불러온 배치가 없습니다.';
    fragment.append(empty);
  }

  for (const batch of state.admin.recentBatches) {
    const row = document.createElement('article');
    row.className = 'admin-batch-row';

    const text = document.createElement('div');
    const title = document.createElement('strong');
    title.textContent = batch.name || '이름 없는 배치';
    const meta = document.createElement('span');
    meta.className = 'item-meta';
    meta.textContent = `${Number(batch.recordCount ?? 0).toLocaleString()} records | ${formatAdminDate(batch.createdAt)}`;
    text.append(title, meta);

    const deleteButton = document.createElement('button');
    deleteButton.className = 'ghost-button danger-action';
    deleteButton.type = 'button';
    deleteButton.textContent = '배치 삭제';
    deleteButton.disabled = state.admin.isLoading;
    deleteButton.addEventListener('click', () => {
      void deleteAdminBatch(batch.id);
    });

    row.append(text, deleteButton);
    fragment.append(row);
  }

  elements.adminRecentBatches.replaceChildren(fragment);
}

function appendAdminCell(row, value) {
  const cell = document.createElement('td');
  cell.textContent = String(value ?? '').trim() || '-';
  row.append(cell);
}

function renderAdminLanguageOptions() {
  const fragment = document.createDocumentFragment();
  for (const language of state.admin.languageOptions) {
    const option = document.createElement('option');
    option.value = language;
    fragment.append(option);
  }
  elements.adminLanguageOptions.replaceChildren(fragment);
}

function registerAdminLanguageOption() {
  const language = adminLanguage();
  if (!language) {
    setAdminImportStatus('Language 값을 입력하세요.');
    return;
  }
  rememberAdminLanguageOption(language);
  setAdminImportStatus(`${language} language 값을 등록했습니다.`);
  renderAdminUploadState();
}

function rememberAdminLanguageOption(language) {
  const normalized = normalizeAdminLanguage(language);
  if (!normalized) {
    return;
  }
  if (!state.admin.languageOptions.includes(normalized)) {
    state.admin.languageOptions = [...state.admin.languageOptions, normalized].sort();
    saveAdminLanguageOptions();
    renderAdminLanguageOptions();
  }
  elements.adminLanguageInput.value = normalized;
}

function loadAdminLanguageOptions() {
  try {
    const stored = JSON.parse(localStorage.getItem(ADMIN_LANGUAGE_OPTIONS_STORAGE_KEY) ?? '[]');
    return uniqueAdminLanguageOptions([
      ...DEFAULT_ADMIN_LANGUAGE_OPTIONS,
      ...(Array.isArray(stored) ? stored : [])
    ]);
  } catch {
    return [...DEFAULT_ADMIN_LANGUAGE_OPTIONS];
  }
}

function saveAdminLanguageOptions() {
  try {
    localStorage.setItem(ADMIN_LANGUAGE_OPTIONS_STORAGE_KEY, JSON.stringify(state.admin.languageOptions));
  } catch {
    // Ignore storage failures; the current upload can still use the typed language value.
  }
}

function uniqueAdminLanguageOptions(values) {
  return [...new Set(values.map(normalizeAdminLanguage).filter(Boolean))].sort();
}

function normalizeAdminLanguage(value) {
  return String(value ?? '').trim().slice(0, 64);
}

function normalizeAdminTool(value) {
  const tool = String(value ?? '').trim();
  return ['json', 'mapping', 'stringResource'].includes(tool) ? tool : 'json';
}

function adminDatasetToolType(tool = state.adminDb.activeTool) {
  return ADMIN_DATASET_TOOL_TYPES[normalizeAdminTool(tool)];
}

function adminDbDatasetId(tool = state.adminDb.activeTool) {
  const normalizedTool = normalizeAdminTool(tool);
  const datasets = normalizedTool === 'json' ? state.admin.datasets : state.adminDb.datasets;
  return resolveActiveAdminDatasetId(
    datasets,
    normalizedTool === 'json'
      ? state.admin.selectedDatasetId || state.adminDb.selectedDatasetIds.json
      : state.adminDb.selectedDatasetIds[normalizedTool]
  );
}

function adminKey() {
  return elements.adminKeyInput.value.trim();
}

function adminLanguage() {
  return normalizeAdminLanguage(elements.adminLanguageInput.value);
}

function adminDatasetId() {
  return resolveActiveAdminDatasetId(
    state.admin.datasets,
    state.admin.selectedDatasetId || elements.adminDatasetSelect.value
  );
}

function adminCountryRegion() {
  return String(elements.adminCountryRegionInput.value ?? '').trim();
}

function adminHeaders({ json = false } = {}) {
  const headers = {
    'x-admin-key': adminKey()
  };
  if (json) {
    headers['Content-Type'] = 'application/json';
  }
  return headers;
}

function setAdminStatus(message) {
  elements.adminStatus.textContent = message;
}

function setAdminImportStatus(message, tool = state.adminDb.activeTool) {
  adminImportStatusElement(tool).textContent = message;
}

function adminImportStatusElement(tool = state.adminDb.activeTool) {
  const normalizedTool = normalizeAdminTool(tool);
  if (normalizedTool === 'mapping') {
    return elements.adminMappingImportStatus;
  }
  if (normalizedTool === 'stringResource') {
    return elements.adminStringResourceImportStatus;
  }
  return elements.adminImportStatus;
}

function formatAdminDate(value) {
  if (!value) {
    return '-';
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return String(value);
  }
  return date.toLocaleString();
}

async function registerStringResourceFiles(fileList) {
  const files = Array.from(fileList ?? []);
  if (files.length === 0) {
    setStringResourceUploadStatus('\uC120\uD0DD\uB41C \uC5D1\uC140 \uD30C\uC77C\uC774 \uC5C6\uC2B5\uB2C8\uB2E4.');
    return;
  }

  let addedCount = 0;
  let errorCount = 0;

  setStringResourceUploadControlsDisabled(true);
  setStringResourceUploadProgress({
    completed: 0,
    total: files.length,
    fileName: files[0]?.name ?? '',
    phase: '\uB300\uAE30 \uC911'
  });
  await yieldToBrowser();

  try {
    for (const file of files) {
      setStringResourceUploadProgress({
        completed: addedCount + errorCount,
        total: files.length,
        fileName: file.name,
        phase: '\uBD84\uC11D \uC911'
      });
      await yieldToBrowser();

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

        addedCount += 1;
      } catch (error) {
        errorCount += 1;
        state.stringResource.errors.push(`${file.name}: ${error instanceof Error ? error.message : String(error)}`);
      }

      setStringResourceUploadProgress({
        completed: addedCount + errorCount,
        total: files.length,
        fileName: file.name,
        phase: '\uCC98\uB9AC \uC644\uB8CC'
      });
      await yieldToBrowser();
    }
  } finally {
    state.stringResource.rows = state.stringResource.files.flatMap((file) => file.rows);
    setStringResourceUploadStatus(`${addedCount}\uAC1C \uD30C\uC77C \uB4F1\uB85D, \uC624\uB958 ${errorCount}\uAC1C`);
    setStringResourceUploadControlsDisabled(false);
    finishStringResourceUploadProgress();
    renderStringResource();
  }
}
function renderStringResource() {
  elements.stringResourceCount.textContent = `업로드된 엑셀 ${state.stringResource.files.length.toLocaleString()}개`;
  elements.clearStringResourceButton.disabled = state.stringResource.isUploading
    || (state.stringResource.files.length === 0 && state.stringResource.errors.length === 0);
  renderStringResourceSheets();
  renderStringResourceResults();
  if (!elements.stringResourceDetailModal.hidden) {
    const rowExists = state.stringResource.rows.some((item) => item.id === state.stringResource.modalRowId);
    if (rowExists) {
      renderStringResourceDetail();
    } else {
      closeStringResourceDetail();
    }
  }
}

function renderStringResourceSheets() {
  elements.stringResourceSheetList.replaceChildren();

  if (state.stringResource.files.length === 0) {
    elements.stringResourceSheetList.innerHTML = '<div class="empty-state compact-empty">엑셀을 업로드하면 시트 목록이 표시됩니다.</div>';
    return;
  }

  const tree = document.createElement('div');
  tree.className = 'string-resource-sheet-tree';

  for (const file of state.stringResource.files) {
    tree.append(renderStringResourceFileNode(file));
  }

  elements.stringResourceSheetList.append(tree);
}

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
  toggleButton.setAttribute('aria-label', isExpanded ? 'Collapse file sheets' : 'Expand file sheets');
  toggleButton.addEventListener('click', () => toggleStringResourceFileNode(file.fileId));

  const checkbox = document.createElement('input');
  checkbox.type = 'checkbox';
  checkbox.checked = totalCount > 0 && selectedCount === totalCount;
  checkbox.indeterminate = selectedCount > 0 && selectedCount < totalCount;
  checkbox.setAttribute('aria-label', `${file.fileName} all sheets`);
  checkbox.addEventListener('change', () => toggleStringResourceFileSheets(file, checkbox.checked));

  const titleButton = document.createElement('button');
  titleButton.className = 'string-resource-file-title';
  titleButton.type = 'button';
  titleButton.textContent = file.fileName;
  titleButton.title = file.fileName;
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

function renderStringResourceSheetNode(file, summary) {
  const sheetId = stringResourceSheetId(file.fileId, summary.name);
  const label = document.createElement('label');
  label.className = 'string-resource-sheet-row';

  const checkbox = document.createElement('input');
  checkbox.type = 'checkbox';
  checkbox.checked = state.stringResource.selectedSheetIds.has(sheetId);
  checkbox.addEventListener('change', () => toggleStringResourceSheet(sheetId));

  const detectionLabel = summary.isCandidate ? '자동 감지' : '수동 선택 가능';
  const text = document.createElement('span');
  text.textContent = `${summary.name} · ${summary.rowCount.toLocaleString()} rows · ${detectionLabel}`;

  label.append(checkbox, text);
  return label;
}

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
  syncStringResourceVisibleQualifiers(availableQualifiers);
  const visibleQualifiers = state.stringResource.visibleQualifiers.filter((qualifier) => availableQualifiers.includes(qualifier));
  const renderedRows = filteredRows.slice(0, STRING_RESOURCE_RESULT_RENDER_LIMIT);

  renderStringResourceLanguageControls(availableQualifiers);
  renderStringResourceTableHeader(visibleQualifiers);
  elements.stringResourceTableBody.replaceChildren();
  elements.stringResourceTableShell.hidden = true;
  elements.stringResourceEmptyState.hidden = false;
  elements.stringResourceResultCount.textContent = stringResourceResultCountText(filteredRows.length, renderedRows.length);

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
  for (const row of renderedRows) {
    fragment.append(renderStringResourceTableRow(row, visibleQualifiers));
  }

  elements.stringResourceEmptyState.hidden = true;
  elements.stringResourceTableShell.hidden = false;
  elements.stringResourceTableBody.append(fragment);
}

function syncStringResourceVisibleQualifiers(availableQualifiers) {
  const nextState = resolveStringResourceVisibleQualifierState({
    availableQualifiers,
    hiddenQualifiers: state.stringResource.hiddenQualifiers,
    visibleQualifiers: state.stringResource.visibleQualifiers
  });
  state.stringResource.hiddenQualifiers = new Set(nextState.hiddenQualifiers);
  state.stringResource.visibleQualifiers = nextState.visibleQualifiers;
}

function stringResourceResultCountText(totalCount, renderedCount) {
  const totalText = `검색 결과 ${totalCount.toLocaleString()}개`;
  return totalCount > renderedCount
    ? `${totalText} · 먼저 ${renderedCount.toLocaleString()}개 표시`
    : totalText;
}

function renderStringResourceTableHeader(qualifiers) {
  const headerRow = document.createElement('tr');
  for (const label of ['Resource ID', ...qualifiers]) {
    const th = document.createElement('th');
    th.scope = 'col';
    th.textContent = label;
    headerRow.append(th);
  }
  elements.stringResourceTableHead.replaceChildren(headerRow);
}

function renderStringResourceTableRow(row, qualifiers) {
  const tr = document.createElement('tr');
  appendStringResourceIdCell(tr, row);

  for (const qualifier of qualifiers) {
    appendStringResourceCell(tr, row.languages[qualifier] ?? '', 'string-resource-language-cell');
  }

  return tr;
}

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
  const nextState = toggleStringResourceVisibleQualifier({
    hiddenQualifiers: state.stringResource.hiddenQualifiers,
    visibleQualifiers: state.stringResource.visibleQualifiers
  }, qualifier);
  state.stringResource.hiddenQualifiers = new Set(nextState.hiddenQualifiers);
  state.stringResource.visibleQualifiers = nextState.visibleQualifiers;
  renderStringResource();
}

function openStringResourceDetail(rowId) {
  stringResourceDetailFocusReturnTarget = document.activeElement instanceof HTMLElement
    ? document.activeElement
    : null;
  state.stringResource.modalRowId = rowId;
  renderStringResourceDetail();
  elements.stringResourceDetailModal.hidden = false;
  elements.closeStringResourceDetailButton.focus();
}

function closeStringResourceDetail() {
  const fallbackTarget = elements.stringResourceSearchInput;
  state.stringResource.modalRowId = '';
  elements.stringResourceDetailModal.hidden = true;
  restoreFocus(stringResourceDetailFocusReturnTarget, fallbackTarget);
  stringResourceDetailFocusReturnTarget = null;
}

function renderStringResourceDetail() {
  const row = state.stringResource.rows.find((item) => item.id === state.stringResource.modalRowId);
  elements.stringResourceDetailBody.replaceChildren();

  if (!row) {
    elements.stringResourceDetailTitle.textContent = 'String Resource 상세';
    elements.stringResourceDetailMeta.textContent = '선택된 리소스가 없습니다.';
    return;
  }

  elements.stringResourceDetailTitle.textContent = row.resourceId;
  elements.stringResourceDetailMeta.textContent = `${row.fileName} · ${row.sheetName} · row ${row.rowNumber}`;

  const grid = document.createElement('div');
  grid.className = 'string-resource-detail-grid';

  const languageSection = document.createElement('section');
  languageSection.innerHTML = '<h3>언어별 문자열</h3>';
  for (const qualifier of resolveStringResourceQualifiers([row])) {
    const value = row.languages[qualifier] ?? '';
    if (!value) {
      continue;
    }
    const valueRow = document.createElement('div');
    valueRow.className = 'string-resource-value-row';
    const key = document.createElement('strong');
    key.textContent = qualifier;
    const text = document.createElement('span');
    text.textContent = value;
    const copy = document.createElement('button');
    copy.className = 'ghost-button';
    copy.type = 'button';
    copy.textContent = 'Copy';
    copy.addEventListener('click', () => copyStringResourceValue(value));
    valueRow.append(key, text, copy);
    languageSection.append(valueRow);
  }

  const metaSection = document.createElement('section');
  metaSection.innerHTML = '<h3>출처와 메타</h3>';
  metaSection.append(
    renderStringResourceKeyValueList({
      File: row.fileName,
      Sheet: row.sheetName,
      Row: row.rowNumber,
      ...row.idFields,
      ...row.metadata
    })
  );

  const rawSection = document.createElement('section');
  rawSection.innerHTML = '<h3>원본 행</h3>';
  rawSection.append(renderStringResourceKeyValueList(row.originalValues));

  grid.append(languageSection, metaSection, rawSection);
  elements.stringResourceDetailBody.append(grid);
}

function renderStringResourceKeyValueList(values) {
  const dl = document.createElement('dl');
  dl.className = 'string-resource-key-values';
  for (const [key, value] of Object.entries(values ?? {})) {
    if (String(value ?? '').trim() === '') {
      continue;
    }
    const dt = document.createElement('dt');
    dt.textContent = key;
    const dd = document.createElement('dd');
    dd.textContent = String(value);
    dl.append(dt, dd);
  }
  return dl;
}

async function copyStringResourceValue(value) {
  try {
    await navigator.clipboard.writeText(String(value ?? ''));
  } catch {
    window.prompt('복사할 값을 선택하세요.', String(value ?? ''));
  }
}

function setStringResourceUploadStatus(message) {
  elements.stringResourceUploadStatus.textContent = message;
}

function setStringResourceUploadControlsDisabled(isDisabled) {
  state.stringResource.isUploading = isDisabled;
  elements.stringResourceFileInput.disabled = isDisabled;
  elements.stringResourceLanguageButton.disabled = isDisabled;
  elements.stringResourceFileInput.closest('.upload-strip')?.classList.toggle('is-uploading', isDisabled);
  elements.clearStringResourceButton.disabled = isDisabled
    || (state.stringResource.files.length === 0 && state.stringResource.errors.length === 0);
}

function setStringResourceUploadProgress({ completed, total, fileName, phase }) {
  const safeTotal = Math.max(total, 1);
  const percent = Math.min(100, Math.max(0, Math.round((completed / safeTotal) * 100)));
  const progressText = `${Math.min(completed, total).toLocaleString()}/${total.toLocaleString()} ${phase} - ${fileName}`;

  elements.stringResourceUploadProgress.hidden = false;
  elements.stringResourceUploadProgressFill.style.width = `${percent}%`;
  elements.stringResourceUploadProgressBar.setAttribute('aria-valuenow', String(percent));
  elements.stringResourceUploadProgressText.textContent = progressText;

  elements.stringResourceUploadOverlay.hidden = false;
  elements.stringResourceUploadOverlayProgress.style.setProperty('--string-resource-upload-progress', `${percent}%`);
  elements.stringResourceUploadOverlayProgress.setAttribute('aria-valuenow', String(percent));
  elements.stringResourceUploadOverlayPercent.textContent = `${percent}%`;
  elements.stringResourceUploadOverlayTitle.textContent = phase;
  elements.stringResourceUploadOverlayDetail.textContent = progressText;
}

function finishStringResourceUploadProgress() {
  elements.stringResourceUploadProgress.hidden = true;
  elements.stringResourceUploadProgressFill.style.width = '0%';
  elements.stringResourceUploadProgressBar.setAttribute('aria-valuenow', '0');
  elements.stringResourceUploadProgressText.textContent = '0/0';

  elements.stringResourceUploadOverlay.hidden = true;
  elements.stringResourceUploadOverlayProgress.style.setProperty('--string-resource-upload-progress', '0%');
  elements.stringResourceUploadOverlayProgress.setAttribute('aria-valuenow', '0');
  elements.stringResourceUploadOverlayPercent.textContent = '0%';
  elements.stringResourceUploadOverlayTitle.textContent = '\uC5D1\uC140 \uBD84\uC11D \uC911';
  elements.stringResourceUploadOverlayDetail.textContent = '0/0';
}

function yieldToBrowser() {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

function nextStringResourceFileId() {
  const fileId = `string-resource-file-${state.stringResource.nextFileId}`;
  state.stringResource.nextFileId += 1;
  return fileId;
}

function stringResourceSheetId(fileId, sheetName) {
  return `${fileId}::${sheetName}`;
}

async function fetchDatasets(tool) {
  const response = await fetch(DATASET_API_URLS[tool] ?? `/api/datasets?tool=${encodeURIComponent(tool)}`);
  if (!response.ok) {
    throw new Error(`Dataset request failed: ${response.status}`);
  }
  const body = await response.json();
  return Array.isArray(body.datasets) ? body.datasets : [];
}

function renderDatasetOptions(selectElement, datasets, fallbackLabel) {
  const currentValue = selectElement.value;
  const fragment = document.createDocumentFragment();
  const fallback = document.createElement('option');
  fallback.value = '';
  fallback.textContent = fallbackLabel;
  fragment.append(fallback);

  for (const dataset of datasets) {
    const option = document.createElement('option');
    option.value = String(dataset.id ?? '');
    option.textContent = dataset.recordCount == null
      ? String(dataset.name ?? dataset.id ?? 'Dataset')
      : `${dataset.name ?? dataset.id ?? 'Dataset'} (${Number(dataset.recordCount).toLocaleString()})`;
    option.disabled = dataset.isActive === false;
    fragment.append(option);
  }

  selectElement.replaceChildren(fragment);
  const values = new Set(['', ...datasets.map((dataset) => String(dataset.id ?? ''))]);
  selectElement.value = values.has(currentValue) ? currentValue : '';
}

async function loadExplorerDatasets() {
  try {
    state.explorer.datasets = await fetchDatasets('json');
    renderDatasetOptions(elements.explorerDatasetSelect, state.explorer.datasets, 'Local files');
    if (!state.explorer.selectedDatasetId) {
      const activeDataset = state.explorer.datasets.find((dataset) => dataset.isActive !== false) ?? state.explorer.datasets[0];
      state.explorer.selectedDatasetId = activeDataset?.id ? String(activeDataset.id) : '';
      elements.explorerDatasetSelect.value = state.explorer.selectedDatasetId;
    }
    await loadExplorerCountries();
    await searchDbExplorerRecords();
  } catch (error) {
    state.explorer.selectedDatasetId = '';
    renderDatasetOptions(elements.explorerDatasetSelect, [], 'Local files');
    renderExplorerCountries([]);
    setExplorerUploadStatus(error instanceof Error ? `DB unavailable: ${error.message}` : 'DB unavailable');
    renderExplorer();
  }
}

async function loadExplorerCountries() {
  if (!state.explorer.selectedDatasetId) {
    renderExplorerCountries([]);
    return;
  }

  const params = new URLSearchParams({ datasetId: state.explorer.selectedDatasetId });
  const response = await fetch(`/api/json-countries?${params.toString()}`);
  if (!response.ok) {
    throw new Error(`JSON country request failed: ${response.status}`);
  }
  const body = await response.json();
  renderExplorerCountries(Array.isArray(body.countries) ? body.countries : []);
}

function renderExplorerCountries(countries) {
  state.explorer.countries = countries;
  const currentValue = state.explorer.selectedCountry;
  const fragment = document.createDocumentFragment();
  const allOption = document.createElement('option');
  allOption.value = '';
  allOption.textContent = 'All countries';
  fragment.append(allOption);

  for (const country of countries) {
    const option = document.createElement('option');
    option.value = String(country.countryRegion ?? '');
    option.textContent = country.count == null
      ? String(country.countryRegion ?? 'Unknown')
      : `${country.countryRegion ?? 'Unknown'} (${Number(country.count).toLocaleString()})`;
    fragment.append(option);
  }

  elements.explorerCountrySelect.replaceChildren(fragment);
  const values = new Set(['', ...countries.map((country) => String(country.countryRegion ?? ''))]);
  state.explorer.selectedCountry = values.has(currentValue) ? currentValue : '';
  elements.explorerCountrySelect.value = state.explorer.selectedCountry;
  elements.explorerCountrySelect.disabled = !state.explorer.selectedDatasetId || countries.length === 0;
}

function clearDbExplorerRows() {
  state.explorer.items = state.explorer.items.filter((item) => item.sourceType !== 'db');
  state.explorer.errors = [];
  state.explorer.isDbLoaded = false;
  state.explorer.isDbLoading = false;
  setExplorerUploadStatus('JSON 파일을 선택하거나 폴더를 선택하세요.');
}

async function searchDbExplorerRecords() {
  if (!state.explorer.selectedDatasetId) {
    renderExplorer();
    return;
  }

  state.explorer.isDbLoading = true;
  state.explorer.errors = [];
  renderExplorer();

  try {
    const params = new URLSearchParams({
      datasetId: state.explorer.selectedDatasetId,
      limit: '200'
    });
    if (state.explorer.selectedCountry) {
      params.set('country', state.explorer.selectedCountry);
    }
    if (state.explorer.query.trim()) {
      params.set('q', state.explorer.query.trim());
    }
    const response = await fetch(`/api/json-records?${params.toString()}`);
    if (!response.ok) {
      throw new Error(`JSON record request failed: ${response.status}`);
    }
    const body = await response.json();
    state.explorer.items = (Array.isArray(body.records) ? body.records : []).map(createDbExplorerItem);
    state.explorer.isDbLoaded = true;
    setExplorerUploadStatus(`DB records loaded: ${(body.total ?? state.explorer.items.length).toLocaleString()}`);
  } catch (error) {
    state.explorer.items = [];
    state.explorer.errors = [error instanceof Error ? error.message : String(error)];
    setExplorerUploadStatus(error instanceof Error ? error.message : String(error));
  } finally {
    state.explorer.isDbLoading = false;
    renderExplorer();
  }
}

function createDbExplorerItem(record) {
  const value = {
    id: record.id,
    sourceFilename: record.sourceFilename,
    recognitionText: record.recognitionText,
    language: record.language,
    contentType: record.contentType,
    tableVersion: record.tableVersion,
    slotSummary: record.slotSummary,
    datasetId: record.datasetId,
    countryRegion: record.countryRegion,
    valueKind: record.valueKind,
    createdAt: record.createdAt
  };
  return {
    ...value,
    id: `db-${record.id}`,
    sourceType: 'db',
    value,
    valueKind: record.valueKind ?? 'json'
  };
}

async function loadMappingDatasets() {
  state.mapping.datasets = await fetchDatasets('mapping_table');
  renderDatasetOptions(elements.mappingDatasetSelect, state.mapping.datasets, 'Static fallback');
  if (!elements.mappingDatasetSelect.value) {
    const activeDataset = state.mapping.datasets.find((dataset) => dataset.isActive !== false) ?? state.mapping.datasets[0];
    elements.mappingDatasetSelect.value = activeDataset?.id ? String(activeDataset.id) : '';
  }
  return elements.mappingDatasetSelect.value;
}

async function loadMappingDatasetRows(datasetId = elements.mappingDatasetSelect.value) {
  if (!datasetId) {
    return false;
  }
  state.mapping.isLoading = true;
  state.mapping.error = '';
  renderMappingWorkflow();

  try {
    const params = new URLSearchParams({ datasetId, limit: '500' });
    const response = await fetch(`/api/mapping-rows?${params.toString()}`);
    if (!response.ok) {
      throw new Error(`Mapping row request failed: ${response.status}`);
    }
    const body = await response.json();
    state.mapping.rows = Array.isArray(body.rows) ? body.rows : [];
    state.mapping.source = state.mapping.datasets.find((dataset) => String(dataset.id) === String(datasetId))?.name ?? 'DB Mapping dataset';
    state.mapping.isLoaded = true;
    return true;
  } catch (error) {
    state.mapping.error = error instanceof Error ? error.message : String(error);
    return false;
  } finally {
    state.mapping.isLoading = false;
    renderMappingWorkflow();
  }
}

async function loadStringResourceDatasets() {
  try {
    state.stringResource.datasets = await fetchDatasets('string_resource');
    renderDatasetOptions(elements.stringResourceDatasetSelect, state.stringResource.datasets, 'Uploaded files');
    if (!state.stringResource.selectedDatasetId) {
      const activeDataset = state.stringResource.datasets.find((dataset) => dataset.isActive !== false) ?? state.stringResource.datasets[0];
      state.stringResource.selectedDatasetId = activeDataset?.id ? String(activeDataset.id) : '';
      elements.stringResourceDatasetSelect.value = state.stringResource.selectedDatasetId;
    }
    if (state.stringResource.selectedDatasetId) {
      await loadStringResourceDatasetRows(state.stringResource.selectedDatasetId, state.stringResource.query);
    }
  } catch (error) {
    state.stringResource.selectedDatasetId = '';
    renderDatasetOptions(elements.stringResourceDatasetSelect, [], 'Uploaded files');
    setStringResourceUploadStatus(error instanceof Error ? `DB unavailable: ${error.message}` : 'DB unavailable');
  }
}

async function loadStringResourceDatasetRows(datasetId = state.stringResource.selectedDatasetId, query = state.stringResource.query) {
  if (!datasetId) {
    renderStringResource();
    return;
  }

  state.stringResource.selectedDatasetId = datasetId;
  state.stringResource.errors = [];
  setStringResourceUploadStatus('Loading DB string resources.');

  try {
    const params = new URLSearchParams({ datasetId, limit: '500' });
    if (query.trim()) {
      params.set('q', query.trim());
    }
    const response = await fetch(`/api/string-resource-rows?${params.toString()}`);
    if (!response.ok) {
      throw new Error(`String resource row request failed: ${response.status}`);
    }
    const body = await response.json();
    applyStringResourceDbRows(Array.isArray(body.rows) ? body.rows : [], datasetId);
    setStringResourceUploadStatus(`DB string resources loaded: ${(body.total ?? state.stringResource.rows.length).toLocaleString()}`);
  } catch (error) {
    state.stringResource.errors = [error instanceof Error ? error.message : String(error)];
    setStringResourceUploadStatus(error instanceof Error ? error.message : String(error));
  } finally {
    renderStringResource();
  }
}

function applyStringResourceDbRows(rows, datasetId) {
  const fileId = `string-resource-db-${datasetId}`;
  const fileName = state.stringResource.datasets.find((dataset) => String(dataset.id) === String(datasetId))?.name ?? 'DB String Resource dataset';
  const normalizedRows = rows.map((row, index) => ({
    ...row,
    id: row.id ?? `${fileId}-row-${index}`,
    fileId,
    fileName: row.fileName ?? row.sourceFilename ?? fileName,
    rowNumber: row.rowNumber ?? index + 1,
    sheetName: row.sheetName ?? 'DB rows'
  }));
  const summaries = [...new Map(normalizedRows.map((row) => [row.sheetName, row.sheetName])).values()]
    .map((name) => ({
      isCandidate: true,
      name,
      rowCount: normalizedRows.filter((row) => row.sheetName === name).length
    }));

  state.stringResource.files = [{
    fileId,
    fileName,
    rows: normalizedRows,
    sheetSummaries: summaries
  }];
  state.stringResource.rows = normalizedRows;
  state.stringResource.expandedFileIds = new Set([fileId]);
  state.stringResource.selectedSheetIds = new Set(summaries.map((summary) => stringResourceSheetId(fileId, summary.name)));
}

function clearDbStringResourceRows() {
  state.stringResource.files = state.stringResource.files.filter((file) => !String(file.fileId).startsWith('string-resource-db-'));
  state.stringResource.rows = state.stringResource.files.flatMap((file) => file.rows);
  state.stringResource.expandedFileIds = new Set(
    [...state.stringResource.expandedFileIds].filter((fileId) => !String(fileId).startsWith('string-resource-db-'))
  );
  state.stringResource.selectedSheetIds = new Set(
    [...state.stringResource.selectedSheetIds].filter((sheetId) => !String(sheetId).startsWith('string-resource-db-'))
  );
  setStringResourceUploadStatus('다국어 문자열 리소스 엑셀을 선택하세요.');
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
    let datasetId = '';
    try {
      datasetId = await loadMappingDatasets();
    } catch (error) {
      state.mapping.error = error instanceof Error ? error.message : String(error);
    }
    if (datasetId && await loadMappingDatasetRows(datasetId)) {
      return;
    }
    await loadStaticMappingData();
  } catch (error) {
    state.mapping.error = error instanceof Error ? error.message : String(error);
  } finally {
    state.mapping.isLoading = false;
    renderMappingWorkflow();
  }
}

async function loadStaticMappingData() {
  const response = await fetch('./mapping-table-v3.3.19.json');
  if (!response.ok) {
    throw new Error(`Mapping data request failed: ${response.status}`);
  }
  const workbook = await response.json();
  state.mapping.rows = normalizeMappingWorkbook(workbook);
  state.mapping.source = workbook.source ?? 'Mapping table_v3.3.19.xlsx';
  state.mapping.error = '';
  state.mapping.isLoaded = true;
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
  const isDbMode = Boolean(state.explorer.selectedDatasetId);
  const filteredItems = isDbMode
    ? state.explorer.items
    : searchTerms.length > 0
    ? filterExplorerItems(state.explorer.items, state.explorer.query)
    : [];

  elements.explorerCount.textContent = `등록된 JSON ${totalCount}개`;
  elements.explorerFileCount.textContent = `등록된 파일 ${totalCount}개`;
  elements.explorerResultCount.textContent = `검색 결과 ${searchTerms.length > 0 ? filteredItems.length : 0}개`;
  elements.explorerDrawerCount.textContent = `등록된 파일 ${totalCount}개`;
  elements.clearExplorerButton.disabled = totalCount === 0 && errorCount === 0;

  renderExplorerSuggestions();
  renderExplorerTable(filteredItems, searchTerms, isDbMode);
  renderExplorerRegisteredFiles();
  renderExplorerFileDrawer();
  renderExplorerModal();
}

function renderExplorerTable(items, searchTerms, isDbMode = false) {
  elements.explorerTableBody.replaceChildren();
  elements.explorerTableShell.hidden = true;
  elements.explorerEmptyState.hidden = false;

  if (state.explorer.isDbLoading) {
    elements.explorerEmptyState.textContent = 'Loading DB records.';
    return;
  }

  if (state.explorer.items.length === 0) {
    elements.explorerEmptyState.textContent = 'JSON 파일 또는 폴더를 먼저 등록하세요.';
    return;
  }

  if (!isDbMode && searchTerms.length === 0) {
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
  restoreFocus(explorerDrawerFocusReturnTarget, elements.toggleExplorerFilesButton);
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
  restoreFocus(explorerModalFocusReturnTarget, elements.explorerSearchInput);
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

function restoreFocus(savedTarget, fallbackTarget) {
  const focusTarget = savedTarget instanceof HTMLElement && savedTarget.isConnected
    ? savedTarget
    : fallbackTarget;
  focusTarget?.focus();
}

function trapModalFocus(event, modalElement) {
  const focusableElements = getModalFocusableElements(modalElement);

  if (focusableElements.length === 0) {
    event.preventDefault();
    return;
  }

  const firstFocusable = focusableElements[0];
  const lastFocusable = focusableElements.at(-1);
  const activeElement = document.activeElement instanceof HTMLElement
    ? document.activeElement
    : null;

  if (!activeElement || !modalElement.contains(activeElement)) {
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

function getModalFocusableElements(modalElement) {
  const focusableSelector = [
    'a[href]',
    'button:not([disabled])',
    'input:not([disabled])',
    'select:not([disabled])',
    'textarea:not([disabled])',
    '[tabindex]:not([tabindex="-1"])'
  ].join(',');

  return Array.from(modalElement.querySelectorAll(focusableSelector))
    .filter((element) => element instanceof HTMLElement && !element.hidden);
}

function openHelp(steps = helpSteps, controlButton = elements.openHelpButton) {
  activeHelpSteps = steps;
  helpControlButton = controlButton;
  helpFocusReturnTarget = document.activeElement instanceof HTMLElement
    ? document.activeElement
    : controlButton;
  activeHelpStep = 0;
  elements.helpOverlay.hidden = false;
  controlButton.setAttribute('aria-expanded', 'true');
  document.body.classList.add('help-open');
  showHelpStep(activeHelpStep);
  elements.helpCallout.focus();
}

function closeHelp() {
  elements.helpOverlay.hidden = true;
  helpControlButton?.setAttribute('aria-expanded', 'false');
  document.body.classList.remove('help-open');
  elements.helpSpotlight.removeAttribute('style');
  elements.helpCallout.removeAttribute('style');
  helpFocusReturnTarget?.focus();
  activeHelpSteps = helpSteps;
  helpControlButton = null;
  helpFocusReturnTarget = null;
}

function showHelpStep(index) {
  activeHelpStep = Math.min(Math.max(index, 0), activeHelpSteps.length - 1);
  const step = activeHelpSteps[activeHelpStep];

  elements.helpStepTitle.textContent = step.title;
  elements.helpStepBody.textContent = step.body;
  elements.helpStepCount.textContent = `${activeHelpStep + 1} / ${activeHelpSteps.length}`;
  elements.prevHelpButton.disabled = activeHelpStep === 0;
  elements.nextHelpButton.textContent = activeHelpStep === activeHelpSteps.length - 1 ? '종료' : '다음';

  const target = document.querySelector(step.selector);
  target?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  requestAnimationFrame(() => {
    positionHelpOverlay();
  });
}

function positionHelpOverlay() {
  const step = activeHelpSteps[activeHelpStep];
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
