import { handleAdminStatusRequest } from '../../json-records-core.js';
import { getJsonRecordsRepository } from '../../json-records-repository.js';
import { createNodeCompatibleHandler } from '../../vercel-node-adapter.js';

export function createAdminJsonStatusRoute({ getRepository = getJsonRecordsRepository } = {}) {
  const repository = () => getRepository();

  function GET(request) {
    return handleAdminStatusRequest(request, { repository });
  }

  const handler = createNodeCompatibleHandler(async (request) => {
    if (request.method === 'GET') {
      return GET(request);
    }

    return handleAdminStatusRequest(request);
  });

  return { GET, handler };
}

const adminJsonStatusRoute = createAdminJsonStatusRoute();

export const GET = adminJsonStatusRoute.GET;
export default adminJsonStatusRoute.handler;
