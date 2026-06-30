import {
  handleStringResourceRowsRequest,
  jsonResponse
} from './string-resources-core.js';
import { getStringResourcesRepository } from './string-resources-repository.js';
import { createNodeCompatibleHandler } from './vercel-node-adapter.js';

export function createStringResourceRowsRoute({ getRepository = getStringResourcesRepository } = {}) {
  const repository = () => getRepository();

  function GET(request) {
    return handleStringResourceRowsRequest(request, { repository });
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

const stringResourceRowsRoute = createStringResourceRowsRoute();

export const GET = stringResourceRowsRoute.GET;
export const POST = stringResourceRowsRoute.POST;
export default stringResourceRowsRoute.handler;

function methodNotAllowedResponse() {
  return jsonResponse({ error: 'Method not allowed.' }, 405);
}
