import {
  handleJsonRecordsRequest,
  jsonResponse
} from './json-records-core.js';
import { getJsonRecordsRepository } from './json-records-repository.js';
import { createNodeCompatibleHandler } from './vercel-node-adapter.js';

export async function GET(request) {
  const repository = await getJsonRecordsRepository();
  return handleJsonRecordsRequest(request, { repository });
}

export function POST() {
  return methodNotAllowedResponse();
}

export default createNodeCompatibleHandler(async (request) => {
  if (request.method === 'GET') {
    return GET(request);
  }

  return methodNotAllowedResponse();
});

function methodNotAllowedResponse() {
  return jsonResponse({ error: 'Method not allowed.' }, 405);
}
