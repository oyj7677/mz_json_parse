import {
  handleAdminDatasetActiveRequest,
  jsonResponse
} from '../../../datasets-core.js';
import { getDatasetsRepository } from '../../../datasets-repository.js';
import { createNodeCompatibleHandler } from '../../../vercel-node-adapter.js';

export async function PATCH(request) {
  const repository = await getDatasetsRepository();
  return handleAdminDatasetActiveRequest(request, {
    id: routeId(request),
    repository
  });
}

export async function POST(request) {
  const repository = await getDatasetsRepository();
  return handleAdminDatasetActiveRequest(request, {
    id: routeId(request),
    repository
  });
}

export function GET() {
  return methodNotAllowedResponse();
}

export default createNodeCompatibleHandler(async (request) => {
  if (request.method === 'PATCH') {
    return PATCH(request);
  }
  if (request.method === 'POST') {
    return POST(request);
  }

  return methodNotAllowedResponse();
});

function routeId(request) {
  const pathname = new URL(request.url).pathname;
  return decodeURIComponent(pathname.split('/').filter(Boolean).at(-2) ?? '');
}

function methodNotAllowedResponse() {
  return jsonResponse({ error: 'Method not allowed.' }, 405);
}
