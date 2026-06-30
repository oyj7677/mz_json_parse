import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { createReadStream } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { translateFilenameText } from './api/translate-filename.js';
import {
  handleAdminBatchDeleteRequest,
  handleAdminImportRequest,
  handleAdminRecordDeleteRequest,
  handleAdminStatusRequest,
  handleJsonCountriesRequest,
  handleJsonRecordDetailRequest,
  handleJsonRecordsRequest
} from './api/json-records-core.js';
import { getJsonRecordsRepository } from './api/json-records-repository.js';
import {
  handleActiveDatasetRequest,
  handleAdminDatasetActiveRequest,
  handleAdminDatasetDeleteRequest,
  handleAdminDatasetsRequest,
  handleDatasetsRequest
} from './api/datasets-core.js';
import { getDatasetsRepository } from './api/datasets-repository.js';
import { normalizeToolRoute } from './public/routes.js';

export {
  buildGoogleTranslateUrl,
  extractGoogleTranslateText,
  translateFilenameText
} from './api/translate-filename.js';

const rootDir = path.dirname(fileURLToPath(import.meta.url));
const publicDir = path.join(rootDir, 'public');

const MIME_TYPES = {
  '.css': 'text/css; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.map': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml'
};

export function createAppServer({
  datasetsRepository,
  env = process.env,
  jsonRecordsRepository
} = {}) {
  return createServer(async (request, response) => {
    try {
      if (request.method === 'POST' && getPathname(request) === '/api/translate-filename') {
        await handleTranslateFilename(request, response);
        return;
      }

      if (await handleJsonRecordsApi(request, response, { env, jsonRecordsRepository })) {
        return;
      }

      if (await handleDatasetsApi(request, response, { datasetsRepository, env })) {
        return;
      }

      if (request.method !== 'GET' && request.method !== 'HEAD') {
        sendJson(response, 405, { error: 'Method not allowed.' });
        return;
      }

      await serveStatic(request, response);
    } catch (error) {
      sendJson(response, 500, {
        error: error instanceof Error ? error.message : String(error)
      });
    }
  });
}

export function startServer({
  port = Number(process.env.PORT ?? 3000),
  host = process.env.HOST ?? '127.0.0.1'
} = {}) {
  const server = createAppServer();
  server.listen(port, host, () => {
    console.log(`JSON formatter running at http://localhost:${port}`);
  });
  return server;
}

async function handleTranslateFilename(request, response) {
  const body = await readJsonBody(request);
  const result = await translateFilenameText(body.text);

  if (!result.ok) {
    sendJson(response, result.status, {
      error: result.error
    });
    return;
  }

  sendJson(response, 200, {
    translatedText: result.translatedText
  });
}

async function handleJsonRecordsApi(request, response, { env, jsonRecordsRepository }) {
  const pathname = getPathname(request);
  let apiResponse;

  if (pathname === '/api/json-countries') {
    const repository = jsonRecordsRepository ?? (() => getJsonRecordsRepository(env));
    const apiRequest = await toFetchRequest(request);
    apiResponse = await handleJsonCountriesRequest(apiRequest, { repository });
  } else if (pathname === '/api/json-records') {
    const repository = jsonRecordsRepository ?? (() => getJsonRecordsRepository(env));
    const apiRequest = await toFetchRequest(request);
    apiResponse = await handleJsonRecordsRequest(apiRequest, { repository });
  } else if (pathname.startsWith('/api/json-records/')) {
    const repository = jsonRecordsRepository ?? (() => getJsonRecordsRepository(env));
    const apiRequest = await toFetchRequest(request);
    apiResponse = await handleJsonRecordDetailRequest(apiRequest, {
      id: decodeURIComponent(pathname.replace('/api/json-records/', '')),
      repository
    });
  } else if (pathname === '/api/admin/json-records/status') {
    const repository = jsonRecordsRepository ?? (() => getJsonRecordsRepository(env));
    const apiRequest = await toFetchRequest(request);
    apiResponse = await handleAdminStatusRequest(apiRequest, { env, repository });
  } else if (pathname === '/api/admin/json-records/import') {
    const repository = jsonRecordsRepository ?? (() => getJsonRecordsRepository(env));
    const apiRequest = await toFetchRequest(request);
    apiResponse = await handleAdminImportRequest(apiRequest, { env, repository });
  } else if (pathname.startsWith('/api/admin/json-records/')) {
    const repository = jsonRecordsRepository ?? (() => getJsonRecordsRepository(env));
    const apiRequest = await toFetchRequest(request);
    apiResponse = await handleAdminRecordDeleteRequest(apiRequest, {
      env,
      id: decodeURIComponent(pathname.replace('/api/admin/json-records/', '')),
      repository
    });
  } else if (pathname.startsWith('/api/admin/json-batches/')) {
    const repository = jsonRecordsRepository ?? (() => getJsonRecordsRepository(env));
    const apiRequest = await toFetchRequest(request);
    apiResponse = await handleAdminBatchDeleteRequest(apiRequest, {
      env,
      id: decodeURIComponent(pathname.replace('/api/admin/json-batches/', '')),
      repository
    });
  } else {
    return false;
  }

  await sendFetchResponse(response, apiResponse);
  return true;
}

