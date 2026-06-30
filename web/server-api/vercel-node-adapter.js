export function createNodeCompatibleHandler(fetchHandler) {
  async function handler(request, response) {
    if (request instanceof Request && !response) {
      return fetchHandler(request);
    }

    const fetchRequest = await toFetchRequest(request);
    const fetchResponse = await fetchHandler(fetchRequest);
    return sendNodeResponse(response, fetchResponse);
  }

  handler.fetch = fetchHandler;
  return handler;
}

async function toFetchRequest(request) {
  const headers = new Headers();
  for (const [key, value] of Object.entries(request.headers ?? {})) {
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
  const host = headers.get('host') ?? 'localhost';
  const url = String(request.url ?? '/').startsWith('http')
    ? String(request.url)
    : `https://${host}${request.url ?? '/'}`;

  return new Request(url, {
    body,
    headers,
    method
  });
}

async function readRawBody(request) {
  const chunks = [];
  for await (const chunk of request) {
    chunks.push(typeof chunk === 'string' ? Buffer.from(chunk, 'utf8') : chunk);
  }
  return Buffer.concat(chunks).toString('utf-8');
}

async function sendNodeResponse(response, fetchResponse) {
  if (!response) {
    return fetchResponse;
  }

  response.statusCode = fetchResponse.status;
  fetchResponse.headers.forEach((value, key) => {
    response.setHeader(key, value);
  });
  response.end(Buffer.from(await fetchResponse.arrayBuffer()));
  return undefined;
}
