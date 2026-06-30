import { handleAdminDatasetDeleteRequest } from '../../datasets-core.js';
import { getDatasetsRepository } from '../../datasets-repository.js';
import { createNodeCompatibleHandler } from '../../vercel-node-adapter.js';

export function createAdminDatasetDeleteRoute({ getRepository = getDatasetsRepository } = {}) {
  const repository = () => getRepository();

  function DELETE(request) {
    return handleAdminDatasetDeleteRequest(request, {
      id: routeId(request),
      repository
    });
  }

  function GET(request) {
    return handleAdminDatasetDeleteRequest(request, {
      id: routeId(request)
    });
  }

  const handler = createNodeCompatibleHandler(async (request) => {
    if (request.method === 'DELETE') {
      return DELETE(request);
    }

    return handleAdminDatasetDeleteRequest(request, {
      id: routeId(request)
    });
  });

  return { DELETE, GET, handler };
}

const adminDatasetDeleteRoute = createAdminDatasetDeleteRoute();

export const DELETE = adminDatasetDeleteRoute.DELETE;
export const GET = adminDatasetDeleteRoute.GET;
export default adminDatasetDeleteRoute.handler;

function routeId(request) {
  const pathname = new URL(request.url).pathname;
  return decodeURIComponent(pathname.split('/').filter(Boolean).at(-1) ?? '');
}
