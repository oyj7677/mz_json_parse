export const STRING_RESOURCE_DEFAULT_QUALIFIERS = [
  'ko',
  'en-rUS',
  'en-rGB',
  'en-rAU',
  'es-rMX',
  'es-rES',
  'fr-rCA',
  'pt-rBR',
  'zh-rCN'
];

const LANGUAGE_HEADER_QUALIFIERS = new Map([
  ['korean', 'ko'],
  ['english us', 'en-rUS'],
  ['english usa', 'en-rUS'],
  ['english united states', 'en-rUS'],
  ['english uk', 'en-rGB'],
  ['english gb', 'en-rGB'],
  ['english au', 'en-rAU'],
  ['english australia', 'en-rAU'],
  ['spanish mexico', 'es-rMX'],
  ['spanish spain', 'es-rES'],
  ['french canada', 'fr-rCA'],
  ['portuguese brazil', 'pt-rBR'],
  ['chinese simplified china', 'zh-rCN']
]);

const ID_COLUMN_NAMES = new Set([
  'id',
  'lid',
  'uid',
  'mobis lid',
  'hmc uid',
  'promptlid',
  'checklid',
  'resource id',
  'string id'
]);

const HISTORY_SHEET_NAME = /(^|[^a-z0-9])(history|hist|revision|change[ -_]?log|version)([^a-z0-9]|$)/i;
const AND_SEPARATOR = ',';
const OR_SEPARATOR = '|';

