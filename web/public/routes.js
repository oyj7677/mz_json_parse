export const ROUTE_TOOLS = Object.freeze({
  hub: Object.freeze({ path: '/', tool: 'hub' }),
  formatter: Object.freeze({ path: '/formatter', tool: 'formatter' }),
  explorer: Object.freeze({ path: '/explorer', tool: 'explorer' }),
  jsonEditor: Object.freeze({ path: '/json-editor', tool: 'jsonEditor' }),
  mapping: Object.freeze({ path: '/mapping-table', tool: 'mapping' }),
  stringResource: Object.freeze({ path: '/string-resource', tool: 'stringResource' }),
  admin: Object.freeze({ path: '/admin', tool: 'admin' })
});

const TOOL_BY_PATH = new Map(
  Object.values(ROUTE_TOOLS).map((route) => [route.path, route])
);

export function normalizeToolRoute(pathname = '/') {
  const normalizedPath = normalizePath(pathname);
  return TOOL_BY_PATH.get(normalizedPath) ?? ROUTE_TOOLS.hub;
}

export function pathForTool(tool) {
  return ROUTE_TOOLS[tool]?.path ?? ROUTE_TOOLS.hub.path;
}

function normalizePath(pathname) {
  const pathOnly = String(pathname || '/').split(/[?#]/)[0] || '/';
  const collapsed = pathOnly.replace(/\/{2,}/g, '/');
  const withoutTrailingSlash = collapsed.length > 1
    ? collapsed.replace(/\/+$/, '')
    : collapsed;
  return withoutTrailingSlash || '/';
}
