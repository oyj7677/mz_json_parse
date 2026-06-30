import { handleAdminDatasetActiveRequest } from '../../../datasets-core.js';
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

export function GET(request) {
  return handleAdminDatasetActiveRequest(request, {
    id: routeId(request)
  });
}

export default createNodeCompatibleHandler(async (request) => {
  if (request.method === 'PATCH') {
    return PATCH(request);
  }
  if (request.method === 'POST') {
    return POST(request);
  }

  return handleAdminDatasetActiveRequest(request, {
    id: routeId(request)
  });
});

function routeId(request) {
  const pathname = new URL(request.url).pathname;
  return decodeURIComponent(pathname.split('/').filter(Boolean).at(-2) ?? '');
}
