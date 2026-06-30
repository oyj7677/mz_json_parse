import {
  handleJsonCountriesRequest,
  jsonResponse
} from './json-records-core.js';
import { getJsonRecordsRepository } from './json-records-repository.js';
import { createNodeCompatibleHandler } from './vercel-node-adapter.js';

export async function GET(request) {
  const repository = await getJsonRecordsRepository();
  return handleJsonCountriesRequest(request, { repository });
}

export function POST() {
  return jsonResponse({ error: 'Method not allowed.' }, 405);
}

export default createNodeCompatibleHandler(async (request) => {
  if (request.method === 'GET') {
    return GET(request);
  }
  return jsonResponse({ error: 'Method not allowed.' }, 405);
});
