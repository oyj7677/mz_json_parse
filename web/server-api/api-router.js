import adminDatasetsRoute from './admin/datasets.js';
import adminDatasetDeleteRoute from './admin/datasets/[id].js';
import adminDatasetActiveRoute from './admin/datasets/[id]/active.js';
import adminJsonBatchDeleteRoute from './admin/json-batches/[id].js';
import adminJsonImportRoute from './admin/json-records/import.js';
import adminJsonRecordDeleteRoute from './admin/json-records/[id].js';
import adminJsonStatusRoute from './admin/json-records/status.js';
import adminMappingImportRoute from './admin/mapping-table/import.js';
import adminStringResourcesImportRoute from './admin/string-resources/import.js';
import datasetsRoute from './datasets.js';
import activeDatasetRoute from './datasets/active.js';
import jsonCountriesRoute from './json-countries.js';
import jsonRecordsRoute from './json-records.js';
import jsonRecordDetailRoute from './json-records/[id].js';
import mappingRowsRoute from './mapping-rows.js';
import stringResourceLocalesRoute from './string-resource-locales.js';
import stringResourceRowsRoute from './string-resource-rows.js';
import stringResourceDetailRoute from './string-resource-rows/[id].js';
import translateFilenameRoute from './translate-filename.js';

const ROUTES = [
  { match: (pathname) => pathname === '/api/translate-filename', handler: translateFilenameRoute },
  { match: (pathname) => pathname === '/api/datasets', handler: datasetsRoute },
  { match: (pathname) => pathname === '/api/datasets/active', handler: activeDatasetRoute },
  { match: (pathname) => pathname === '/api/admin/datasets', handler: adminDatasetsRoute },
  { match: (pathname) => /^\/api\/admin\/datasets\/[^/]+\/active$/.test(pathname), handler: adminDatasetActiveRoute },
  { match: (pathname) => /^\/api\/admin\/datasets\/[^/]+$/.test(pathname), handler: adminDatasetDeleteRoute },
  { match: (pathname) => pathname === '/api/json-countries', handler: jsonCountriesRoute },
  { match: (pathname) => pathname === '/api/json-records', handler: jsonRecordsRoute },
  { match: (pathname) => /^\/api\/json-records\/[^/]+$/.test(pathname), handler: jsonRecordDetailRoute },
  { match: (pathname) => pathname === '/api/admin/json-records/status', handler: adminJsonStatusRoute },
  { match: (pathname) => pathname === '/api/admin/json-records/import', handler: adminJsonImportRoute },
  { match: (pathname) => /^\/api\/admin\/json-records\/[^/]+$/.test(pathname), handler: adminJsonRecordDeleteRoute },
  { match: (pathname) => /^\/api\/admin\/json-batches\/[^/]+$/.test(pathname), handler: adminJsonBatchDeleteRoute },
  { match: (pathname) => pathname === '/api/mapping-rows', handler: mappingRowsRoute },
  { match: (pathname) => pathname === '/api/admin/mapping-table/import', handler: adminMappingImportRoute },
  { match: (pathname) => pathname === '/api/string-resource-rows', handler: stringResourceRowsRoute },
  { match: (pathname) => pathname === '/api/string-resource-locales', handler: stringResourceLocalesRoute },
  { match: (pathname) => /^\/api\/string-resource-rows\/[^/]+$/.test(pathname), handler: stringResourceDetailRoute },
  { match: (pathname) => pathname === '/api/admin/string-resources/import', handler: adminStringResourcesImportRoute }
];

export function matchApiRoute(pathname) {
  return ROUTES.find((route) => route.match(pathname))?.handler ?? null;
}

export async function handleApiRequest(request) {
  const { pathname } = new URL(request.url);
  const handler = matchApiRoute(pathname);

  if (!handler) {
    return jsonResponse({ error: 'Not found.' }, 404);
  }

  return handler(request);
}

function jsonResponse(payload, status) {
  return new Response(JSON.stringify(payload), {
    headers: {
      'Content-Type': 'application/json; charset=utf-8'
    },
    status
  });
}
