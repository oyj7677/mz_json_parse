import { handleAdminRecordDeleteRequest } from '../../json-records-core.js';
import { getJsonRecordsRepository } from '../../json-records-repository.js';
import { createNodeCompatibleHandler } from '../../vercel-node-adapter.js';

export function createAdminJsonRecordDeleteRoute({ getRepository = getJsonRecordsRepository } = {}) {
  const repository = () => getRepository();

  function DELETE(request) {
    return handleAdminRecordDeleteRequest(request, {
      id: routeId(request),
      repository
    });
  }

  const handler = createNodeCompatibleHandler(async (request) => {
    if (request.method === 'DELETE') {
      return DELETE(request);
    }

    return handleAdminRecordDeleteRequest(request, {
      id: routeId(request)
    });
  });

  return { DELETE, handler };
}

const adminJsonRecordDeleteRoute = createAdminJsonRecordDeleteRoute();

export const DELETE = adminJsonRecordDeleteRoute.DELETE;
export default adminJsonRecordDeleteRoute.handler;

function routeId(request) {
  const pathname = new URL(request.url).pathname;
  return decodeURIComponent(pathname.split('/').filter(Boolean).at(-1) ?? '');
}
