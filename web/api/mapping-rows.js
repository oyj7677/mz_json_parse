import {
  handleMappingRowsRequest,
  jsonResponse
} from './mapping-table-core.js';
import { getMappingTableRepository } from './mapping-table-repository.js';
import { createNodeCompatibleHandler } from './vercel-node-adapter.js';

export function createMappingRowsRoute({ getRepository = getMappingTableRepository } = {}) {
  const repository = () => getRepository();

  function GET(request) {
    return handleMappingRowsRequest(request, { repository });
  }

  function POST() {
    return methodNotAllowedResponse();
  }

  const handler = createNodeCompatibleHandler(async (request) => {
    if (request.method === 'GET') {
      return GET(request);
    }

    return methodNotAllowedResponse();
  });

  return { GET, POST, handler };
}

const mappingRowsRoute = createMappingRowsRoute();

export const GET = mappingRowsRoute.GET;
export const POST = mappingRowsRoute.POST;
export default mappingRowsRoute.handler;

function methodNotAllowedResponse() {
  return jsonResponse({ error: 'Method not allowed.' }, 405);
}
