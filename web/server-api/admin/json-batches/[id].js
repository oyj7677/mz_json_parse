import { handleAdminBatchDeleteRequest } from '../../json-records-core.js';
import { getJsonRecordsRepository } from '../../json-records-repository.js';
import { createNodeCompatibleHandler } from '../../vercel-node-adapter.js';

export function createAdminJsonBatchDeleteRoute({ getRepository = getJsonRecordsRepository } = {}) {
  const repository = () => getRepository();

  function DELETE(request) {
    return handleAdminBatchDeleteRequest(request, {
      id: routeId(request),
      repository
    });
  }

  const handler = createNodeCompatibleHandler(async (request) => {
    if (request.method === 'DELETE') {
      return DELETE(request);
    }

    return handleAdminBatchDeleteRequest(request, {
      id: routeId(request)
    });
  });

  return { DELETE, handler };
}

const adminJsonBatchDeleteRoute = createAdminJsonBatchDeleteRoute();

export const DELETE = adminJsonBatchDeleteRoute.DELETE;
export default adminJsonBatchDeleteRoute.handler;

function routeId(request) {
  const pathname = new URL(request.url).pathname;
  return decodeURIComponent(pathname.split('/').filter(Boolean).at(-1) ?? '');
}
