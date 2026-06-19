import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

describe('upload-first UI structure', () => {
  it('starts with a card-based team tool hub before tool-specific screens', async () => {
    const html = await readFile(new URL('../public/index.html', import.meta.url), 'utf8');
    const css = await readFile(new URL('../public/styles.css', import.meta.url), 'utf8');
    const app = await readFile(new URL('../public/app.js', import.meta.url), 'utf8');
    const hubIndex = html.indexOf('id="toolHub"');
    const formatterIndex = html.indexOf('id="formatterApp"');
    const explorerIndex = html.indexOf('id="explorerApp"');
    const mappingIndex = html.indexOf('id="mappingApp"');
    const stringResourceIndex = html.indexOf('id="stringResourceApp"');

    assert.notEqual(hubIndex, -1);
    assert.notEqual(formatterIndex, -1);
    assert.notEqual(explorerIndex, -1);
    assert.notEqual(mappingIndex, -1);
    assert.notEqual(stringResourceIndex, -1);
    assert.ok(hubIndex < formatterIndex);
    assert.ok(hubIndex < mappingIndex);
    assert.ok(hubIndex < stringResourceIndex);
    assert.match(html, /id="formatterApp"[^>]*hidden/);
    assert.match(html, /id="explorerApp"[^>]*hidden/);
    assert.match(html, /id="mappingApp"[^>]*hidden/);
    assert.match(html, /id="stringResourceApp"[^>]*hidden/);
    assert.match(html, /id="openFormatterButton"/);
    assert.match(html, /id="openExplorerButton"/);
    assert.match(html, /id="openMappingButton"/);
    assert.match(html, /id="openStringResourceButton"/);
    assert.match(html, /id="backToHubButton"/);
    assert.match(html, /id="backToHubFromExplorerButton"/);
    assert.match(html, /id="backToHubFromMappingButton"/);
    assert.match(html, /id="backToHubFromStringResourceButton"/);
    assert.match(html, /JSON Formatter/);
    assert.match(html, /JSON Explorer/);
    assert.match(html, /Mapping Table Explorer/);
    assert.match(html, /String Resource Explorer/);
    assert.match(html, /다국어 문자열 리소스 검색/);
    assert.match(html, /recognitionText 중심 탐색/);
    assert.doesNotMatch(html, /JSON to Excel/);
    assert.match(css, /\.tool-grid\s*{/);
    assert.match(css, /\.tool-card\s*{/);
    assert.match(app, /showToolHub/);
    assert.match(app, /showFormatterTool/);
    assert.match(app, /showExplorerTool/);
    assert.match(app, /showMappingTool/);
    assert.match(app, /showStringResourceTool/);
    assert.match(html, /src="\.\/vendor\/xlsx\.full\.min\.js"/);
    assert.doesNotMatch(app, /showExcelTool/);
  });

  it('provides a String Resource Explorer upload and search workspace', async () => {
    const html = await readFile(new URL('../public/index.html', import.meta.url), 'utf8');
    const css = await readFile(new URL('../public/styles.css', import.meta.url), 'utf8');
    const app = await readFile(new URL('../public/app.js', import.meta.url), 'utf8');

    const cssRuleBodiesForSelector = (cssText, selector) => [...cssText.matchAll(/([^{}]+)\{([^{}]*)\}/g)]
      .filter(([, selectorList]) => selectorList
        .split(',')
        .map((part) => part.trim())
        .includes(selector))
      .map(([, , body]) => body);

    for (const id of [
      'stringResourceApp',
      'stringResourceCount',
      'stringResourceFileInput',
      'stringResourceUploadStatus',
      'stringResourceUploadProgress',
      'stringResourceUploadProgressBar',
      'stringResourceUploadProgressFill',
      'stringResourceUploadProgressText',
      'stringResourceUploadOverlay',
      'stringResourceUploadOverlayProgress',
      'stringResourceUploadOverlayPercent',
      'stringResourceUploadOverlayTitle',
      'stringResourceUploadOverlayDetail',
      'stringResourceSheetPanel',
      'stringResourceSheetList',
      'stringResourceSearchInput',
      'stringResourceResultCount',
      'stringResourceEmptyState',
      'stringResourceTableShell',
      'stringResourceTable',
      'stringResourceTableHead',
      'stringResourceTableBody',
      'stringResourceLanguageButton',
      'stringResourceLanguagePanel',
      'stringResourceDetailModal',
      'stringResourceDetailTitle',
      'stringResourceDetailBody',
      'closeStringResourceDetailButton'
    ]) {
      assert.match(html, new RegExp(`id="${id}"`));
    }

    for (const selector of [
      '.string-resource-workspace',
      '.string-resource-toolbar',
      '.string-resource-upload-progress',
      '.string-resource-progress-track',
      '.string-resource-progress-fill',
      '.string-resource-upload-overlay',
      '.string-resource-upload-overlay-card',
      '.string-resource-upload-ring',
      '.string-resource-upload-ring-fill',
      '.string-resource-upload-percent',
      '.string-resource-sheet-panel',
      '.string-resource-results',
      '.string-resource-table-shell',
      '.string-resource-table',
      '.string-resource-detail-modal'
    ]) {
      assert.notEqual(cssRuleBodiesForSelector(css, selector).length, 0, `Expected CSS selector ${selector}`);
    }

    for (const contract of [
      'showStringResourceTool',
      'registerStringResourceFiles',
      'renderStringResource',
      'renderStringResourceSheets',
      'renderStringResourceResults',
      'openStringResourceDetail',
      'closeStringResourceDetail'
    ]) {
      assert.match(app, new RegExp(`\\b${contract}\\b`));
    }

    for (const contract of [
      'toggleStringResourceSheet',
      'toggleStringResourceFileNode',
      'toggleStringResourceFileSheets',
      'selectedStringResourceRows',
      'setStringResourceUploadStatus',
      'setStringResourceUploadProgress',
      'finishStringResourceUploadProgress',
      'setStringResourceUploadControlsDisabled',
      'stringResourceUploadOverlay',
      'stringResourceUploadOverlayProgress',
      'stringResourceUploadOverlayPercent',
      'stringResourceUploadOverlayTitle',
      'stringResourceUploadOverlayDetail',
      'parseStringResourceWorkbookFile'
    ]) {
      assert.match(app, new RegExp(`\\b${contract}\\b`));
    }

    assert.match(app, /--string-resource-upload-progress/);

    for (const contract of [
      'renderStringResourceTableHeader',
      'renderStringResourceTableRow',
      'renderStringResourceFileNode',
      'renderStringResourceSheetNode',
      'renderStringResourceLanguageControls',
      'toggleStringResourceQualifier'
    ]) {
      assert.match(app, new RegExp(`\\b${contract}\\b`));
    }
    for (const contract of [
      'renderStringResourceDetail',
      'copyStringResourceValue',
      'renderStringResourceKeyValueList'
    ]) {
      assert.match(app, new RegExp(`\\b${contract}\\b`));
    }
    assert.match(app, /stringResourceDetailFocusReturnTarget/);
    assert.match(app, /trapModalFocus\(event, elements\.stringResourceDetailModal\)/);
    assert.match(app, /closeStringResourceDetail\(\)/);
    assert.match(app, /restoreFocus\(stringResourceDetailFocusReturnTarget, fallbackTarget\)/);
    assert.match(app, /rowExists[\s\S]*closeStringResourceDetail\(\)/);
    assert.match(css, /\.string-resource-detail-grid\s*{/);
    assert.match(css, /\.string-resource-value-row\s*{/);
    assert.match(css, /\.string-resource-detail-body\s*{/);
    assert.match(css, /\.string-resource-value-row span\s*{/);
    assert.match(css, /\.string-resource-language-cell\s*{/);
    assert.match(css, /\.string-resource-id-cell\s*{/);
    assert.match(app, /const STRING_RESOURCE_RESULT_RENDER_LIMIT = 500/);
    assert.match(app, /syncStringResourceVisibleQualifiers/);
    assert.match(app, /resolveStringResourceVisibleQualifierState/);
    assert.match(app, /toggleStringResourceVisibleQualifier/);
    assert.match(app, /hiddenQualifiers:\s*new Set\(\)/);
    assert.match(app, /stringResourceResultCountText/);
    assert.match(app, /filteredRows\.slice\(0, STRING_RESOURCE_RESULT_RENDER_LIMIT\)/);
    assert.match(app, /\uBA3C\uC800 \${renderedCount\.toLocaleString\(\)}\uAC1C \uD45C\uC2DC/);

    for (const appContract of [
      'nextStringResourceFileId',
      'stringResourceSheetId'
    ]) {
      assert.match(app, new RegExp(`\\b${appContract}\\b`));
    }

    assert.match(app, /nextFileId:\s*1/);
    assert.match(app, /const fileId = nextStringResourceFileId\(\)/);
    assert.match(app, /rows = normalized\.rows\.map\(\(row\) => \(\{ \.\.\.row, fileId \}\)\)/);
    assert.match(app, /stringResourceSheetId\(fileId, summary\.name\)/);
    assert.match(app, /stringResourceSheetId\(file\.fileId, summary\.name\)/);
    assert.match(app, /stringResourceSheetId\(row\.fileId, row\.sheetName\)/);
    assert.match(app, /files\.length === 0 && state\.stringResource\.errors\.length === 0/);
    assert.match(app, /\uC790\uB3D9 \uAC10\uC9C0/);
    assert.match(app, /\uC218\uB3D9 \uC120\uD0DD \uAC00\uB2A5/);
    assert.match(app, /summary\.name.*\u00B7.*summary\.rowCount/);
    assert.doesNotMatch(app, /'\?\? \?\?'/);
    assert.doesNotMatch(app, /'\?\? \?\? \?\?'/);
    assert.doesNotMatch(app, /stringResourceSheetId\(file\.fileName, summary\.name\)/);
    assert.doesNotMatch(app, /stringResourceSheetId\(row\.fileName, row\.sheetName\)/);
  });

  it('declares local SheetJS vendor loading for Excel parsing', async () => {
    const html = await readFile(new URL('../public/index.html', import.meta.url), 'utf8');
    const packageJson = await readFile(new URL('../package.json', import.meta.url), 'utf8');
    const pkg = JSON.parse(packageJson);

    assert.match(html, /<script src="\.\/vendor\/xlsx\.full\.min\.js" defer><\/script>/);
    assert.equal(pkg.dependencies.xlsx, '0.18.5');
    assert.equal(pkg.scripts['prepare:vendor'], 'node scripts/copy-xlsx-vendor.js');
  });

  it('provides a direct GROUP INTENTIONS to SLOT REFERENCE workflow', async () => {
    const html = await readFile(new URL('../public/index.html', import.meta.url), 'utf8');
    const css = await readFile(new URL('../public/styles.css', import.meta.url), 'utf8');
    const app = await readFile(new URL('../public/app.js', import.meta.url), 'utf8');

    for (const id of [
      'mappingApp',
      'mappingCount',
      'mappingGroupSearchInput',
      'mappingStatus',
      'mappingGroupResultCount',
      'mappingGroupEmptyState',
      'mappingGroupTableShell',
      'mappingGroupTableBody',
      'mappingSlotResultCount',
      'mappingSlotEmptyState',
      'mappingSlotTableShell',
      'mappingSlotTableBody'
    ]) {
      assert.match(html, new RegExp(`id="${id}"`));
    }

    for (const selector of [
      '.mapping-workspace',
      '.mapping-workflow',
      '.mapping-search-panel',
      '.mapping-slot-results',
      '.mapping-table-shell',
      '.mapping-table',
      '.mapping-group-table',
      '.mapping-slot-table'
    ]) {
      assert.match(css, new RegExp(`${selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*{`));
    }

    for (const appContract of [
      'loadMappingData',
      'renderMappingWorkflow',
      'renderGroupIntentionTable',
      'selectMappingGroupRow',
      'renderSlotReferenceTable',
      'normalizeMappingWorkbook',
      'filterGroupIntentionRows',
      'filterSlotReferenceRows',
      'getGroupIntentionSlotCandidates'
    ]) {
      assert.match(app, new RegExp(`\\b${appContract}\\b`));
    }
    assert.match(app, /fetch\('\.\/mapping-table-v3\.3\.19\.json'\)/);
    assert.doesNotMatch(html, /id="mappingSelectedPanel"/);
    assert.doesNotMatch(html, /id="mappingSelectedTitle"/);
    assert.doesNotMatch(html, /id="mappingSelectedMappingIntent"/);
    assert.doesNotMatch(html, /id="mappingSlotChips"/);
    assert.doesNotMatch(html, /id="mappingSheetFilters"/);
    assert.doesNotMatch(html, /id="mappingCategoryFilters"/);
    assert.doesNotMatch(css, /\.mapping-selected-panel\s*{/);
    assert.doesNotMatch(css, /\.mapping-slot-chip\s*{/);
    assert.doesNotMatch(app, /\brenderSelectedMappingPanel\b/);
    assert.doesNotMatch(app, /\btoggleMappingSlot\b/);
  });

  it('keeps SLOT REFERENCE reachable with workflow scrolling on short desktop heights', async () => {
    const css = await readFile(new URL('../public/styles.css', import.meta.url), 'utf8');
    const app = await readFile(new URL('../public/app.js', import.meta.url), 'utf8');
    const workflowRule = css.match(/\.mapping-workflow\s*{[^}]+}/)?.[0] ?? '';
    const searchTableRule = css.match(/\.mapping-search-panel \.mapping-table-shell\s*{[^}]+}/)?.[0] ?? '';
    const slotTableRule = css.match(/\.mapping-slot-results \.mapping-table-shell\s*{[^}]+}/)?.[0] ?? '';
    const mappingActiveAppRule = css.match(/body\.mapping-active \.app-shell\s*{[^}]+}/)?.[0] ?? '';
    const mappingActiveWorkspaceRule = css.match(/body\.mapping-active \.mapping-workspace\s*{[^}]+}/)?.[0] ?? '';
    const mappingActiveWorkflowRule = css.match(/body\.mapping-active \.mapping-workflow\s*{[^}]+}/)?.[0] ?? '';

    assert.match(workflowRule, /grid-template-rows:\s*auto\s+minmax\(220px,\s*1fr\)/);
    assert.match(searchTableRule, /max-height:\s*min\(360px,\s*38vh\)/);
    assert.match(slotTableRule, /flex:\s*1 1 auto/);
    assert.match(slotTableRule, /max-height:\s*none/);
    assert.match(app, /classList\.add\('mapping-active'\)/);
    assert.match(app, /classList\.remove\('formatter-active', 'mapping-active'\)/);
    assert.match(mappingActiveAppRule, /height:\s*auto/);
    assert.match(mappingActiveAppRule, /overflow:\s*visible/);
    assert.match(mappingActiveWorkspaceRule, /overflow:\s*visible/);
    assert.match(mappingActiveWorkflowRule, /height:\s*auto/);
    assert.match(mappingActiveWorkflowRule, /overflow-y:\s*visible/);
  });

  it('provides a file-upload based recognitionText explorer workspace', async () => {
    const html = await readFile(new URL('../public/index.html', import.meta.url), 'utf8');
    const css = await readFile(new URL('../public/styles.css', import.meta.url), 'utf8');
    const requiredExplorerIds = [
      'explorerToolbar',
      'explorerFileInput',
      'explorerFolderInput',
      'explorerUploadStatus',
      'explorerFileCount',
      'explorerResultCount',
      'toggleExplorerFilesButton',
      'clearExplorerButton',
      'explorerSearchArea',
      'explorerSearchInput',
      'explorerSuggestions',
      'explorerResults',
      'explorerEmptyState',
      'explorerTableShell',
      'explorerTable',
      'explorerTableBody',
      'explorerFileDrawer',
      'closeExplorerFilesButton',
      'explorerDrawerCount',
      'explorerRegisteredList',
      'explorerModal',
      'explorerModalBackdrop',
      'explorerModalTitle',
      'explorerModalMeta',
      'closeExplorerModalButton',
      'explorerModalJson',
    ];
    const tagForId = (id) => html.match(new RegExp(`<[^>]+id="${id}"[^>]*>`))?.[0] ?? '';
    const tableStart = html.indexOf('id="explorerTable"');
    const tableMarkup = tableStart === -1 ? '' : html.slice(tableStart, html.indexOf('</table>', tableStart));
    const cssRuleBodiesForSelector = (cssText, selector) => [...cssText.matchAll(/([^{}]+)\{([^{}]*)\}/g)]
      .filter(([, selectorList]) => selectorList
        .split(',')
        .map((part) => part.trim())
        .includes(selector))
      .map(([, , body]) => body);
    const assertCssSelector = (selector) => {
      assert.notEqual(cssRuleBodiesForSelector(css, selector).length, 0, `Expected CSS selector ${selector}`);
    };
    const assertNoCssSelector = (selector) => {
      assert.equal(cssRuleBodiesForSelector(css, selector).length, 0, `Unexpected stale CSS selector ${selector}`);
    };

    for (const id of requiredExplorerIds) {
      assert.match(html, new RegExp(`id="${id}"`));
    }
    for (const selector of [
      '.explorer-toolbar',
      '.explorer-search-area',
      '.explorer-suggestions',
      '.explorer-suggestion',
      '.explorer-suggestion:focus-visible',
      '.explorer-suggestion .explorer-suggestion-title',
      '.explorer-suggestion .item-meta',
      '.explorer-results',
      '.explorer-results > .empty-state',
      '.explorer-table-shell',
      '.explorer-table',
      '.explorer-table-resizer',
      '.explorer-table-resizer::before',
      '.explorer-table-resizer::after',
      '.explorer-table-resizer:hover',
      '.explorer-table-resizer:focus-visible',
      '.explorer-table-resizer.is-resizing',
      '.explorer-table .ghost-button',
      '.explorer-file-drawer',
      '.explorer-file-drawer .panel-header',
      '.explorer-registered-list',
      '.explorer-file-drawer .quick-title-row',
      '.explorer-file-drawer .quick-title-button',
      '.explorer-file-drawer .quick-title-row strong',
      '.explorer-modal',
      '.explorer-modal-backdrop',
      '.explorer-modal-panel',
      '.explorer-modal-panel .panel-header',
      '.explorer-modal-panel .json-preview',
    ]) {
      assertCssSelector(selector);
    }
    for (const staleSelector of [
      '.search-first-workspace',
      '.explorer-upload-tools',
      '.explorer-toolbar-actions',
      '.explorer-main-search',
      '.explorer-panel',
      '.explorer-controls',
      '.explorer-detail',
      '.explorer-list',
      '.explorer-row',
      '.explorer-row-title',
      '.suggestion-row',
      '.suggestion-title',
      '.suggestion-meta',
      '.explorer-empty-state',
      '.compact-button',
      '.drawer-head',
      '.registered-file-list',
      '.registered-file-row',
      '.json-modal',
      '.modal-backdrop',
      '.modal-panel',
      '.modal-head',
      '.explorer-json-preview',
      '.explorer-modal-json',
    ]) {
      assertNoCssSelector(staleSelector);
    }
    const suggestionFocusRules = cssRuleBodiesForSelector(css, '.explorer-suggestion:focus-visible').join('\n');
    const suggestionListRules = cssRuleBodiesForSelector(css, '.explorer-suggestions').join('\n');
    const tableResizerRules = cssRuleBodiesForSelector(css, '.explorer-table-resizer::after').join('\n');
    const tableResizerActiveRules = cssRuleBodiesForSelector(css, '.explorer-table-resizer.is-resizing').join('\n');
    const modalJsonRules = cssRuleBodiesForSelector(css, '.explorer-modal-panel .json-preview').join('\n');
    assert.match(suggestionListRules, /max-height:\s*min\(240px,\s*34vh\)/);
    assert.match(suggestionFocusRules, /outline:\s*3px solid rgba\(18,\s*104,\s*214,\s*0\.22\)/);
    assert.match(suggestionFocusRules, /outline-offset:\s*-2px/);
    assert.doesNotMatch(suggestionFocusRules, /outline:\s*none/);
    assert.match(tableResizerRules, /background:\s*#c8d2e2/);
    assert.match(tableResizerActiveRules, /background:\s*rgba\(18,\s*104,\s*214,\s*0\.14\)/);
    assert.match(modalJsonRules, /flex:\s*1/);
    assert.match(modalJsonRules, /min-height:\s*0/);
    assert.match(modalJsonRules, /overflow:\s*auto/);
    assert.deepEqual(
      [...modalJsonRules.matchAll(/min-height:\s*([^;]+);/g)].map(([, value]) => value.trim()),
      ['0']
    );
    assert.match(html, /id="explorerFolderInput"[^>]*webkitdirectory/);
    assert.match(tagForId('explorerSearchInput'), /aria-controls="explorerSuggestions"/);
    assert.match(tagForId('explorerSearchInput'), /aria-expanded="false"/);
    assert.match(tagForId('explorerSearchInput'), /aria-autocomplete="list"/);
    assert.match(tagForId('explorerSuggestions'), /role="listbox"/);
    assert.match(tagForId('explorerSuggestions'), /hidden/);
    assert.match(tagForId('toggleExplorerFilesButton'), /aria-controls="explorerFileDrawer"/);
    assert.match(tagForId('toggleExplorerFilesButton'), /aria-expanded="false"/);
    assert.match(tagForId('explorerFileDrawer'), /hidden/);
    assert.match(tagForId('explorerModal'), /role="dialog"/);
    assert.match(tagForId('explorerModal'), /hidden/);
    assert.match(tagForId('explorerTableShell'), /hidden/);
    assert.match(html, /JSON 파일 선택/);
    assert.match(html, /JSON 폴더 선택/);
    assert.match(html, /등록 파일 보기/);
    assert.match(html, /목록 비우기/);
    assert.match(html, /통합 검색/);
    assert.match(html, /JSON 상세/);
    assert.match(html, /<colgroup>/);
    for (const columnId of ['sourceFilename', 'recognitionText', 'language', 'slot', 'contentType', 'tableVersion', 'actions']) {
      assert.match(html, new RegExp(`data-explorer-column="${columnId}"`));
    }
    assert.equal([...html.matchAll(/class="explorer-table-resizer"/g)].length, 7);
    assert.match(html, /aria-label="[^"]+ 열 너비 조절"/);
    assert.notEqual(tableStart, -1);
    for (const columnText of ['파일명', 'recognitionText', 'language', 'slot', 'contentType', 'table_version', '보기']) {
      assert.match(tableMarkup, new RegExp(`>\\s*${columnText}\\s*<`));
    }
  });

  it('wires the file-upload based recognitionText explorer app contracts', async () => {
    const app = await readFile(new URL('../public/app.js', import.meta.url), 'utf8');

    for (const appContract of [
      'buildExplorerSuggestions',
      'parseExplorerSearchTerms',
      'renderExplorerTable',
      'renderExplorerSuggestions',
      'hideExplorerSuggestions',
      'toggleExplorerFileDrawer',
      'openExplorerModal',
      'closeExplorerModal',
      'trapModalFocus',
      'removeExplorerItem',
      'initializeExplorerColumnResizing',
      'applyExplorerColumnWidths',
      'beginExplorerColumnResize',
      'autofitExplorerColumn',
      'saveExplorerColumnWidths'
    ]) {
      assert.match(app, new RegExp(`\\b${appContract}\\b`));
    }
    assert.match(app, /const EXPLORER_COLUMN_STORAGE_KEY = 'mz-json-explorer-column-widths'/);
    assert.ok(app.includes("elements.explorerTable.querySelectorAll('[data-explorer-column]')"));
    assert.match(app, /classList\.add\('is-resizing'\)/);
    assert.match(app, /classList\.remove\('is-resizing'\)/);
    assert.match(app, /localStorage\.setItem\(EXPLORER_COLUMN_STORAGE_KEY/);
    assert.match(app, /localStorage\.getItem\(EXPLORER_COLUMN_STORAGE_KEY/);
    assert.match(app, /\blet\s+explorerModalFocusReturnTarget\s*=/);
    assert.match(app, /\blet\s+explorerDrawerFocusReturnTarget\s*=/);
    assert.match(app, /trapModalFocus\(event, elements\.explorerModal\)/);
    const keydownIndex = app.indexOf("document.addEventListener('keydown'");
    const modalEscapeIndex = app.indexOf('closeExplorerModal()', keydownIndex);
    const suggestionsEscapeIndex = app.indexOf('!elements.explorerSuggestions.hidden', modalEscapeIndex);
    const drawerEscapeIndex = app.indexOf('toggleExplorerFileDrawer(false)', suggestionsEscapeIndex);
    const openModalIndex = app.indexOf('function openExplorerModal(id)');
    const openModalHideSuggestionsIndex = app.indexOf('hideExplorerSuggestions()', openModalIndex);
    const openModalRenderIndex = app.indexOf('renderExplorerModal()', openModalIndex);
    assert.ok(keydownIndex !== -1);
    assert.ok(modalEscapeIndex > keydownIndex);
    assert.ok(suggestionsEscapeIndex > modalEscapeIndex);
    assert.ok(drawerEscapeIndex > suggestionsEscapeIndex);
    assert.ok(openModalIndex !== -1);
    assert.ok(openModalHideSuggestionsIndex > openModalIndex);
    assert.ok(openModalRenderIndex > openModalHideSuggestionsIndex);
    assert.doesNotMatch(app, /\brenderExplorerRow\b/);
    assert.doesNotMatch(app, /\brenderExplorerDetail\b/);
    assert.doesNotMatch(app, /\bensureActiveExplorerItem\b/);
    assert.doesNotMatch(app, /\bselectExplorerItem\b/);
  });

  it('hides explorer suggestions when the user leaves search assistance mode', async () => {
    const app = await readFile(new URL('../public/app.js', import.meta.url), 'utf8');

    assert.match(app, /explorerSearchArea:\s*document\.querySelector\('#explorerSearchArea'\)/);
    assert.match(app, /elements\.explorerSearchInput\.addEventListener\('keydown'/);
    assert.match(app, /event\.key === 'Enter'[\s\S]*hideExplorerSuggestions\(\)/);
    assert.match(app, /elements\.explorerSearchArea\.addEventListener\('focusout'/);
    assert.match(app, /document\.addEventListener\('pointerdown',\s*handleExplorerOutsidePointerDown\)/);
    assert.match(app, /elements\.explorerTableShell\.addEventListener\('scroll',\s*hideExplorerSuggestions\)/);
    assert.match(app, /function handleExplorerOutsidePointerDown\(event\)/);
  });

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
    assert.match(css, /@media \(min-width: 901px\)[\s\S]*body\.formatter-active\s*{[\s\S]*overflow:\s*hidden/);
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
    const helpOverlayTag = html.match(/<div[^>]*id="helpOverlay"[^>]*>/)?.[0] ?? '';

    assert.match(html, /id="openHelpButton"/);
    assert.match(html, /aria-controls="helpOverlay"/);
    assert.match(html, /id="helpOverlay"[^>]*hidden/);
    assert.doesNotMatch(helpOverlayTag, /role="dialog"/);
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
