import test from 'node:test';
import assert from 'node:assert/strict';
import accountDelete, { createAccountDeleteHandler } from '../api/account-delete.js';

// TRANSPORT_FIXTURE only: real pinned SDK + synthetic HTTP replies. These
// tests do not authenticate a real JWT, exercise GoTrue or prove hosted RLS.
const OWNER = '11111111-1111-4111-8111-111111111111';
const OTHER = '22222222-2222-4222-8222-222222222222';
const TOKEN = 'fixture.header.signature';
const ENV = Object.freeze({
  PUBLIC_HISTORY_AUTH_ENABLED: 'true', PUBLIC_HISTORY_SITE_ORIGIN: 'https://site.example.invalid',
  PUBLIC_SUPABASE_URL: 'https://auth.example.invalid', PUBLIC_SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_fixture_only',
  HISTORY_ACCOUNT_DELETE_ENABLED: 'true', SUPABASE_SECRET_KEY: 'sb_secret_fixture_only',
  PUBLIC_HISTORY_SAVE_ENABLED: 'false', PUBLIC_HISTORY_PRIVACY_APPROVED: 'false', PUBLIC_HISTORY_DELETION_AVAILABLE: 'false',
});
const syntheticUser = { id: OWNER, aud: 'authenticated', role: 'authenticated',
  app_metadata: { provider: 'github' }, user_metadata: { userId: OTHER } };
const json = (body, status = 200, headers = {}) => Response.json(body, { status,
  headers: { 'x-supabase-api-version': '2024-01-01', ...headers } });
const absent = () => json({ code: 'user_not_found', msg: 'Synthetic user absent' }, 404);
const exactCount = count => new Response(null, { status: 200, headers: { 'content-range': `*/${count}` } });

function fixture(overrides = {}) {
  const calls = [], issues = [];
  const transport = async (input, init = {}) => {
    const url = new URL(typeof input === 'string' || input instanceof URL ? input : input.url);
    const headers = new Headers(init.headers);
    const call = { url, headers, method: init.method ?? 'GET', body: init.body, cache: init.cache, redirect: init.redirect };
    calls.push(call);
    try {
      assert.equal(url.origin, ENV.PUBLIC_SUPABASE_URL);
      assert.equal(init.cache, 'no-store'); assert.equal(init.redirect, 'error');
      assert.ok(init.signal instanceof AbortSignal);
      let response;
      if (url.pathname === '/auth/v1/user' && call.method === 'GET') {
        assert.equal(headers.get('apikey'), ENV.PUBLIC_SUPABASE_PUBLISHABLE_KEY);
        assert.equal(headers.get('authorization'), `Bearer ${TOKEN}`);
        response = overrides.identity ?? (() => json(syntheticUser));
      } else if (url.pathname === '/rest/v1/rpc/history_capabilities' && call.method === 'POST') {
        assert.equal(headers.get('apikey'), ENV.PUBLIC_SUPABASE_PUBLISHABLE_KEY);
        assert.equal(headers.get('authorization'), `Bearer ${TOKEN}`);
        assert.deepEqual(JSON.parse(call.body), {});
        response = overrides.capability ?? (() => json({ session_active: true, capture_enabled: false, consent_version: null }));
      } else if (url.pathname === `/auth/v1/admin/users/${OWNER}` && call.method === 'DELETE') {
        assert.equal(headers.get('apikey'), ENV.SUPABASE_SECRET_KEY);
        assert.notEqual(headers.get('authorization'), `Bearer ${TOKEN}`);
        assert.deepEqual(JSON.parse(call.body), { should_soft_delete: false });
        assert.equal(url.search, '');
        response = overrides.remove ?? (() => json({}));
      } else if (url.pathname === `/auth/v1/admin/users/${OWNER}` && call.method === 'GET') {
        assert.equal(headers.get('apikey'), ENV.SUPABASE_SECRET_KEY);
        assert.notEqual(headers.get('authorization'), `Bearer ${TOKEN}`);
        assert.equal(url.search, '');
        response = overrides.lookup ?? absent;
      } else if (url.pathname === '/rest/v1/test_runs' && call.method === 'HEAD') {
        assert.equal(headers.get('apikey'), ENV.SUPABASE_SECRET_KEY);
        assert.notEqual(headers.get('authorization'), `Bearer ${TOKEN}`);
        assert.deepEqual([...url.searchParams], [['select', 'id,owner_id'], ['owner_id', `eq.${OWNER}`]]);
        assert.equal(headers.get('prefer'), 'count=exact');
        response = overrides.history ?? (() => exactCount(0));
      } else { throw new Error('Unexpected SDK fixture request'); }
      return await response(call);
    } catch (error) {
      // SDKs may convert a thrown assertion to an ordinary provider error.
      // Preserve fixture mismatches separately so negative tests cannot pass.
      if (error instanceof assert.AssertionError || error.message === 'Unexpected SDK fixture request') issues.push(error.message);
      throw error;
    }
  };
  const handler = createAccountDeleteHandler({ env: ENV, fetch: transport });
  return { calls, handler, transport, assertValid: () => assert.deepEqual(issues, []) };
}

