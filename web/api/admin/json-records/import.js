import { handleAdminImportRequest } from '../../json-records-core.js';
import { getJsonRecordsRepository } from '../../json-records-repository.js';
import { createNodeCompatibleHandler } from '../../vercel-node-adapter.js';

export function createAdminJsonImportRoute({ getRepository = getJsonRecordsRepository } = {}) {
  const repository = () => getRepository();

  function POST(request) {
    return handleAdminImportRequest(request, { repository });
  }

  const handler = createNodeCompatibleHandler(async (request) => {
    if (request.method === 'POST') {
      return POST(request);
    }

    return handleAdminImportRequest(request);
  });

  return { POST, handler };
}

const adminJsonImportRoute = createAdminJsonImportRoute();

export const POST = adminJsonImportRoute.POST;
export default adminJsonImportRoute.handler;
