import { handleAdminDatasetDeleteRequest } from '../../datasets-core.js';
import { getDatasetsRepository } from '../../datasets-repository.js';
import { createNodeCompatibleHandler } from '../../vercel-node-adapter.js';

export async function DELETE(request) {
  const repository = await getDatasetsRepository();
  return handleAdminDatasetDeleteRequest(request, {
    id: routeId(request),
    repository
  });
}

export function GET(request) {
  return handleAdminDatasetDeleteRequest(request, {
    id: routeId(request)
  });
}

export default createNodeCompatibleHandler(async (request) => {
  if (request.method === 'DELETE') {
    return DELETE(request);
  }

  return handleAdminDatasetDeleteRequest(request, {
    id: routeId(request)
  });
});

function routeId(request) {
  const pathname = new URL(request.url).pathname;
  return decodeURIComponent(pathname.split('/').filter(Boolean).at(-1) ?? '');
}
