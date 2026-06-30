const DEFAULT_ADMIN_KEY = '1313';
const SUPPORTED_TOOL_TYPES = new Set([
  'json',
  'mapping_table',
  'string_resource'
]);

export async function handleDatasetsRequest(request, { repository } = {}) {
  if (request.method !== 'GET') {
    return methodNotAllowedResponse();
  }

  const toolType = getToolTypeFromUrl(request.url);
  if (!toolType) {
    return invalidToolTypeResponse();
  }

  const repo = ensureRepository(repository);
  if (repo instanceof Response) {
    return repo;
  }

  return jsonResponse({
    datasets: await repo.listDatasets(toolType)
  });
}

export async function handleActiveDatasetRequest(request, { repository } = {}) {
  if (request.method !== 'GET') {
    return methodNotAllowedResponse();
  }

  const toolType = getToolTypeFromUrl(request.url);
  if (!toolType) {
    return invalidToolTypeResponse();
  }

  const repo = ensureRepository(repository);
  if (repo instanceof Response) {
    return repo;
  }

  return jsonResponse({
    dataset: await repo.getActiveDataset(toolType) ?? null
  });
}

export async function handleAdminDatasetsRequest(request, { env = process.env, repository } = {}) {
  if (request.method !== 'GET' && request.method !== 'POST') {
    return methodNotAllowedResponse();
  }

  const adminError = requireAdminKey(request, env);
  if (adminError) {
    return adminError;
  }

  const repo = ensureRepository(repository);
  if (repo instanceof Response) {
    return repo;
  }

  if (request.method === 'GET') {
    const toolType = getToolTypeFromUrl(request.url);
    if (!toolType) {
      return invalidToolTypeResponse();
    }

    return jsonResponse({
      datasets: await repo.listDatasets(toolType)
    });
  }

  try {
    const payload = await readRequestJson(request);
    const toolType = normalizeToolType(payload.toolType);
    const name = String(payload.name ?? '').trim();

    if (!toolType) {
      return invalidToolTypeResponse();
    }
    if (!name) {
      return jsonResponse({ error: 'Dataset name is required.' }, 400);
    }

    const dataset = await repo.createDataset({
      description: String(payload.description ?? '').trim(),
      metadata: payload.metadata && typeof payload.metadata === 'object' ? payload.metadata : {},
      name,
      toolType
    });

    return jsonResponse({ dataset });
  } catch (error) {
    return jsonResponse({
      error: error instanceof Error ? error.message : String(error)
    }, error?.status ?? 400);
  }
}

export async function handleAdminDatasetActiveRequest(request, { env = process.env, id, repository } = {}) {
  if (request.method !== 'PATCH' && request.method !== 'POST') {
    return methodNotAllowedResponse();
  }

  const adminError = requireAdminKey(request, env);
  if (adminError) {
    return adminError;
  }

  const repo = ensureRepository(repository);
  if (repo instanceof Response) {
    return repo;
  }

  const dataset = await repo.setActiveDataset(id);
  if (!dataset) {
    return jsonResponse({ error: 'Dataset not found.' }, 404);
  }

  return jsonResponse({ dataset });
}

export async function handleAdminDatasetDeleteRequest(request, { env = process.env, id, repository } = {}) {
  if (request.method !== 'DELETE') {
    return methodNotAllowedResponse();
  }

  const adminError = requireAdminKey(request, env);
  if (adminError) {
    return adminError;
  }

  const repo = ensureRepository(repository);
  if (repo instanceof Response) {
    return repo;
  }

  return jsonResponse(await repo.deleteDataset(id));
}

export function jsonResponse(payload, status = 200) {
  return new Response(JSON.stringify(payload), {
    headers: {
      'Content-Type': 'application/json; charset=utf-8'
    },
    status
  });
}

function getToolTypeFromUrl(url) {
  return normalizeToolType(new URL(url).searchParams.get('tool'));
}

function normalizeToolType(value) {
  const toolType = String(value ?? '').trim();
  return SUPPORTED_TOOL_TYPES.has(toolType) ? toolType : '';
}

function requireAdminKey(request, env) {
  const configuredKey = String(env?.JSON_ADMIN_KEY ?? DEFAULT_ADMIN_KEY).trim();
  const providedKey = String(
    request.headers.get('x-admin-key') ??
    request.headers.get('authorization')?.replace(/^Bearer\s+/i, '') ??
    ''
  ).trim();

  if (providedKey !== configuredKey) {
    return jsonResponse({ error: 'Unauthorized.' }, 401);
  }

  return undefined;
}

function ensureRepository(repository) {
  if (!repository) {
    return jsonResponse({ error: 'DATABASE_URL is not configured.' }, 503);
  }
  return repository;
}

async function readRequestJson(request) {
  const text = await request.text();
  if (!text.trim()) {
    return {};
  }
  return JSON.parse(text);
}

function invalidToolTypeResponse() {
  return jsonResponse({ error: 'Invalid tool type.' }, 400);
}

function methodNotAllowedResponse() {
  return jsonResponse({ error: 'Method not allowed.' }, 405);
}
