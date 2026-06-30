import {
  handleDatasetsRequest,
  jsonResponse
} from './datasets-core.js';
import { getDatasetsRepository } from './datasets-repository.js';
import { createNodeCompatibleHandler } from './vercel-node-adapter.js';

export async function GET(request) {
  const repository = await getDatasetsRepository();
  return handleDatasetsRequest(request, { repository });
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
