import {
  handleJsonRecordsRequest,
  jsonResponse
} from './json-records-core.js';
import { getJsonRecordsRepository } from './json-records-repository.js';
import { createNodeCompatibleHandler } from './vercel-node-adapter.js';

export function createJsonRecordsRoute({ getRepository = getJsonRecordsRepository } = {}) {
  const repository = () => getRepository();

  function GET(request) {
    return handleJsonRecordsRequest(request, { repository });
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

const jsonRecordsRoute = createJsonRecordsRoute();

export const GET = jsonRecordsRoute.GET;
export const POST = jsonRecordsRoute.POST;
export default jsonRecordsRoute.handler;

function methodNotAllowedResponse() {
  return jsonResponse({ error: 'Method not allowed.' }, 405);
}