function request({ method = 'POST', origin = ENV.PUBLIC_HISTORY_SITE_ORIGIN, authorization = `Bearer ${TOKEN}`,
  contentType = 'application/json', body = JSON.stringify({ confirm: 'DELETE_MY_ACCOUNT' }), query = '' } = {}) {
  const headers = {};
  if (origin !== null) headers.Origin = origin;
  if (authorization !== null) headers.Authorization = authorization;
  if (contentType !== null) headers['Content-Type'] = contentType;
  return new Request(`${ENV.PUBLIC_HISTORY_SITE_ORIGIN}/api/account-delete${query}`, {
    method, headers, ...(['GET', 'HEAD'].includes(method) ? {} : { body }),
  });
}

async function result(handler, req = request()) {
  const response = await handler(req);
  assert.equal(response.headers.get('cache-control'), 'no-store');
  assert.equal(response.headers.get('access-control-allow-origin'), null);
  const body = await response.json();
  for (const privateValue of [OWNER, OTHER, TOKEN, ENV.SUPABASE_SECRET_KEY, ENV.PUBLIC_SUPABASE_PUBLISHABLE_KEY]) {
    assert.ok(!JSON.stringify(body).includes(privateValue));
  }
  return { response, body };
}

test('TRANSPORT_FIXTURE: Vercel Web handler export is available and server gates default off', async t => {
  assert.equal(typeof accountDelete.fetch, 'function');
  const cases = [ {}, { ...ENV, PUBLIC_HISTORY_AUTH_ENABLED: 'false' }, { ...ENV, PUBLIC_HISTORY_AUTH_ENABLED: true },
    { ...ENV, HISTORY_ACCOUNT_DELETE_ENABLED: 'TRUE' }, { ...ENV, HISTORY_ACCOUNT_DELETE_ENABLED: true },
    { ...ENV, SUPABASE_SECRET_KEY: undefined }, { ...ENV, SUPABASE_SECRET_KEY: ENV.PUBLIC_SUPABASE_PUBLISHABLE_KEY },
    { ...ENV, PUBLIC_SUPABASE_URL: 'http://auth.example.invalid' },
    { ...ENV, PUBLIC_HISTORY_SITE_ORIGIN: 'https://site.example.invalid/arbitrary-path' },
    { ...ENV, PUBLIC_HISTORY_SITE_ORIGIN: 'https://username:password@site.example.invalid' },
  ];
  for (const [index, env] of cases.entries()) await t.test(`disabled configuration ${index}`, async () => {
    let calls = 0;
    const { response, body } = await result(createAccountDeleteHandler({ env, fetch: () => { calls++; throw new Error('must not call'); } }));
    assert.equal(response.status, 503); assert.equal(body.deleted, false); assert.equal(calls, 0);
  });
});

