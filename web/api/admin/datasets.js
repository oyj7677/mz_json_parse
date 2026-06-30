import { handleAdminDatasetsRequest } from '../datasets-core.js';
import { getDatasetsRepository } from '../datasets-repository.js';
import { createNodeCompatibleHandler } from '../vercel-node-adapter.js';

export function createAdminDatasetsRoute({ getRepository = getDatasetsRepository } = {}) {
  const repository = () => getRepository();

  function GET(request) {
    return handleAdminDatasetsRequest(request, { repository });
  }

  function POST(request) {
    return handleAdminDatasetsRequest(request, { repository });
  }

  const handler = createNodeCompatibleHandler(async (request) => {
    if (request.method === 'GET') {
      return GET(request);
    }
    if (request.method === 'POST') {
      return POST(request);
    }

    return handleAdminDatasetsRequest(request);
  });

  return { GET, POST, handler };
}

const adminDatasetsRoute = createAdminDatasetsRoute();

export const GET = adminDatasetsRoute.GET;
export const POST = adminDatasetsRoute.POST;
export default adminDatasetsRoute.handler;
