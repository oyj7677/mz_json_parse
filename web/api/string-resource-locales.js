import {
  handleStringResourceLocalesRequest,
  jsonResponse
} from './string-resources-core.js';
import { getStringResourcesRepository } from './string-resources-repository.js';
import { createNodeCompatibleHandler } from './vercel-node-adapter.js';

export function createStringResourceLocalesRoute({ getRepository = getStringResourcesRepository } = {}) {
  const repository = () => getRepository();

  function GET(request) {
    return handleStringResourceLocalesRequest(request, { repository });
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

const stringResourceLocalesRoute = createStringResourceLocalesRoute();

export const GET = stringResourceLocalesRoute.GET;
export const POST = stringResourceLocalesRoute.POST;
export default stringResourceLocalesRoute.handler;

function methodNotAllowedResponse() {
  return jsonResponse({ error: 'Method not allowed.' }, 405);
}
