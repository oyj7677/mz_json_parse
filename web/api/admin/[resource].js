import { handleApiRequest } from '../../server-api/api-router.js';
import { createNodeCompatibleHandler } from '../../server-api/vercel-node-adapter.js';

export default createNodeCompatibleHandler(handleApiRequest);