test('TRANSPORT_FIXTURE: request method, exact Origin, JSON and confirmation reject before provider access', async t => {
  const cases = [
    [{ method: 'GET' }, 405], [{ method: 'OPTIONS' }, 405], [{ origin: null }, 403], [{ origin: 'null' }, 403],
    [{ origin: 'https://attacker.example.invalid' }, 403], [{ origin: `${ENV.PUBLIC_HISTORY_SITE_ORIGIN}/` }, 403],
    [{ query: `?userId=${OTHER}` }, 400], [{ contentType: 'text/plain' }, 415], [{ contentType: null }, 415],
    [{ body: 'not json' }, 400], [{ body: 'null' }, 400], [{ body: '[]' }, 400], [{ body: '{}' }, 400],
    [{ body: JSON.stringify({ confirm: false }) }, 400], [{ body: JSON.stringify({ confirm: 'DELETE_MY_ACCOUNT', userId: OTHER }) }, 400],
    [{ body: JSON.stringify({ confirm: 'DELETE_MY_ACCOUNT', returnUrl: 'https://attacker.example.invalid' }) }, 400],
    [{ body: ' '.repeat(513) }, 413], [{ authorization: null }, 401], [{ authorization: 'Bearer sb_secret_fixture_only' }, 401],
  ];
  for (const [index, [options, status]] of cases.entries()) await t.test(`rejected request ${index}`, async () => {
    const f = fixture();
    const { response, body } = await result(f.handler, request(options));
    assert.equal(response.status, status); assert.equal(body.deleted, false); assert.equal(body.pendingVerification, false);
    if (status === 405) assert.equal(response.headers.get('allow'), 'POST');
    assert.equal(f.calls.length, 0); f.assertValid();
  });
});

test('TRANSPORT_FIXTURE: verified SDK caller and active session precede owner-derived hard deletion and independent readbacks', async () => {
  const f = fixture();
  const { response, body } = await result(f.handler, request({ contentType: 'application/json; charset=utf-8' }));
  f.assertValid();
  assert.equal(response.status, 200); assert.equal(body.deleted, true); assert.equal(body.pendingVerification, false);
  assert.deepEqual(f.calls.slice(0, 3).map(c => `${c.method} ${c.url.pathname}`), [
    'GET /auth/v1/user', 'POST /rest/v1/rpc/history_capabilities', `DELETE /auth/v1/admin/users/${OWNER}`,
  ]);
  assert.equal(f.calls.length, 5);
  assert.equal(f.calls.filter(c => c.method === 'DELETE').length, 1);
  assert.ok(f.calls.some(c => c.method === 'HEAD' && c.url.pathname === '/rest/v1/test_runs'));
  assert.ok(f.calls.some(c => c.method === 'GET' && c.url.pathname === `/auth/v1/admin/users/${OWNER}`));
});

test('TRANSPORT_FIXTURE: exact approved local development origin can reach identity verification', async () => {
  const env = { ...ENV, PUBLIC_HISTORY_SITE_ORIGIN: 'http://localhost:4321' };
  const f = fixture();
  const handler = createAccountDeleteHandler({ env, fetch: f.transport });
  const { response } = await result(handler, request({ origin: env.PUBLIC_HISTORY_SITE_ORIGIN }));
  f.assertValid(); assert.equal(response.status, 200);
});

