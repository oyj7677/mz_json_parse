import {
  handleAdminDatasetDeleteRequest,
  jsonResponse
} from '../../datasets-core.js';
import { getDatasetsRepository } from '../../datasets-repository.js';
import { createNodeCompatibleHandler } from '../../vercel-node-adapter.js';

export async function DELETE(request) {
  const repository = await getDatasetsRepository();
  return handleAdminDatasetDeleteRequest(request, {
    id: routeId(request),
    repository
  });
}

export function GET() {
  return methodNotAllowedResponse();
}

export default createNodeCompatibleHandler(async (request) => {
  if (request.method === 'DELETE') {
    return DELETE(request);
  }

  return methodNotAllowedResponse();
});

function routeId(request) {
  const pathname = new URL(request.url).pathname;
  return decodeURIComponent(pathname.split('/').filter(Boolean).at(-1) ?? '');
}

function methodNotAllowedResponse() {
  return jsonResponse({ error: 'Method not allowed.' }, 405);
}
