import { requireAdminKey } from './admin-auth.js';

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function handleStringResourceRowsRequest(request, { repository } = {}) {
  if (request.method !== 'GET') {
    return jsonResponse({ error: 'Method not allowed.' }, 405);
  }

  const url = new URL(request.url);
  const datasetId = String(url.searchParams.get('datasetId') ?? '').trim();
  if (!datasetId) {
    return jsonResponse({ error: 'datasetId is required.' }, 400);
  }
  if (!isUuidLike(datasetId)) {
    return jsonResponse({ error: 'datasetId must be a valid UUID.' }, 400);
  }

  const query = url.searchParams.get('q') ?? '';
  const limit = clampInteger(url.searchParams.get('limit'), 1, 500, 50);
  const offset = clampInteger(url.searchParams.get('offset'), 0, 100000, 0);
  const repo = await ensureRepository(repository);
  if (repo instanceof Response) {
    return repo;
  }

  const result = await repo.searchRows({ datasetId, limit, offset, query });

  return jsonResponse({
    rows: result.rows ?? [],
    total: Number(result.total ?? result.rows?.length ?? 0)
  });
}

export async function handleStringResourceLocalesRequest(request, { repository } = {}) {
  if (request.method !== 'GET') {
    return jsonResponse({ error: 'Method not allowed.' }, 405);
  }

  const url = new URL(request.url);
  const datasetId = String(url.searchParams.get('datasetId') ?? '').trim();
  if (!datasetId) {
    return jsonResponse({ error: 'datasetId is required.' }, 400);
  }
  if (!isUuidLike(datasetId)) {
    return jsonResponse({ error: 'datasetId must be a valid UUID.' }, 400);
  }

  const repo = await ensureRepository(repository);
  if (repo instanceof Response) {
    return repo;
  }

  return jsonResponse({
    locales: await repo.listLocales(datasetId)
  });
}

export async function handleStringResourceDetailRequest(request, { id = '', repository } = {}) {
  if (request.method !== 'GET') {
    return jsonResponse({ error: 'Method not allowed.' }, 405);
  }

  const rowId = String(id ?? '').trim();
  if (!rowId) {
    return jsonResponse({ error: 'id is required.' }, 400);
  }

  const repo = await ensureRepository(repository);
  if (repo instanceof Response) {
    return repo;
  }

  const row = await repo.getRowById(rowId);
  if (!row) {
    return jsonResponse({ error: 'String resource row not found.' }, 404);
  }

  return jsonResponse({ row });
}

export async function handleAdminStringResourcesImportRequest(request, { env = process.env, repository } = {}) {
  const adminError = requireAdminKey(request, env);
  if (adminError) {
    return adminError;
  }
  if (request.method !== 'POST') {
    return jsonResponse({ error: 'Method not allowed.' }, 405);
  }

  try {
    const payload = normalizeStringResourcesImportPayload(await readRequestJson(request));
    const repo = await ensureRepository(repository);
    if (repo instanceof Response) {
      return repo;
    }
    return jsonResponse(await repo.importRows(payload));
  } catch (error) {
    return jsonResponse({
      error: error instanceof Error ? error.message : String(error)
    }, error?.status ?? 400);
  }
}

export function normalizeStringResourcesImportPayload(payload = {}) {
  const datasetId = String(payload.datasetId ?? '').trim();
  if (!datasetId) {
    throw httpError(400, 'datasetId is required.');
  }
  if (!isUuidLike(datasetId)) {
    throw httpError(400, 'datasetId must be a valid UUID.');
  }

  const rows = Array.isArray(payload.rows) ? payload.rows : [];
  if (rows.length === 0) {
    throw httpError(400, 'rows must be a non-empty array.');
  }

  return {
    datasetId,
    rows: rows.map(normalizeStringResourceRow),
    summary: isRecord(payload.summary) ? payload.summary : {}
  };
}

export function jsonResponse(payload, status = 200) {
  return new Response(JSON.stringify(payload), {
    headers: {
      'Content-Type': 'application/json; charset=utf-8'
    },
    status
  });
}

function normalizeStringResourceRow(row = {}) {
  const localeValues = recordField(row.languages ?? row.localeValues);
  const sourceFilename = stringField(row.sourceFilename ?? row.fileName);

  return {
    id: stringField(row.id),
    datasetId: stringField(row.datasetId),
    fileName: stringField(row.fileName ?? row.sourceFilename),
    sourceFilename,
    sheetName: stringField(row.sheetName),
    rowNumber: numberOrZero(row.rowNumber),
    resourceId: stringField(row.resourceId),
    idFields: recordField(row.idFields),
    languages: localeValues,
    localeValues,
    duplicateLanguages: recordField(row.duplicateLanguages),
    metadata: recordField(row.metadata),
    originalValues: recordField(row.originalValues ?? row.rawRow)
  };
}

async function ensureRepository(repository) {
  const repo = typeof repository === 'function'
    ? await repository()
    : await repository;

  if (!repo) {
    return jsonResponse({ error: 'DATABASE_URL is not configured.' }, 503);
  }
  return repo;
}

async function readRequestJson(request) {
  const text = await request.text();
  if (!text.trim()) {
    return {};
  }
  return JSON.parse(text);
}

function clampInteger(value, min, max, fallback) {
  const number = Number.parseInt(value, 10);
  if (!Number.isFinite(number)) {
    return fallback;
  }
  return Math.min(max, Math.max(min, number));
}

function httpError(status, message) {
  const error = new Error(message);
  error.status = status;
  return error;
}

function isUuidLike(value) {
  return UUID_PATTERN.test(String(value ?? '').trim());
}

function recordField(value) {
  return isRecord(value) ? value : {};
}

function isRecord(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function numberOrZero(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
}

function stringField(value) {
  return String(value ?? '').trim();
}
