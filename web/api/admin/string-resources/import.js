import { handleAdminStringResourcesImportRequest } from '../../string-resources-core.js';
import { getStringResourcesRepository } from '../../string-resources-repository.js';
import { createNodeCompatibleHandler } from '../../vercel-node-adapter.js';

export function createAdminStringResourcesImportRoute({ getRepository = getStringResourcesRepository } = {}) {
  const repository = () => getRepository();

  function POST(request) {
    return handleAdminStringResourcesImportRequest(request, { repository });
  }

  const handler = createNodeCompatibleHandler(async (request) => {
    if (request.method === 'POST') {
      return POST(request);
    }

    return handleAdminStringResourcesImportRequest(request);
  });

  return { POST, handler };
}

const adminStringResourcesImportRoute = createAdminStringResourcesImportRoute();

export const POST = adminStringResourcesImportRoute.POST;
export default adminStringResourcesImportRoute.handler;