async function handleDatasetsApi(request, response, { datasetsRepository, env }) {
  const pathname = getPathname(request);
  let apiResponse;

  if (pathname === '/api/datasets') {
    const repository = datasetsRepository ?? await getDatasetsRepository(env);
    const apiRequest = await toFetchRequest(request);
    apiResponse = await handleDatasetsRequest(apiRequest, { repository });
  } else if (pathname === '/api/datasets/active') {
    const repository = datasetsRepository ?? await getDatasetsRepository(env);
    const apiRequest = await toFetchRequest(request);
    apiResponse = await handleActiveDatasetRequest(apiRequest, { repository });
  } else if (pathname === '/api/admin/datasets') {
    const repository = datasetsRepository ?? (() => getDatasetsRepository(env));
    const apiRequest = await toFetchRequest(request);
    apiResponse = await handleAdminDatasetsRequest(apiRequest, { env, repository });
  } else if (isAdminDatasetActivePath(pathname)) {
    const repository = datasetsRepository ?? (() => getDatasetsRepository(env));
    const apiRequest = await toFetchRequest(request);
    apiResponse = await handleAdminDatasetActiveRequest(apiRequest, {
      env,
      id: routeSegment(pathname, -2),
      repository
    });
  } else if (isAdminDatasetDetailPath(pathname)) {
    const repository = datasetsRepository ?? (() => getDatasetsRepository(env));
    const apiRequest = await toFetchRequest(request);
    apiResponse = await handleAdminDatasetDeleteRequest(apiRequest, {
      env,
      id: routeSegment(pathname, -1),
      repository
    });
  } else {
    return false;
  }

  await sendFetchResponse(response, apiResponse);
  return true;
}

async function toFetchRequest(request) {
  const headers = new Headers();
  for (const [key, value] of Object.entries(request.headers)) {
    if (Array.isArray(value)) {
      headers.set(key, value.join(', '));
    } else if (value !== undefined) {
      headers.set(key, value);
    }
  }

  const method = request.method ?? 'GET';
  const body = method === 'GET' || method === 'HEAD'
    ? undefined
    : await readRawBody(request);

  return new Request(`http://localhost${request.url ?? '/'}`, {
    body,
    headers,
    method
  });
}

async function readRawBody(request) {
  const chunks = [];
  for await (const chunk of request) {
    chunks.push(chunk);
  }
  return Buffer.concat(chunks).toString('utf-8');
}

async function sendFetchResponse(response, fetchResponse) {
  const headers = {};
  fetchResponse.headers.forEach((value, key) => {
    headers[key] = value;
  });
  response.writeHead(fetchResponse.status, headers);
  response.end(await fetchResponse.text());
}

async function readJsonBody(request) {
  const chunks = [];
  for await (const chunk of request) {
    chunks.push(chunk);
  }

  const rawBody = Buffer.concat(chunks).toString('utf-8');
  if (!rawBody.trim()) {
    return {};
  }

  return JSON.parse(rawBody);
}

async function serveStatic(request, response) {
  const pathname = getPathname(request);
  const route = normalizeToolRoute(pathname);
  const relativeUrl = pathname === '/' || route.tool !== 'hub'
    ? 'index.html'
    : pathname.replace(/^\/+/, '').replace(/^public\//, '');
  const filePath = path.normalize(path.join(publicDir, relativeUrl));
  const relativePath = path.relative(publicDir, filePath);

  if (relativePath.startsWith('..') || path.isAbsolute(relativePath)) {
    sendJson(response, 403, { error: 'Forbidden.' });
    return;
  }

  try {
    await readFile(filePath);
  } catch {
    sendJson(response, 404, { error: 'Not found.' });
    return;
  }

  response.writeHead(200, {
    'Content-Type': MIME_TYPES[path.extname(filePath)] ?? 'application/octet-stream'
  });

  if (request.method === 'HEAD') {
    response.end();
    return;
  }

  createReadStream(filePath).pipe(response);
}

function getPathname(request) {
  return new URL(request.url ?? '/', 'http://localhost').pathname;
}

function isAdminDatasetActivePath(pathname) {
  const segments = pathname.split('/').filter(Boolean);
  return segments.length === 5 &&
    segments[0] === 'api' &&
    segments[1] === 'admin' &&
    segments[2] === 'datasets' &&
    segments[4] === 'active';
}

function isAdminDatasetDetailPath(pathname) {
  const segments = pathname.split('/').filter(Boolean);
  return segments.length === 4 &&
    segments[0] === 'api' &&
    segments[1] === 'admin' &&
    segments[2] === 'datasets';
}

function routeSegment(pathname, offsetFromEnd) {
  return decodeURIComponent(pathname.split('/').filter(Boolean).at(offsetFromEnd) ?? '');
}

function sendJson(response, status, payload) {
  response.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8'
  });
  response.end(JSON.stringify(payload));
}

const isMainModule = process.argv[1]
  ? import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href
  : false;

if (isMainModule) {
  startServer();
}
