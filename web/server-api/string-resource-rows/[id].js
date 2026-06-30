import {
  handleStringResourceDetailRequest,
  jsonResponse
} from '../string-resources-core.js';
import { getStringResourcesRepository } from '../string-resources-repository.js';
import { createNodeCompatibleHandler } from '../vercel-node-adapter.js';

export function createStringResourceDetailRoute({ getRepository = getStringResourcesRepository } = {}) {
  const repository = () => getRepository();

  function GET(request, context = {}) {
    return handleStringResourceDetailRequest(request, {
      id: resolveId(request, context),
      repository
    });
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

const stringResourceDetailRoute = createStringResourceDetailRoute();

export const GET = stringResourceDetailRoute.GET;
export const POST = stringResourceDetailRoute.POST;
export default stringResourceDetailRoute.handler;

function resolveId(request, context = {}) {
  const contextId = context?.params?.id;
  if (contextId !== undefined) {
    return contextId;
  }

  const pathname = new URL(request.url).pathname;
  const prefix = '/api/string-resource-rows/';
  if (pathname === '/api/string-resource-rows' || pathname === prefix) {
    return '';
  }
  return decodeURIComponent(pathname.slice(prefix.length));
}

function methodNotAllowedResponse() {
  return jsonResponse({ error: 'Method not allowed.' }, 405);
}
