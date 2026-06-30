import {
  handleJsonCountriesRequest,
  jsonResponse
} from './json-records-core.js';
import { getJsonRecordsRepository } from './json-records-repository.js';
import { createNodeCompatibleHandler } from './vercel-node-adapter.js';

export function createJsonCountriesRoute({ getRepository = getJsonRecordsRepository } = {}) {
  const repository = () => getRepository();

  function GET(request) {
    return handleJsonCountriesRequest(request, { repository });
  }

  function POST() {
    return jsonResponse({ error: 'Method not allowed.' }, 405);
  }

  const handler = createNodeCompatibleHandler(async (request) => {
    if (request.method === 'GET') {
      return GET(request);
    }
    return jsonResponse({ error: 'Method not allowed.' }, 405);
  });

  return { GET, POST, handler };
}

const jsonCountriesRoute = createJsonCountriesRoute();

export const GET = jsonCountriesRoute.GET;
export const POST = jsonCountriesRoute.POST;
export default jsonCountriesRoute.handler;
