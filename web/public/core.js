const INVALID_FILENAME_CHARS = /[<>:"/\\|?*\x00-\x1f]/g;
const TRAILING_DOTS_SPACES = /[. ]+$/g;
const RESERVED_WINDOWS_NAMES = /^(con|prn|aux|nul|com[1-9]|lpt[1-9])$/i;
const DEFAULT_FILENAME_PREFIX = 'default_json';
export const MAPPING_SHEET_OPTIONS = [
  { id: 'GROUP INTENTIONS', label: 'GROUP INTENTIONS', defaultChecked: true },
  { id: 'SLOT REFERENCE', label: 'SLOT REFERENCE', defaultChecked: true },
  { id: '매핑 테이블', label: '매핑 테이블', defaultChecked: true },
  { id: 'history', label: 'history', defaultChecked: false }
];
export const MAPPING_SEARCH_CATEGORY_OPTIONS = [
  {
    id: 'utterance',
    label: '발화 / 명령어',
    defaultChecked: true,
    columnsBySheet: {
      'GROUP INTENTIONS': ['대표 명령어', '발화 패턴'],
      'SLOT REFERENCE': ['발화 패턴']
    }
  },
  {
    id: 'domainIntent',
    label: 'Domain / Intention',
    defaultChecked: true,
    columnsBySheet: {
      'GROUP INTENTIONS': ['도메인', 'Domain', 'Intention'],
      '매핑 테이블': ['Domain', 'Intention']
    }
  },
  {
    id: 'mappingIntent',
    label: 'Mapping Intent / contentType',
    defaultChecked: true,
    columnsBySheet: {
      'GROUP INTENTIONS': ['매핑 인텐션(=contentType)'],
      '매핑 테이블': ['매핑 인텐션']
    }
  },
  {
    id: 'slot',
    label: 'Slot',
    defaultChecked: true,
    columnsBySheet: {
      'GROUP INTENTIONS': ['Slot 1', 'Slot 2', 'Slot 3', 'Slot4'],
      'SLOT REFERENCE': [
        'Slot Reference',
        'Slot name',
        '[Connect 플랫폼 한] / Norm Slot name',
        'Slot Value',
        'Slot Canonical',
        '[Connect 플랫폼 한] / Norm Slot Canonical'
      ],
      '매핑 테이블': ['부가정보']
    }
  },
  {
    id: 'note',
    label: '비고 / 변경내용',
    defaultChecked: false,
    columnsBySheet: {
      history: ['Description', 'Sheet', 'Written by'],
      'GROUP INTENTIONS': ['비고', '서버 only 사양', '기능 지원 여부 / (지역 별 특화 사양일때만 명기. / 그 외는 UX 혹은 FIGMA 사양서 참고)'],
      'SLOT REFERENCE': ['비고'],
      '매핑 테이블': ['비고']
    }
  }
];
export const MAPPING_DEFAULT_SHEETS = MAPPING_SHEET_OPTIONS
  .filter((option) => option.defaultChecked)
  .map((option) => option.id);
export const MAPPING_DEFAULT_CATEGORIES = MAPPING_SEARCH_CATEGORY_OPTIONS
  .filter((option) => option.defaultChecked)
  .map((option) => option.id);

export function extractJsonCandidates(input) {
  const source = String(input ?? '');
  const candidates = [];

  let start = -1;
  let depth = 0;
  let inString = false;
  let escaped = false;

  for (let index = 0; index < source.length; index += 1) {
    const char = source[index];

    if (start === -1) {
      if (char === '{') {
        start = index;
        depth = 1;
      }
      continue;
    }

    if (inString) {
      if (escaped) {
        escaped = false;
      } else if (char === '\\') {
        escaped = true;
      } else if (char === '"') {
        inString = false;
      }
      continue;
    }

    if (char === '"') {
      inString = true;
      continue;
    }

    if (char === '{') {
      depth += 1;
      continue;
    }

    if (char === '}') {
      depth -= 1;
      if (depth === 0) {
        candidates.push({
          end: index + 1,
          start,
          text: source.slice(start, index + 1)
        });
        start = -1;
      }
    }
  }

  if (start !== -1) {
    candidates.push({
      end: source.length,
      incomplete: true,
      start,
      text: source.slice(start)
    });
  }

  return candidates;
}

export function parseJsonCandidates(input, { keepInvalidAsRaw = false } = {}) {
  const candidates = extractJsonCandidates(input);
  const valid = [];
  const errors = [];

  for (const candidate of candidates) {
    if (candidate.incomplete) {
      errors.push({
        candidate,
        message: 'JSON object is incomplete.'
      });
      continue;
    }

    try {
      valid.push({
        candidate,
        value: JSON.parse(candidate.text)
      });
    } catch (error) {
      if (keepInvalidAsRaw) {
        valid.push({
          candidate,
          value: candidate.text,
          valueKind: 'raw-string',
          warning: 'Invalid JSON was saved as a raw string.'
        });
        continue;
      }

      errors.push({
        candidate,
        message: error instanceof Error ? error.message : String(error)
      });
    }
  }

  return { errors, valid };
}

export function parseUploadedJsonContent(sourceFilename, text) {
  const sourceText = String(text ?? '');

  try {
    return {
      ok: true,
      sourceFilename,
      value: JSON.parse(sourceText),
      valueKind: 'json'
    };
  } catch (error) {
    return {
      message: `${sourceFilename}: ${error instanceof Error ? error.message : String(error)}`,
      ok: true,
      sourceFilename,
      value: sourceText,
      valueKind: 'raw-string',
      warning: 'Invalid JSON was saved as a raw string.'
    };
  }
}

export function findRecognitionText(value) {
  if (typeof value === 'string') {
    return findRecognitionTextInText(value);
  }

  const seen = new Set();

  function visit(current) {
    if (current === null || typeof current !== 'object') {
      return undefined;
    }
    if (seen.has(current)) {
      return undefined;
    }
    seen.add(current);

    if (
      Object.prototype.hasOwnProperty.call(current, 'recognitionText') &&
      typeof current.recognitionText === 'string' &&
      current.recognitionText.trim()
    ) {
      return current.recognitionText;
    }

    if (Array.isArray(current)) {
      for (const item of current) {
        const found = visit(item);
        if (found !== undefined) {
          return found;
        }
      }
      return undefined;
    }

    for (const key of Object.keys(current)) {
      const found = visit(current[key]);
      if (found !== undefined) {
        return found;
      }
    }

    return undefined;
  }

  return visit(value);
}

export function findRecognitionTextInText(text) {
  const source = String(text ?? '');
  const match = source.match(/"recognitionText"\s*:\s*"((?:\\.|[^"\\])*)"/);

  if (!match) {
    return undefined;
  }

  const rawValue = match[1];
  try {
    return JSON.parse(`"${rawValue}"`);
  } catch {
    return rawValue;
  }
}

