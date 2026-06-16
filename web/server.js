import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { createReadStream } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { translateFilenameText } from './api/translate-filename.js';

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

export function createAppServer() {
  return createServer(async (request, response) => {
    try {
      if (request.method === 'POST' && getPathname(request) === '/api/translate-filename') {
        await handleTranslateFilename(request, response);
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
  const relativeUrl = pathname === '/' ? 'index.html' : pathname.replace(/^\/+/, '').replace(/^public\//, '');
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
