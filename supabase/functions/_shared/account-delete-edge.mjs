import { createAccountDeleteHandler } from './account-delete.mjs';

const allowedHeaders = 'authorization, apikey, x-client-info, content-type, x-retry-count, traceparent, tracestate, baggage';

function defaultKey(json) {
  try {
    const values = JSON.parse(json);
    return values !== null && typeof values === 'object' && !Array.isArray(values) &&
      typeof values.default === 'string' ? values.default : undefined;
  } catch { return undefined; }
}

// Supabase Edge Functions inject the public and secret keys as JSON maps.
// Never send either map to the browser or log its contents.
export function edgeEnvironment(raw = {}) {
  return {
    PUBLIC_HISTORY_AUTH_ENABLED: raw.PUBLIC_HISTORY_AUTH_ENABLED,
    PUBLIC_HISTORY_SITE_ORIGIN: raw.PUBLIC_HISTORY_SITE_ORIGIN,
    PUBLIC_SUPABASE_URL: raw.SUPABASE_URL,
    PUBLIC_SUPABASE_PUBLISHABLE_KEY: defaultKey(raw.SUPABASE_PUBLISHABLE_KEYS),
    HISTORY_ACCOUNT_DELETE_ENABLED: raw.HISTORY_ACCOUNT_DELETE_ENABLED,
    SUPABASE_SECRET_KEY: defaultKey(raw.SUPABASE_SECRET_KEYS),
  };
}

// The edge runtime handles CORS preflight; shared core still independently
// authenticates the JWT and checks the exact Origin, session and delete receipt.
export function createAccountDeleteEdgeHandler({ env = {}, fetch: transport = globalThis.fetch } = {}) {
  const sharedEnv = edgeEnvironment(env);
  const handler = createAccountDeleteHandler({ env: sharedEnv, fetch: transport });
  const configured = sharedEnv.PUBLIC_HISTORY_AUTH_ENABLED === 'true' &&
    sharedEnv.HISTORY_ACCOUNT_DELETE_ENABLED === 'true' &&
    /^https:\/\/[^/]+$/.test(sharedEnv.PUBLIC_HISTORY_SITE_ORIGIN ?? '');
  const origin = sharedEnv.PUBLIC_HISTORY_SITE_ORIGIN;
  return async request => {
    // Suppress CORS completely when unconfigured or called from another origin.
    if (!configured || request.headers.get('origin') !== origin) return handler(request);
    const headers = {
      'Access-Control-Allow-Origin': origin,
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': allowedHeaders,
      'Access-Control-Max-Age': '600',
      'Cache-Control': 'no-store',
      Vary: 'Origin',
    };
    if (request.method === 'OPTIONS') {
      if (request.headers.get('access-control-request-method') !== 'POST' || new URL(request.url).search) {
        return Response.json({ code: 'invalid_preflight' }, { status: 403, headers });
      }
      return new Response(null, { status: 204, headers });
    }
    const response = await handler(request);
    const responseHeaders = new Headers(response.headers);
    for (const [name, value] of Object.entries(headers)) responseHeaders.set(name, value);
    return new Response(response.body, { status: response.status, headers: responseHeaders });
  };
}