export function needsEnglishTranslation(text) {
  const value = String(text ?? '').trim();
  return value.length > 0 && /[^\x00-\x7f]/.test(value);
}

export function defaultFilenameBase(id) {
  const suffix = Number.isInteger(Number(id)) && Number(id) > 0 ? Number(id) : 1;
  return `${DEFAULT_FILENAME_PREFIX}_${suffix}`;
}

export function sanitizeFilenameBase(text, fallback = defaultFilenameBase(1)) {
  const fallbackValue = String(fallback || defaultFilenameBase(1)).trim() || defaultFilenameBase(1);
  let base = String(text ?? '')
    .normalize('NFKC')
    .replace(INVALID_FILENAME_CHARS, ' ')
    .replace(/[\r\n\t]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/\s/g, '_')
    .replace(/_+/g, '_')
    .replace(TRAILING_DOTS_SPACES, '');

  if (!base || base === '.' || base === '..' || RESERVED_WINDOWS_NAMES.test(base)) {
    base = fallbackValue;
  }

  return base.slice(0, 120);
}

export function ensureJsonExtension(filename) {
  const value = String(filename ?? '').trim();
  const safe = sanitizeFilenameBase(value.replace(/\.json$/i, ''), defaultFilenameBase(1));
  return `${safe}.json`;
}

