import {
  handleAdminImportRequest,
  jsonResponse
} from '../../json-records-core.js';
import { getJsonRecordsRepository } from '../../json-records-repository.js';
import { createNodeCompatibleHandler } from '../../vercel-node-adapter.js';

export async function POST(request) {
  const repository = await getJsonRecordsRepository();
  return handleAdminImportRequest(request, {
    repository
  });
}

export function GET() {
  return methodNotAllowedResponse();
}

export default createNodeCompatibleHandler(async (request) => {
  if (request.method === 'POST') {
    return POST(request);
  }

  return methodNotAllowedResponse();
});

function methodNotAllowedResponse() {
  return jsonResponse({ error: 'Method not allowed.' }, 405);
}
