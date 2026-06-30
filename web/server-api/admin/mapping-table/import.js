import { handleAdminMappingImportRequest } from '../../mapping-table-core.js';
import { getMappingTableRepository } from '../../mapping-table-repository.js';
import { createNodeCompatibleHandler } from '../../vercel-node-adapter.js';

export function createAdminMappingImportRoute({ getRepository = getMappingTableRepository } = {}) {
  const repository = () => getRepository();

  function POST(request) {
    return handleAdminMappingImportRequest(request, { repository });
  }

  const handler = createNodeCompatibleHandler(async (request) => {
    if (request.method === 'POST') {
      return POST(request);
    }

    return handleAdminMappingImportRequest(request);
  });

  return { POST, handler };
}

const adminMappingImportRoute = createAdminMappingImportRoute();

export const POST = adminMappingImportRoute.POST;
export default adminMappingImportRoute.handler;
