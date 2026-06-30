import { handleAdminDatasetActiveRequest } from '../../../datasets-core.js';
import { getDatasetsRepository } from '../../../datasets-repository.js';
import { createNodeCompatibleHandler } from '../../../vercel-node-adapter.js';

export function createAdminDatasetActiveRoute({ getRepository = getDatasetsRepository } = {}) {
  const repository = () => getRepository();

  function PATCH(request) {
    return handleAdminDatasetActiveRequest(request, {
      id: routeId(request),
      repository
    });
  }

  function POST(request) {
    return handleAdminDatasetActiveRequest(request, {
      id: routeId(request),
      repository
    });
  }

  function GET(request) {
    return handleAdminDatasetActiveRequest(request, {
      id: routeId(request)
    });
  }

  const handler = createNodeCompatibleHandler(async (request) => {
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

  return { PATCH, POST, GET, handler };
}

const adminDatasetActiveRoute = createAdminDatasetActiveRoute();

export const PATCH = adminDatasetActiveRoute.PATCH;
export const POST = adminDatasetActiveRoute.POST;
export const GET = adminDatasetActiveRoute.GET;
export default adminDatasetActiveRoute.handler;

function routeId(request) {
  const pathname = new URL(request.url).pathname;
  return decodeURIComponent(pathname.split('/').filter(Boolean).at(-2) ?? '');
}
