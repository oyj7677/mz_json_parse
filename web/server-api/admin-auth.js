const DEFAULT_ADMIN_KEY = '1313';

export function requireAdminKey(request, env = process.env) {
  const configuredKey = resolveConfiguredAdminKey(env);
  const providedKey = readProvidedAdminKey(request);

  if (!configuredKey || providedKey !== configuredKey) {
    return new Response(JSON.stringify({ error: 'Unauthorized.' }), {
      headers: {
        'Content-Type': 'application/json; charset=utf-8'
      },
      status: 401
    });
  }

  return undefined;
}

export function resolveConfiguredAdminKey(env = process.env) {
  const value = env?.JSON_ADMIN_KEY;
  if (value === undefined || value === null) {
    return DEFAULT_ADMIN_KEY;
  }
  return String(value).trim();
}

function readProvidedAdminKey(request) {
  return String(
    request.headers.get('x-admin-key') ??
    request.headers.get('authorization')?.replace(/^Bearer\s+/i, '') ??
    ''
  ).trim();
}