export function ensureItemJsonFilename(item, index = 0) {
  const fallback = defaultFilenameBase(item?.id ?? index + 1);
  const value = String(item?.filename ?? '').trim();
  const safe = sanitizeFilenameBase(value.replace(/\.json$/i, ''), fallback);
  return `${safe}.json`;
}

export function dedupeFilenames(items) {
  const seen = new Set();

  return items.map((item, index) => {
    const filename = ensureItemJsonFilename(item, index);
    const base = filename.replace(/\.json$/i, '');
    let candidate = filename;
    let suffix = 2;

    while (seen.has(candidate.toLowerCase())) {
      candidate = `${base}_${suffix}.json`;
      suffix += 1;
    }

    seen.add(candidate.toLowerCase());
    return { ...item, filename: candidate };
  });
}

export function applyDedupedFilenames(items) {
  const deduped = dedupeFilenames(items);
  deduped.forEach((item, index) => {
    items[index].filename = item.filename;
  });
  return items;
}

export function createDownloadItem({
  id,
  parseWarning = '',
  sourceFilename = '',
  sourceType = 'paste',
  value,
  valueKind = 'json'
}) {
  const recognitionText = findRecognitionText(value) ?? '';
  const filenameSource = recognitionText || (sourceType === 'upload' && sourceFilename
    ? sourceFilename.replace(/\.json$/i, '')
    : recognitionText);
  const filenameBase = sanitizeFilenameBase(filenameSource, defaultFilenameBase(id));

  return {
    filename: ensureJsonExtension(filenameBase),
    id,
    manuallyEdited: false,
    recognitionText,
    sourceFilename,
    sourceType,
    valueKind,
    translationStatus: recognitionText ? 'ready' : 'missing',
    value,
    warning: parseWarning || (recognitionText ? '' : 'recognitionText 없음')
  };
}

function isRecord(value) {
  return value !== null && typeof value === 'object';
}

function findFirstByPaths(value, paths) {
  for (const path of paths) {
    let current = value;
    let found = true;

    for (const key of path) {
      if (!isRecord(current) || !Object.prototype.hasOwnProperty.call(current, key)) {
        found = false;
        break;
      }
      current = current[key];
    }

    if (
      found &&
      (typeof current === 'string' || typeof current === 'number' || typeof current === 'boolean') &&
      String(current).trim()
    ) {
      return current;
    }
  }

  return '';
}

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function findScalarInText(text, keys) {
  const source = String(text ?? '');

  for (const key of keys) {
    const pattern = new RegExp(`"${escapeRegExp(key)}"\\s*:\\s*("(?:\\\\.|[^"\\\\])*"|[-+]?\\d+(?:\\.\\d+)?|true|false)`);
    const match = source.match(pattern);
    if (!match) {
      continue;
    }

    const rawValue = match[1];
    if (rawValue.startsWith('"')) {
      try {
        return JSON.parse(rawValue);
      } catch {
        return rawValue.slice(1, -1);
      }
    }

    return rawValue;
  }

  return '';
}

function findBalancedJsonText(source, startIndex) {
  const opener = source[startIndex];
  const closer = opener === '{' ? '}' : opener === '[' ? ']' : '';
  if (!closer) {
    return '';
  }

  let depth = 0;
  let inString = false;
  let escaped = false;

  for (let index = startIndex; index < source.length; index += 1) {
    const char = source[index];

    if (inString) {
      if (escaped) {
        escaped = false;
      } else if (char === '\\') {
        escaped = true;
      } else if (char === '"') {
        inString = false;
      }
      continue;
    }

    if (char === '"') {
      inString = true;
      continue;
    }

    if (char === opener) {
      depth += 1;
      continue;
    }

    if (char === closer) {
      depth -= 1;
      if (depth === 0) {
        return source.slice(startIndex, index + 1);
      }
    }
  }

  return '';
}