test('TRANSPORT_FIXTURE: invalid caller or inactive/unverified session never invokes the secret client', async t => {
  const cases = [
    [{ identity: () => json({ code: 'bad_jwt', msg: 'Synthetic invalid JWT' }, 401) }, 401, 1],
    [{ identity: () => json({ code: 'unexpected_failure', msg: 'Synthetic failure' }, 500) }, 503, 1],
    [{ identity: () => json({ user: null }) }, 401, 1],
    [{ identity: () => json({ ...syntheticUser, id: 'not-a-uuid' }) }, 401, 1],
    [{ capability: () => json({ session_active: false, capture_enabled: false }) }, 401, 2],
    [{ capability: () => json({ session_active: 'true' }) }, 503, 2],
    [{ capability: () => json({ code: '42501', message: 'Synthetic denied RPC' }, 403) }, 503, 2],
  ];
  for (const [index, [overrides, status, calls]] of cases.entries()) await t.test(`identity/session failure ${index}`, async () => {
    const f = fixture(overrides);
    const { response, body } = await result(f.handler);
    f.assertValid(); assert.equal(response.status, status); assert.equal(body.pendingVerification, false);
    assert.equal(f.calls.length, calls);
    assert.ok(f.calls.every(c => c.headers.get('apikey') === ENV.PUBLIC_SUPABASE_PUBLISHABLE_KEY));
  });
});

test('TRANSPORT_FIXTURE: only genuine SDK user_not_found plus exact zero history count confirms deletion', async t => {
  const cases = [
    ['user remains', { lookup: () => json(syntheticUser) }],
    ['arbitrary 404', { lookup: () => json({ code: 'validation_failed', msg: 'User not found' }, 404) }],
    ['message-only 404', { lookup: () => json({ msg: 'User not found' }, 404) }],
    ['permission error', { lookup: () => json({ code: 'not_admin', msg: 'Synthetic denied' }, 403) }],
    ['wrong-status notfound', { lookup: () => json({ code: 'user_not_found', msg: 'Synthetic error' }, 400) }],
    ['server failure', { lookup: () => json({ code: 'user_not_found', msg: 'Synthetic server failure' }, 500) }],
    ['empty successful identity', { lookup: () => json({ user: null }) }],
    ['history remains', { history: () => exactCount(1) }],
    ['history count unavailable', { history: () => new Response(null, { status: 200 }) }],
    ['history denied', { history: () => new Response(null, { status: 403 }) }],
    ['history transport failed', { history: () => { throw new Error('Synthetic transport failure'); } }],
  ];
  for (const [name, overrides] of cases) await t.test(name, async () => {
    const f = fixture(overrides);
    const { response, body } = await result(f.handler);
    f.assertValid(); assert.equal(response.status, 202); assert.equal(body.deleted, false);
    assert.equal(body.pendingVerification, true); assert.equal(body.code, 'deletion_unconfirmed');
    assert.equal(f.calls.length, 5); // Both readbacks still run when one fails.
  });
});

test('TRANSPORT_FIXTURE: lost deletion response is resolved only by both readbacks, without repeating mutation', async () => {
  const f = fixture({ remove: () => { throw new Error('Synthetic lost response after commit'); } });
  const { response, body } = await result(f.handler);
  f.assertValid(); assert.equal(response.status, 200); assert.equal(body.deleted, true);
  assert.equal(f.calls.length, 5); assert.equal(f.calls.filter(c => c.method === 'DELETE').length, 1);
});

test('TRANSPORT_FIXTURE: deletion failure or partial state reports pending and never logs provider detail', async t => {
  const errorLog = t.mock.method(console, 'error', () => {});
  const warnLog = t.mock.method(console, 'warn', () => {});
  const infoLog = t.mock.method(console, 'log', () => {});
  const f = fixture({ remove: () => json({ code: 'unexpected_failure', msg: 'Synthetic private provider detail' }, 500),
    lookup: () => json(syntheticUser), history: () => exactCount(2) });
  const { response, body } = await result(f.handler);
  f.assertValid(); assert.equal(response.status, 202); assert.equal(body.deleted, false); assert.equal(body.pendingVerification, true);
  assert.ok(!JSON.stringify(body).includes('Synthetic private provider detail'));
  assert.equal(f.calls.length, 5);
  assert.equal(errorLog.mock.callCount(), 0); assert.equal(warnLog.mock.callCount(), 0); assert.equal(infoLog.mock.callCount(), 0);
});
