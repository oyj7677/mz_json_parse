import { handleAdminDatasetsRequest } from '../datasets-core.js';
import { getDatasetsRepository } from '../datasets-repository.js';
import { createNodeCompatibleHandler } from '../vercel-node-adapter.js';

export async function GET(request) {
  const repository = await getDatasetsRepository();
  return handleAdminDatasetsRequest(request, { repository });
}

export async function POST(request) {
  const repository = await getDatasetsRepository();
  return handleAdminDatasetsRequest(request, { repository });
}

export default createNodeCompatibleHandler(async (request) => {
  if (request.method === 'GET') {
    return GET(request);
  }
  if (request.method === 'POST') {
    return POST(request);
  }

  return handleAdminDatasetsRequest(request);
});
