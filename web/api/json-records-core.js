import { createHash } from 'node:crypto';
import { requireAdminKey } from './admin-auth.js';
import {
  createExplorerItem,
  parseUploadedJsonContent
} from '../public/core.js';

const MAX_IMPORT_FILES = 500;
const MAX_IMPORT_FILE_BYTES = 2 * 1024 * 1024;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function buildJsonRecordFromUpload({ countryRegion = '', filename = '', language = '', text = '' } = {}) {
  const sourceFilename = sanitizeSourceFilename(filename);
  const sourceText = String(text ?? '');
  const selectedLanguage = sanitizeImportLanguage(language);
  const selectedCountryRegion = sanitizeCountryRegion(countryRegion);
  const parsed = parseUploadedJsonContent(sourceFilename, sourceText);
  const explorerItem = createExplorerItem({
    id: 1,
    sourceFilename,
    value: parsed.value,
    valueKind: parsed.valueKind,
    warning: parsed.warning ?? ''
  });
  const valueKind = parsed.valueKind === 'raw-string' ? 'raw-string' : 'json';
  const rawJson = valueKind === 'json' ? parsed.value : null;
  const rawText = valueKind === 'raw-string' ? sourceText : '';
  const resolvedLanguage = selectedLanguage || explorerItem.language;
  const hashSource = valueKind === 'json'
    ? JSON.stringify(parsed.value)
    : sourceText;

  return {
    contentHash: sha256(JSON.stringify({
      countryRegion: selectedCountryRegion,
      language: resolvedLanguage,
      datasetScopedValue: hashSource
    })),
    contentType: explorerItem.contentType,
    countryRegion: selectedCountryRegion,
    language: resolvedLanguage,
    rawJson,
    rawText,
    recognitionText: explorerItem.recognitionText,
    slotSummary: explorerItem.slotSummary,
    sourceFilename,
    tableVersion: explorerItem.tableVersion,
    valueKind,
    warning: parsed.warning ?? ''
  };
}

export function normalizeJsonImportPayload(payload = {}) {
  const files = Array.isArray(payload.files) ? payload.files : [];
  const datasetId = String(payload.datasetId ?? '').trim();
  const countryRegion = sanitizeCountryRegion(payload.countryRegion);
  const language = sanitizeImportLanguage(payload.language);
  if (!datasetId) {
    throw httpError(400, 'datasetId is required.');
  }
  assertValidDatasetId(datasetId);
  if (!countryRegion) {
    throw httpError(400, 'countryRegion is required.');
  }
  if (files.length === 0) {
    throw httpError(400, '업로드할 JSON 파일이 없습니다.');
  }
  if (files.length > MAX_IMPORT_FILES) {
    throw httpError(413, `한 번에 최대 ${MAX_IMPORT_FILES}개 파일까지만 업로드할 수 있습니다.`);
  }

  const records = files.map((file, index) => {
    const filename = sanitizeSourceFilename(file?.filename || `upload_${index + 1}.json`);
    const text = String(file?.text ?? '');
    if (byteLength(text) > MAX_IMPORT_FILE_BYTES) {
      throw httpError(413, `${filename}: 파일 크기가 너무 큽니다.`);
    }
    return buildJsonRecordFromUpload({ countryRegion, filename, language, text });
  });

  return {
    countryRegion,
    datasetId,
    records
  };
}

export async function handleJsonRecordsRequest(request, { repository } = {}) {
  if (request.method !== 'GET') {
    return jsonResponse({ error: 'Method not allowed.' }, 405);
  }

  const url = new URL(request.url);
  const datasetId = String(url.searchParams.get('datasetId') ?? '').trim();
  if (datasetId && !isUuidLike(datasetId)) {
    return jsonResponse({ error: 'datasetId must be a valid UUID.' }, 400);
  }
  const countryRegion = sanitizeCountryRegion(
    url.searchParams.get('country') ?? url.searchParams.get('countryRegion')
  );
  const query = url.searchParams.get('q') ?? '';
  const limit = clampInteger(url.searchParams.get('limit'), 1, 200, 50);
  const offset = clampInteger(url.searchParams.get('offset'), 0, 100000, 0);
  const repo = await ensureRepository(repository);
  if (repo instanceof Response) {
    return repo;
  }

  const result = await repo.searchRecords({ countryRegion, datasetId, limit, offset, query });

  return jsonResponse({
    records: (result.records ?? []).map(rowToPublicRecord),
    total: Number(result.total ?? result.records?.length ?? 0)
  });
}

export async function handleJsonCountriesRequest(request, { repository } = {}) {
  if (request.method !== 'GET') {
    return jsonResponse({ error: 'Method not allowed.' }, 405);
  }

  const datasetId = String(new URL(request.url).searchParams.get('datasetId') ?? '').trim();
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
    countries: await repo.listCountries(datasetId)
  });
}