function findJsonValueInText(text, key) {
  const source = String(text ?? '');
  const pattern = new RegExp(`"${escapeRegExp(key)}"\\s*:`, 'g');
  let match;

  while ((match = pattern.exec(source)) !== null) {
    let valueStart = match.index + match[0].length;
    while (/\s/.test(source[valueStart] ?? '')) {
      valueStart += 1;
    }

    const jsonText = findBalancedJsonText(source, valueStart);
    if (!jsonText) {
      continue;
    }

    try {
      return JSON.parse(jsonText);
    } catch {
      continue;
    }
  }

  return undefined;
}

function normalizeSlotCollection(slots) {
  if (Array.isArray(slots)) {
    return slots;
  }

  if (!isRecord(slots)) {
    return [];
  }

  return Object.entries(slots).map(([name, slot]) => {
    if (isRecord(slot)) {
      return { name, ...slot };
    }

    return { name, value: slot };
  });
}

function findFirstSlots(value) {
  if (typeof value === 'string') {
    return normalizeSlotCollection(findJsonValueInText(value, 'slot'));
  }

  const seen = new Set();

  function visit(current) {
    if (!isRecord(current)) {
      return undefined;
    }
    if (seen.has(current)) {
      return undefined;
    }
    seen.add(current);

    if (Object.prototype.hasOwnProperty.call(current, 'slots') && Array.isArray(current.slots)) {
      return current.slots;
    }

    if (Object.prototype.hasOwnProperty.call(current, 'slot')) {
      const slots = normalizeSlotCollection(current.slot);
      if (slots.length > 0) {
        return slots;
      }
    }

    if (Array.isArray(current)) {
      for (const item of current) {
        const found = visit(item);
        if (found !== undefined) {
          return found;
        }
      }
      return undefined;
    }

    for (const key of Object.keys(current)) {
      const found = visit(current[key]);
      if (found !== undefined) {
        return found;
      }
    }

    return undefined;
  }

  return visit(value) ?? [];
}

function scalarString(value) {
  if (value === null || value === undefined) {
    return '';
  }
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
    return String(value).trim();
  }
  return '';
}

function nestedScalarString(value, keys, seen = new Set()) {
  const direct = scalarString(value);
  if (direct) {
    return direct;
  }
  if (!isRecord(value)) {
    return '';
  }
  if (seen.has(value)) {
    return '';
  }
  seen.add(value);

  for (const key of keys) {
    if (Object.prototype.hasOwnProperty.call(value, key)) {
      const found = nestedScalarString(value[key], keys, seen);
      if (found) {
        return found;
      }
    }
  }

  return '';
}

function slotName(slot) {
  return nestedScalarString(slot, ['name', 'slotName', 'key', 'type']);
}

function slotValue(slot) {
  return nestedScalarString(slot, ['value', 'literal', 'text', 'normalizedValue', 'normalized', 'scalar']);
}

function summarizeSlots(slots) {
  return slots
    .map((slot) => {
      const name = slotName(slot);
      const value = slotValue(slot);

      if (name && value) {
        return `${name}=${value}`;
      }
      return name || value;
    })
    .filter(Boolean)
    .join(', ');
}

function parseExplorerSearchSegments(query, delimiter = ',') {
  const source = String(query ?? '');
  const segments = [];
  let current = '';
  let inQuote = false;
  let escaped = false;

  for (const char of source) {
    if (escaped) {
      current += char;
      escaped = false;
      continue;
    }

    if (char === '\\' && inQuote) {
      escaped = true;
      continue;
    }

    if (char === '"') {
      inQuote = !inQuote;
      continue;
    }

    if (char === delimiter && !inQuote) {
      segments.push(current.trim());
      current = '';
      continue;
    }

    current += char;
  }

  if (escaped) {
    current += '\\';
  }
  segments.push(current.trim());

  return segments;
}