function normalizeHeaderText(value) {
  return String(value ?? '')
    .replace(/[_-]+/g, ' ')
    .replace(/[()\[\],]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

function normalizeAndroidQualifier(value) {
  const text = String(value ?? '').trim();
  const match = text.match(/^([a-z]{2,3})(?:-r([a-z]{2}))?$/i);

  if (!match) {
    return '';
  }

  const language = match[1].toLowerCase();
  const region = match[2] ? '-r' + match[2].toUpperCase() : '';
  return language + region;
}

function getSheetRows(sheet) {
  return Array.isArray(sheet?.rows) ? sheet.rows : [];
}

function getRowValues(row) {
  return row?.values && typeof row.values === 'object' ? row.values : {};
}

function getColumnNames(sheet) {
  const columns = [];
  const seen = new Set();

  for (const row of getSheetRows(sheet)) {
    for (const column of Object.keys(getRowValues(row))) {
      if (!seen.has(column)) {
        seen.add(column);
        columns.push(column);
      }
    }
  }

  return columns;
}

function isBlank(value) {
  return String(value ?? '').trim() === '';
}

function stringValue(value) {
  return String(value ?? '').trim();
}

function isHeaderRow(row, summary) {
  const values = getRowValues(row);
  const importantColumns = [...summary.idColumns, ...summary.languageColumns.map((column) => column.name)];
  let matches = 0;

  for (const column of importantColumns) {
    const value = normalizeHeaderText(values[column]);
    const header = normalizeHeaderText(column);
    const qualifier = summary.languageColumns.find((languageColumn) => languageColumn.name === column)?.qualifier ?? '';

    if (value && (value === header || value === normalizeHeaderText(qualifier))) {
      matches += 1;
    }
  }

  return matches >= Math.max(2, Math.ceil(importantColumns.length / 2));
}

function hasUsableResourceId(row, idColumns) {
  const values = getRowValues(row);
  return idColumns.some((column) => !isBlank(values[column]) && normalizeHeaderText(values[column]) !== normalizeHeaderText(column));
}

function buildSearchText(row) {
  const values = [
    row?.resourceId,
    row?.id,
    row?.fileName,
    row?.sheetName,
    row?.rowNumber,
    ...Object.values(row?.idFields ?? {}),
    ...Object.values(row?.languages ?? {}),
    ...Object.values(row?.metadata ?? {})
  ];

  return values.map((value) => String(value ?? '').toLowerCase()).join('\n');
}

function escapeRegExp(value) {
  return String(value).replace(/[|\\{}()[\]^$+?.]/g, '\\$&');
}

function tokenMatches(row, token) {
  const text = buildSearchText(row);
  const normalizedToken = token.trim().toLowerCase();

  if (!normalizedToken) {
    return true;
  }

  if (normalizedToken.includes('*')) {
    const pattern = escapeRegExp(normalizedToken).replace(/\*/g, '.*');
    return new RegExp(pattern, 'i').test(text);
  }

  return text.includes(normalizedToken);
}

export function normalizeStringResourceQualifier(header) {
  const rawHeader = String(header ?? '').trim();
  const valuesMatch = rawHeader.match(/^values[-_ ]+(.+)$/i);

  if (valuesMatch) {
    return normalizeAndroidQualifier(valuesMatch[1]);
  }

  const normalizedHeader = normalizeHeaderText(rawHeader);
  return LANGUAGE_HEADER_QUALIFIERS.get(normalizedHeader) ?? '';
}

export function detectStringResourceSheet(sheet) {
  const name = String(sheet?.name ?? '');
  const columns = getColumnNames(sheet);
  const idColumns = columns.filter((column) => ID_COLUMN_NAMES.has(normalizeHeaderText(column)));
  const languageColumns = columns
    .map((column) => ({ name: column, qualifier: normalizeStringResourceQualifier(column) }))
    .filter((column) => column.qualifier);
  const rowCount = getSheetRows(sheet).length;
  const isHistoryLike = HISTORY_SHEET_NAME.test(normalizeHeaderText(name));

  return {
    name,
    idColumns,
    languageColumns,
    isCandidate: !isHistoryLike && idColumns.length > 0 && languageColumns.length > 0,
    rowCount
  };
}

export function normalizeStringResourceWorkbook(workbook, fileName = workbook?.source ?? '') {
  const resolvedFileName = String(fileName || workbook?.source || '');
  const rows = [];
  const sheetSummaries = [];

  for (const sheet of workbook?.sheets ?? []) {
    const summary = detectStringResourceSheet(sheet);
    sheetSummaries.push(summary);

    if (!summary.isCandidate) {
      continue;
    }

    for (const sourceRow of getSheetRows(sheet)) {
      if (isHeaderRow(sourceRow, summary) || !hasUsableResourceId(sourceRow, summary.idColumns)) {
        continue;
      }

      const values = getRowValues(sourceRow);
      const idFields = {};
      const languages = {};
      const languageSources = {};
      const duplicateLanguages = {};
      const metadata = {};

      for (const column of summary.idColumns) {
        const value = stringValue(values[column]);
        if (value && normalizeHeaderText(value) !== normalizeHeaderText(column)) {
          idFields[column] = value;
        }
      }

      for (const column of summary.languageColumns) {
        const value = stringValue(values[column.name]);
        if (!value || normalizeHeaderText(value) === normalizeHeaderText(column.name)) {
          continue;
        }

        if (Object.prototype.hasOwnProperty.call(languages, column.qualifier)) {
          duplicateLanguages[column.qualifier] = duplicateLanguages[column.qualifier] ?? [languageSources[column.qualifier]];
          duplicateLanguages[column.qualifier].push({ column: column.name, value });
        } else {
          languages[column.qualifier] = value;
          languageSources[column.qualifier] = { column: column.name, value };
        }
      }

      for (const [column, value] of Object.entries(values)) {
        const isIdColumn = summary.idColumns.includes(column);
        const isLanguageColumn = summary.languageColumns.some((languageColumn) => languageColumn.name === column);
        const text = stringValue(value);

        if (!isIdColumn && !isLanguageColumn && text && normalizeHeaderText(text) !== normalizeHeaderText(column)) {
          metadata[column] = text;
        }
      }

      const resourceId = Object.values(idFields).find((value) => value) ?? '';
      const rowNumber = sourceRow?.rowNumber ?? rows.length + 1;

      rows.push({
        id: resolvedFileName + ':' + summary.name + ':' + rowNumber,
        fileName: resolvedFileName,
        sheetName: summary.name,
        rowNumber,
        resourceId,
        idFields,
        languages,
        duplicateLanguages,
        metadata,
        originalValues: { ...values }
      });
    }
  }

  return { fileName: resolvedFileName, rows, sheetSummaries };
}

export function resolveStringResourceQualifiers(rows) {
  const detected = new Set();

  for (const row of rows ?? []) {
    for (const qualifier of Object.keys(row?.languages ?? {})) {
      detected.add(qualifier);
    }
  }

  const fixed = STRING_RESOURCE_DEFAULT_QUALIFIERS.filter((qualifier) => detected.has(qualifier));
  const extras = [...detected]
    .filter((qualifier) => !STRING_RESOURCE_DEFAULT_QUALIFIERS.includes(qualifier))
    .sort((left, right) => left.localeCompare(right));

  return [...fixed, ...extras];
}

export function orderStringResourceQualifiers(qualifiers) {
  const detected = new Set(qualifiers ?? []);
  const fixed = STRING_RESOURCE_DEFAULT_QUALIFIERS.filter((qualifier) => detected.has(qualifier));
  const extras = [...detected]
    .filter((qualifier) => !STRING_RESOURCE_DEFAULT_QUALIFIERS.includes(qualifier))
    .sort((left, right) => left.localeCompare(right));

  return [...fixed, ...extras];
}

export function resolveStringResourceVisibleQualifierState({
  availableQualifiers = [],
  hiddenQualifiers = [],
  visibleQualifiers = []
} = {}) {
  const visible = new Set(visibleQualifiers);
  const hidden = new Set(hiddenQualifiers);

  for (const qualifier of availableQualifiers) {
    if (!hidden.has(qualifier)) {
      visible.add(qualifier);
    }
  }

  return {
    hiddenQualifiers: orderStringResourceQualifiers(hidden),
    visibleQualifiers: orderStringResourceQualifiers(visible)
  };
}

export function toggleStringResourceVisibleQualifier({
  hiddenQualifiers = [],
  visibleQualifiers = []
} = {}, qualifier) {
  const visible = new Set(visibleQualifiers);
  const hidden = new Set(hiddenQualifiers);

  if (visible.has(qualifier)) {
    visible.delete(qualifier);
    hidden.add(qualifier);
  } else {
    visible.add(qualifier);
    hidden.delete(qualifier);
  }

  return {
    hiddenQualifiers: orderStringResourceQualifiers(hidden),
    visibleQualifiers: orderStringResourceQualifiers(visible)
  };
}

export function filterStringResourceRows(rows, query) {
  const sourceRows = Array.isArray(rows) ? rows : [];
  const groups = String(query ?? '')
    .split(AND_SEPARATOR)
    .map((group) => group.trim())
    .filter(Boolean);

  if (groups.length === 0) {
    return sourceRows;
  }

  return sourceRows.filter((row) =>
    groups.every((group) =>
      group
        .split(OR_SEPARATOR)
        .map((token) => token.trim())
        .filter(Boolean)
        .some((token) => tokenMatches(row, token))
    )
  );
}
