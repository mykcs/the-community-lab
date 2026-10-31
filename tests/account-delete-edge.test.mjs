import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createAccountDeleteEdgeHandler, edgeEnvironment } from '../supabase/functions/_shared/account-delete-edge.mjs';

const origin = 'https://community.example.invalid';
const edgeEnv = Object.freeze({
  PUBLIC_HISTORY_AUTH_ENABLED: 'true',
  HISTORY_ACCOUNT_DELETE_ENABLED: 'true',
  PUBLIC_HISTORY_SITE_ORIGIN: origin,
  SUPABASE_URL: 'https://project.example.invalid',
  SUPABASE_PUBLISHABLE_KEYS: JSON.stringify({ default: 'sb_publishable_synthetic' }),
  SUPABASE_SECRET_KEYS: JSON.stringify({ default: 'sb_secret_synthetic' }),
});
const req = (method, requestOrigin = origin, headers = {}) => new Request('https://project.example.invalid/functions/v1/account-delete', {
  method, headers: { Origin: requestOrigin, ...headers },
  ...(method === 'POST' ? { body: JSON.stringify({ confirm: 'DELETE_MY_ACCOUNT' }) } : {}),
});

test('Supabase gateway lets preflight reach the handler while POST identity remains checked in code', async () => {
  const config = await readFile(new URL('../supabase/config.toml', import.meta.url), 'utf8');
  assert.match(config, /\\[functions\\.account-delete\\]\\s+verify_jwt\\s*=\\s*false/);
});

test('Edge maps only injected default keys and stays disabled without exact explicit gates', () => {
  assert.deepEqual(edgeEnvironment(), {
    PUBLIC_HISTORY_AUTH_ENABLED: undefined, PUBLIC_HISTORY_SITE_ORIGIN: undefined,
    PUBLIC_SUPABASE_URL: undefined, PUBLIC_SUPABASE_PUBLISHABLE_KEY: undefined,
    HISTORY_ACCOUNT_DELETE_ENABLED: undefined, SUPABASE_SECRET_KEY: undefined,
  });
  assert.equal(edgeEnvironment({ ...edgeEnv, SUPABASE_SECRET_KEYS: '{bad' }).SUPABASE_SECRET_KEY, undefined);
  assert.equal(edgeEnvironment({ ...edgeEnv, SUPABASE_PUBLISHABLE_KEYS: '{}' }).PUBLIC_SUPABASE_PUBLISHABLE_KEY, undefined);
});

test('Edge CORS authorizes only the configured origin and POST preflight, never includes credentials', async () => {
  const handler = createAccountDeleteEdgeHandler({ env: edgeEnv, fetch: () => { throw new Error('No provider expected'); } });
  const preflight = await handler(req('OPTIONS', origin, { 'Access-Control-Request-Method': 'POST',
    'Access-Control-Request-Headers': 'authorization, apikey, x-client-info, content-type' }));
  assert.equal(preflight.status, 204);
  assert.equal(preflight.headers.get('access-control-allow-origin'), origin);
  assert.match(preflight.headers.get('access-control-allow-headers'), /apikey/);
  assert.equal(preflight.headers.get('access-control-allow-credentials'), null);
  assert.equal(preflight.headers.get('cache-control'), 'no-store');
  const other = await handler(req('OPTIONS', 'https://attacker.invalid', { 'Access-Control-Request-Method': 'POST' }));
  assert.equal(other.status, 405); assert.equal(other.headers.get('access-control-allow-origin'), null);
  const wrong = await handler(req('OPTIONS', origin, { 'Access-Control-Request-Method': 'DELETE' }));
  assert.equal(wrong.status, 403);
  const unauthenticated = await handler(req('POST', origin, { 'Content-Type': 'application/json' }));
  assert.equal(unauthenticated.status, 401);
  assert.equal(unauthenticated.headers.get('access-control-allow-origin'), origin);
});

test('Edge remains fail-closed even for valid CORS preflight when deletion flag is off', async () => {
  const handler = createAccountDeleteEdgeHandler({ env: { ...edgeEnv, HISTORY_ACCOUNT_DELETE_ENABLED: 'false' } });
  const response = await handler(req('OPTIONS', origin, { 'Access-Control-Request-Method': 'POST' }));
  assert.equal(response.status, 503);
  assert.equal(response.headers.get('access-control-allow-origin'), null);
});

test('Edge rejects GitHub Pages shared origins before granting CORS or handling auth requests', async () => {
  const sharedOrigin = 'https://mykcs.github.io';
  const handler = createAccountDeleteEdgeHandler({ env: { ...edgeEnv, PUBLIC_HISTORY_SITE_ORIGIN: sharedOrigin } });
  const response = await handler(req('OPTIONS', sharedOrigin, { 'Access-Control-Request-Method': 'POST' }));
  assert.equal(response.status, 503);
  assert.equal(response.headers.get('access-control-allow-origin'), null);
});