export async function handleJsonRecordDetailRequest(request, { id, repository } = {}) {
  if (request.method !== 'GET') {
    return jsonResponse({ error: 'Method not allowed.' }, 405);
  }
  const repo = await ensureRepository(repository);
  if (repo instanceof Response) {
    return repo;
  }

  const record = await repo.getRecordById(id);
  if (!record) {
    return jsonResponse({ error: 'JSON record not found.' }, 404);
  }

  return jsonResponse({
    record: rowToRecordDetail(record)
  });
}

export async function handleAdminStatusRequest(request, { env = process.env, repository } = {}) {
  const adminError = requireAdminKey(request, env);
  if (adminError) {
    return adminError;
  }
  if (request.method !== 'GET') {
    return jsonResponse({ error: 'Method not allowed.' }, 405);
  }
  const repo = await ensureRepository(repository);
  if (repo instanceof Response) {
    return repo;
  }

  return jsonResponse({
    status: await repo.getStatus()
  });
}

export async function handleAdminImportRequest(request, { env = process.env, repository } = {}) {
  const adminError = requireAdminKey(request, env);
  if (adminError) {
    return adminError;
  }
  if (request.method !== 'POST') {
    return jsonResponse({ error: 'Method not allowed.' }, 405);
  }

  try {
    const payload = normalizeJsonImportPayload(await readRequestJson(request));
    const repo = await ensureRepository(repository);
    if (repo instanceof Response) {
      return repo;
    }
    return jsonResponse(await repo.importRecords(payload));
  } catch (error) {
    return jsonResponse({
      error: error instanceof Error ? error.message : String(error)
    }, error?.status ?? 400);
  }
}

export async function handleAdminRecordDeleteRequest(request, { env = process.env, id, repository } = {}) {
  const adminError = requireAdminKey(request, env);
  if (adminError) {
    return adminError;
  }
  if (request.method !== 'DELETE') {
    return jsonResponse({ error: 'Method not allowed.' }, 405);
  }
  const repo = await ensureRepository(repository);
  if (repo instanceof Response) {
    return repo;
  }

  return jsonResponse(await repo.deleteRecord(id));
}

export async function handleAdminBatchDeleteRequest(request, { env = process.env, id, repository } = {}) {
  const adminError = requireAdminKey(request, env);
  if (adminError) {
    return adminError;
  }
  if (request.method !== 'DELETE') {
    return jsonResponse({ error: 'Method not allowed.' }, 405);
  }
  const repo = await ensureRepository(repository);
  if (repo instanceof Response) {
    return repo;
  }

  return jsonResponse(await repo.deleteBatch(id));
}

export function rowToPublicRecord(row = {}) {
  return {
    batchId: row.batch_id ?? row.batchId ?? '',
    contentType: row.content_type ?? row.contentType ?? '',
    createdAt: row.created_at ?? row.createdAt ?? '',
    countryRegion: row.country_region ?? row.countryRegion ?? '',
    datasetId: row.dataset_id ?? row.datasetId ?? '',
    id: row.id ?? '',
    language: row.language ?? '',
    recognitionText: row.recognition_text ?? row.recognitionText ?? '',
    slotSummary: row.slot_summary ?? row.slotSummary ?? '',
    sourceFilename: row.source_filename ?? row.sourceFilename ?? '',
    tableVersion: row.table_version ?? row.tableVersion ?? '',
    valueKind: row.value_kind ?? row.valueKind ?? 'json'
  };
}

export function rowToRecordDetail(row = {}) {
  return {
    ...rowToPublicRecord(row),
    rawJson: row.raw_json ?? row.rawJson ?? null,
    rawText: row.raw_text ?? row.rawText ?? ''
  };
}

function sanitizeSourceFilename(filename) {
  const value = String(filename ?? '').trim();
  return value || 'upload.json';
}

function sanitizeImportLanguage(language) {
  return String(language ?? '').trim().slice(0, 64);
}

function sanitizeCountryRegion(countryRegion) {
  return String(countryRegion ?? '').trim().slice(0, 64);
}

function sha256(value) {
  return createHash('sha256').update(String(value ?? ''), 'utf8').digest('hex');
}

function byteLength(value) {
  return Buffer.byteLength(String(value ?? ''), 'utf8');
}

export function httpError(status, message) {
  const error = new Error(message);
  error.status = status;
  return error;
}

function assertValidDatasetId(datasetId) {
  if (!isUuidLike(datasetId)) {
    throw httpError(400, 'datasetId must be a valid UUID.');
  }
}

function isUuidLike(value) {
  return UUID_PATTERN.test(String(value ?? '').trim());
}

export function jsonResponse(payload, status = 200) {
  return new Response(JSON.stringify(payload), {
    headers: {
      'Content-Type': 'application/json; charset=utf-8'
    },
    status
  });
}

async function readRequestJson(request) {
  const text = await request.text();
  if (!text.trim()) {
    return {};
  }
  return JSON.parse(text);
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

function clampInteger(value, min, max, fallback) {
  const number = Number.parseInt(value, 10);
  if (!Number.isFinite(number)) {
    return fallback;
  }
  return Math.min(max, Math.max(min, number));
}