function quoteExplorerSearchTerm(term) {
  const value = String(term ?? '').trim();
  if (!/[",]/.test(value)) {
    return value;
  }

  return `"${value.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
}

export function parseExplorerSearchTerms(query) {
  return parseExplorerSearchSegments(query)
    .filter(Boolean);
}

function parseExplorerSearchGroups(query) {
  return parseExplorerSearchSegments(query)
    .map((segment) => parseExplorerSearchSegments(segment, '|').filter(Boolean))
    .filter((alternatives) => alternatives.length > 0);
}

function explorerSearchValues(item) {
  return [
    item?.sourceFilename,
    item?.recognitionText,
    item?.language,
    item?.slotSummary,
    item?.contentType,
    item?.tableVersion
  ].map((part) => String(part ?? '').trim()).filter(Boolean);
}

function explorerSearchText(item) {
  return explorerSearchValues(item).map((part) => part.toLowerCase()).join(' ');
}

function wildcardTermMatchesItem(item, term) {
  const pattern = String(term ?? '').trim();
  const regex = new RegExp(`^${pattern.split('*').map(escapeRegExp).join('.*')}$`, 'i');
  return explorerSearchValues(item).some((value) => regex.test(value));
}

function searchTermMatchesItem(item, term) {
  const value = String(term ?? '').trim();
  if (!value) {
    return false;
  }

  if (value.includes('*')) {
    return wildcardTermMatchesItem(item, value);
  }

  return explorerSearchText(item).includes(value.toLowerCase());
}

export function createExplorerItem({
  id,
  sourceFilename = '',
  value,
  valueKind = 'json',
  warning = ''
}) {
  const recognitionText = findRecognitionText(value) ?? '';
  const language = scalarString(findFirstByPaths(value, [
    ['language'],
    ['ResultInfo', 'language'],
    ['serverResult', 'language'],
    ['serverResult', 'result', 'language']
  ])) || findScalarInText(value, ['language']);
  const contentType = scalarString(findFirstByPaths(value, [
    ['serverResult', 'result', 'contentType'],
    ['ResultInfo', 'contentType'],
    ['contentType']
  ])) || findScalarInText(value, ['contentType']);
  const tableVersion = scalarString(findFirstByPaths(value, [
    ['serverResult', 'result', 'table_version'],
    ['ResultInfo', 'table_version'],
    ['table_version']
  ])) || findScalarInText(value, ['table_version']);
  const slotSummary = summarizeSlots(findFirstSlots(value));

  return {
    contentType,
    id,
    language,
    recognitionText,
    slotSummary,
    sourceFilename,
    tableVersion,
    title: recognitionText || 'recognitionText 없음',
    value,
    valueKind,
    warning
  };
}

export function filterExplorerItems(items, query) {
  const groups = parseExplorerSearchGroups(query);

  if (!groups.length) {
    return [];
  }

  return items.filter((item) => {
    return groups.every((alternatives) => {
      return alternatives.some((term) => searchTermMatchesItem(item, term));
    });
  });
}

export function buildExplorerSuggestions(items, query, limit = 8) {
  const segments = parseExplorerSearchSegments(query);
  const activeSegment = segments.at(-1) ?? '';
  const alternatives = parseExplorerSearchSegments(activeSegment, '|');
  const activeTerm = alternatives.at(-1)?.trim() ?? '';

  if (!activeTerm) {
    return [];
  }

  const normalizedActiveTerm = activeTerm.toLowerCase();
  const previousTerms = segments.slice(0, -1).filter(Boolean);
  const previousAlternatives = alternatives.slice(0, -1).filter(Boolean);
  const maxSuggestions = Math.max(0, Number(limit) || 0);
  const seenRecognitionTexts = new Set();
  const suggestions = [];

  if (maxSuggestions === 0) {
    return suggestions;
  }

  for (const item of items) {
    const recognitionText = String(item?.recognitionText ?? '').trim();
    if (!recognitionText || !recognitionText.toLowerCase().includes(normalizedActiveTerm)) {
      continue;
    }
    const suggestionKey = recognitionText.toLowerCase();
    if (seenRecognitionTexts.has(suggestionKey)) {
      continue;
    }
    seenRecognitionTexts.add(suggestionKey);

    suggestions.push({
      id: item.id,
      recognitionText,
      replacementQuery: [
        ...previousTerms.map(quoteExplorerSearchTerm),
        [...previousAlternatives, recognitionText].map(quoteExplorerSearchTerm).join('|')
      ].filter(Boolean).join(', '),
      sourceFilename: item.sourceFilename
    });

    if (suggestions.length >= maxSuggestions) {
      break;
    }
  }

  return suggestions;
}

export function normalizeMappingWorkbook(workbook) {
  const sheets = Array.isArray(workbook?.sheets) ? workbook.sheets : [];
  const rows = [];

  for (const sheet of sheets) {
    const sheetName = String(sheet?.name ?? '').trim();
    const sheetRows = Array.isArray(sheet?.rows) ? sheet.rows : [];
    if (!sheetName) {
      continue;
    }

    for (const row of sheetRows) {
      const values = isRecord(row?.values) ? row.values : {};
      const rowNumber = Number(row?.rowNumber) || rows.length + 1;
      rows.push({
        domainText: mappingFirstValue(values, ['도메인', 'Domain']),
        id: `${sheetName}:${rowNumber}`,
        intentionText: mappingFirstValue(values, ['Intention']),
        mappingIntent: mappingFirstValue(values, ['매핑 인텐션(=contentType)', '매핑 인텐션']),
        noteText: mappingFirstValue(values, ['비고', 'Description']),
        primaryText: mappingPrimaryText(sheetName, values),
        rowNumber,
        sheetName,
        slotText: mappingSlotText(sheetName, values),
        values
      });
    }
  }

  return rows;
}

export function filterMappingRows(rows, {
  query = '',
  selectedCategories = MAPPING_DEFAULT_CATEGORIES,
  selectedSheets = MAPPING_DEFAULT_SHEETS
} = {}) {
  const groups = parseExplorerSearchGroups(query);
  const sheetSet = new Set(selectedSheets);
  const categorySet = new Set(selectedCategories);
  const activeCategories = MAPPING_SEARCH_CATEGORY_OPTIONS
    .filter((category) => categorySet.has(category.id));

  if (!groups.length || sheetSet.size === 0 || activeCategories.length === 0) {
    return [];
  }

  return rows
    .filter((row) => sheetSet.has(row.sheetName))
    .map((row) => {
      const searchEntries = mappingSearchEntries(row, activeCategories);
      const matchesAllGroups = groups.every((alternatives) => {
        return alternatives.some((term) => {
          return searchEntries.some((entry) => mappingTermMatchesValue(term, entry.value));
        });
      });

      if (!matchesAllGroups) {
        return undefined;
      }

      const matchedEntries = searchEntries.filter((entry) => {
        return groups.some((alternatives) => {
          return alternatives.some((term) => mappingTermMatchesValue(term, entry.value));
        });
      });

      return {
        ...row,
        matchedCategories: uniqueValues(matchedEntries.map((entry) => entry.categoryId)),
        matchedFields: uniqueValues(matchedEntries.map((entry) => entry.field))
      };
    })
    .filter(Boolean);
}

export function filterGroupIntentionRows(rows, query = '') {
  const groups = parseExplorerSearchGroups(query);
  if (!groups.length) {
    return [];
  }

  return rows
    .filter((row) => row.sheetName === 'GROUP INTENTIONS')
    .map((row) => {
      const searchEntries = ['대표 명령어', '발화 패턴']
        .map((field) => ({ field, value: mappingValue(row.values, field) }))
        .filter((entry) => entry.value);
      const matchesAllGroups = groups.every((alternatives) => {
        return alternatives.some((term) => {
          return searchEntries.some((entry) => mappingTermMatchesValue(term, entry.value));
        });
      });

      if (!matchesAllGroups) {
        return undefined;
      }

      const matchedFields = searchEntries
        .filter((entry) => {
          return groups.some((alternatives) => {
            return alternatives.some((term) => mappingTermMatchesValue(term, entry.value));
          });
        })
        .map((entry) => entry.field);

      return {
        ...row,
        matchedCategories: ['utterance'],
        matchedFields: uniqueValues(matchedFields)
      };
    })
    .filter(Boolean);
}

export function getGroupIntentionSlotCandidates(row) {
  if (!row || row.sheetName !== 'GROUP INTENTIONS') {
    return [];
  }

  return uniqueValues(['Slot 1', 'Slot 2', 'Slot 3', 'Slot4']
    .map((column) => mappingValue(row.values, column))
    .filter((value) => isMeaningfulMappingSlot(value)));
}

export function filterSlotReferenceRows(rows, selectedSlots = []) {
  const slotSet = new Set(selectedSlots
    .filter((value) => isMeaningfulMappingSlot(value))
    .map((value) => normalizeMappingReference(value)));

  if (slotSet.size === 0) {
    return [];
  }

  return rows.filter((row) => {
    if (row.sheetName !== 'SLOT REFERENCE') {
      return false;
    }
    return slotSet.has(normalizeMappingReference(mappingValue(row.values, 'Slot Reference')));
  });
}

export function resolveMappingGroupSelection(groupRows, selectedGroupId = '', selectedSlots = []) {
  const selectedGroup = groupRows.find((row) => row.id === selectedGroupId) ?? groupRows[0];
  if (!selectedGroup) {
    return {
      selectedGroup: undefined,
      selectedGroupId: '',
      selectedSlots: []
    };
  }

  const slotCandidates = getGroupIntentionSlotCandidates(selectedGroup);
  const selectedSlotSet = new Set(selectedSlots);
  const validSelectedSlots = slotCandidates.filter((slot) => selectedSlotSet.has(slot));

  return {
    selectedGroup,
    selectedGroupId: selectedGroup.id,
    selectedSlots: selectedGroup.id === selectedGroupId ? validSelectedSlots : slotCandidates
  };
}

function mappingPrimaryText(sheetName, values) {
  if (sheetName === 'GROUP INTENTIONS') {
    return mappingFirstValue(values, ['대표 명령어', '발화 패턴', 'Intention']);
  }
  if (sheetName === 'SLOT REFERENCE') {
    return mappingFirstValue(values, ['Slot Reference', 'Slot name', 'Slot Value']);
  }
  if (sheetName === '매핑 테이블') {
    return mappingFirstValue(values, ['Intention', 'Domain', '매핑 인텐션']);
  }
  return mappingFirstValue(values, ['Description', 'Ver.', 'Date']);
}

function mappingSlotText(sheetName, values) {
  const slotColumns = MAPPING_SEARCH_CATEGORY_OPTIONS
    .find((category) => category.id === 'slot')
    ?.columnsBySheet?.[sheetName] ?? [];
  return slotColumns
    .map((column) => mappingValue(values, column))
    .filter(Boolean)
    .join(', ');
}

function mappingFirstValue(values, columns) {
  for (const column of columns) {
    const value = mappingValue(values, column);
    if (value) {
      return value;
    }
  }
  return '';
}

function mappingValue(values, column) {
  return String(values?.[column] ?? '').trim();
}

function normalizeMappingReference(value) {
  return String(value ?? '').trim().toLowerCase();
}

function isMeaningfulMappingSlot(value) {
  const slot = String(value ?? '').trim();
  return Boolean(slot) && slot !== '-' && slot.toLowerCase() !== 'n/a';
}

function mappingSearchEntries(row, categories) {
  const entries = [];

  for (const category of categories) {
    const columns = category.columnsBySheet?.[row.sheetName] ?? [];
    for (const column of columns) {
      const value = mappingValue(row.values, column);
      if (!value) {
        continue;
      }
      entries.push({
        categoryId: category.id,
        field: column,
        value
      });
    }
  }

  return entries;
}

function mappingTermMatchesValue(term, value) {
  const searchTerm = String(term ?? '').trim();
  const searchValue = String(value ?? '').trim();
  if (!searchTerm || !searchValue) {
    return false;
  }

  if (searchTerm.includes('*')) {
    const regex = new RegExp(`^${searchTerm.split('*').map(escapeRegExp).join('.*')}$`, 'i');
    return regex.test(searchValue);
  }

  return searchValue.toLowerCase().includes(searchTerm.toLowerCase());
}

function uniqueValues(values) {
  return [...new Set(values.filter(Boolean))];
}

export function formatJson(value) {
  return JSON.stringify(value, null, 2);
}

export function formatDownloadContent(item) {
  if (item?.valueKind === 'raw-string') {
    return String(item.value ?? '');
  }

  return formatJson(item?.value);
}

export function buildZipBlob(files) {
  const encoder = new TextEncoder();
  const localParts = [];
  const centralParts = [];
  let offset = 0;

  for (const file of files) {
    const filenameBytes = encoder.encode(ensureJsonExtension(file.name));
    const contentBytes = encoder.encode(String(file.content ?? ''));
    const crc = crc32(contentBytes);

    const localHeader = new Uint8Array(30);
    const localView = new DataView(localHeader.buffer);
    localView.setUint32(0, 0x04034b50, true);
    localView.setUint16(4, 20, true);
    localView.setUint16(6, 0x0800, true);
    localView.setUint16(8, 0, true);
    localView.setUint16(10, 0, true);
    localView.setUint16(12, 0, true);
    localView.setUint32(14, crc, true);
    localView.setUint32(18, contentBytes.length, true);
    localView.setUint32(22, contentBytes.length, true);
    localView.setUint16(26, filenameBytes.length, true);
    localView.setUint16(28, 0, true);

    localParts.push(localHeader, filenameBytes, contentBytes);

    const centralHeader = new Uint8Array(46);
    const centralView = new DataView(centralHeader.buffer);
    centralView.setUint32(0, 0x02014b50, true);
    centralView.setUint16(4, 20, true);
    centralView.setUint16(6, 20, true);
    centralView.setUint16(8, 0x0800, true);
    centralView.setUint16(10, 0, true);
    centralView.setUint16(12, 0, true);
    centralView.setUint16(14, 0, true);
    centralView.setUint32(16, crc, true);
    centralView.setUint32(20, contentBytes.length, true);
    centralView.setUint32(24, contentBytes.length, true);
    centralView.setUint16(28, filenameBytes.length, true);
    centralView.setUint16(30, 0, true);
    centralView.setUint16(32, 0, true);
    centralView.setUint16(34, 0, true);
    centralView.setUint16(36, 0, true);
    centralView.setUint32(38, 0, true);
    centralView.setUint32(42, offset, true);
    centralParts.push(centralHeader, filenameBytes);

    offset += localHeader.length + filenameBytes.length + contentBytes.length;
  }

  const centralSize = centralParts.reduce((total, part) => total + part.length, 0);
  const endHeader = new Uint8Array(22);
  const endView = new DataView(endHeader.buffer);
  endView.setUint32(0, 0x06054b50, true);
  endView.setUint16(4, 0, true);
  endView.setUint16(6, 0, true);
  endView.setUint16(8, files.length, true);
  endView.setUint16(10, files.length, true);
  endView.setUint32(12, centralSize, true);
  endView.setUint32(16, offset, true);
  endView.setUint16(20, 0, true);

  return new Blob([...localParts, ...centralParts, endHeader], {
    type: 'application/zip'
  });
}

function crc32(bytes) {
  let crc = 0xffffffff;

  for (const byte of bytes) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) {
      crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
    }
  }

  return (crc ^ 0xffffffff) >>> 0;
}
