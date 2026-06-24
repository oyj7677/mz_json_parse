import {
  handleAdminBatchDeleteRequest,
  jsonResponse
} from '../../json-records-core.js';
import { getJsonRecordsRepository } from '../../json-records-repository.js';
import { createNodeCompatibleHandler } from '../../vercel-node-adapter.js';

export async function DELETE(request) {
  const repository = await getJsonRecordsRepository();
  return handleAdminBatchDeleteRequest(request, {
    id: routeId(request),
    repository
  });
}

export function GET() {
  return methodNotAllowedResponse();
}

export default createNodeCompatibleHandler(async (request) => {
  if (request.method === 'DELETE') {
    return DELETE(request);
  }

  return methodNotAllowedResponse();
});

function routeId(request) {
  const pathname = new URL(request.url).pathname;
  return decodeURIComponent(pathname.split('/').filter(Boolean).at(-1) ?? '');
}

function methodNotAllowedResponse() {
  return jsonResponse({ error: 'Method not allowed.' }, 405);
}
