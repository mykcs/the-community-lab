import { createClient, isAuthApiError } from '@supabase/supabase-js';
import { getHistoryConfig } from '../lib/history-config.mjs';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MAX_BODY_BYTES = 512;
const FETCH_TIMEOUT_MS = 10_000;

function reply(status, code, message, extra = {}, headers = {}) {
  return Response.json({ deleted: false, pendingVerification: false, code, message, ...extra }, {
    status, headers: { 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', ...headers },
  });
}

function serverConfig(env) {
  let expectedOrigin;
  try { expectedOrigin = new URL(env.PUBLIC_HISTORY_SITE_ORIGIN).origin; } catch { return null; }
  const config = getHistoryConfig({
    authEnabled: env.PUBLIC_HISTORY_AUTH_ENABLED === 'true',
    siteOrigin: env.PUBLIC_HISTORY_SITE_ORIGIN,
    supabaseUrl: env.PUBLIC_SUPABASE_URL,
    publishableKey: env.PUBLIC_SUPABASE_PUBLISHABLE_KEY,
  }, expectedOrigin);
  if (!config.configured || env.HISTORY_ACCOUNT_DELETE_ENABLED !== 'true' ||
      typeof env.SUPABASE_SECRET_KEY !== 'string' || !/^sb_secret_[A-Za-z0-9_-]+$/.test(env.SUPABASE_SECRET_KEY)) return null;
  return { ...config, secretKey: env.SUPABASE_SECRET_KEY };
}

async function confirmation(request) {
  const reader = request.body?.getReader();
  if (!reader) return false;
  const chunks = [];
  let length = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      length += value.byteLength;
      if (length > MAX_BODY_BYTES) {
        void reader.cancel().catch(() => {});
        throw new RangeError('body_limit');
      }
      chunks.push(value);
    }
  } finally { reader.releaseLock(); }
  const bytes = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
  const body = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
  return body !== null && !Array.isArray(body) && typeof body === 'object' &&
    Object.keys(body).length === 1 && body.confirm === 'DELETE_MY_ACCOUNT';
}

function isConfirmedAbsent(response) {
  // Current GoTrue loadUser returns 404/user_not_found. Message matching,
  // an arbitrary 404, and an empty successful response are not deletion proof.
  return response?.data?.user === null && isAuthApiError(response.error) &&
    response.error.code === 'user_not_found' && response.error.status === 404;
}

/** Tests inject only HTTP transport; the pinned SDK still parses every response. */
export function createAccountDeleteHandler({ env = process.env, fetch: transport = globalThis.fetch } = {}) {
  return async request => {
    const config = serverConfig(env);
    if (!config) return reply(503, 'unavailable', '账号注销暂未开放。');
    if (request.method !== 'POST') return reply(405, 'method_not_allowed', '请使用注销确认操作。', {}, { Allow: 'POST' });
    if (request.headers.get('origin') !== config.siteOrigin) return reply(403, 'origin_rejected', '此来源无法发起账号注销。');
    if (new URL(request.url).search) return reply(400, 'invalid_request', '注销请求不接受查询参数。');
    if (request.headers.get('content-type')?.split(';')[0].trim().toLowerCase() !== 'application/json') {
      return reply(415, 'json_required', '注销确认必须使用 JSON。');
    }
    try {
      if (!await confirmation(request)) return reply(400, 'confirmation_required', '请明确确认删除本人账号。');
    } catch (error) {
      return error instanceof RangeError ? reply(413, 'body_too_large', '注销确认内容过长。') :
        reply(400, 'invalid_request', '注销确认内容无效。');
    }
    const authorization = request.headers.get('authorization') ?? '';
    const token = authorization.length <= 8192 && /^Bearer ([A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+)$/i.exec(authorization)?.[1];
    if (!token) return reply(401, 'signed_out', '请先登录本人账号。');

    // No persistence, auto-refresh, callback detection, redirects or response
    // caching. Every provider operation is bounded; no credentials are logged.
    const providerFetch = (input, init = {}) => transport(input, { ...init,
      cache: 'no-store', redirect: 'error', signal: init.signal ?
        AbortSignal.any([init.signal, AbortSignal.timeout(FETCH_TIMEOUT_MS)]) : AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });
    const options = { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
      global: { fetch: providerFetch } };
    let userId;
    try {
      const caller = createClient(config.supabaseUrl, config.publishableKey, { ...options,
        global: { ...options.global, headers: { Authorization: `Bearer ${token}` } },
      });
      const identity = await caller.auth.getUser(token);
      if (identity.error) return reply(identity.error.status >= 500 || !identity.error.status ? 503 : 401,
        'identity_unverified', '暂时无法核实登录身份，请重新登录或稍后重试。');
      userId = identity.data?.user?.id;
      if (typeof userId !== 'string' || !UUID.test(userId)) return reply(401, 'signed_out', '请先登录本人账号。');
      const capability = await caller.rpc('history_capabilities').retry(false);
      if (capability.error || typeof capability.data?.session_active !== 'boolean') {
        return reply(503, 'session_unverified', '暂时无法核实登录会话，请稍后重试。');
      }
      if (!capability.data.session_active) return reply(401, 'signed_out', '登录已失效，请重新登录。');
    } catch {
      return reply(503, 'identity_unverified', '暂时无法核实登录身份，请稍后重试。');
    }

    // This separate privileged client has only this account-removal purpose.
    // Ordinary history CRUD continues through the caller-JWT history service.
    let admin;
    try { admin = createClient(config.supabaseUrl, config.secretKey, options); }
    catch { return reply(503, 'unavailable', '账号注销暂不可用，请稍后重试。'); }
    try { await admin.auth.admin.deleteUser(userId, false); } catch { /* A lost response is not proof either way. */ }
    const [identity, history] = await Promise.allSettled([
      admin.auth.admin.getUserById(userId),
      admin.from('test_runs').select('id,owner_id', { count: 'exact', head: true }).eq('owner_id', userId).retry(false),
    ]);
    const identityGone = identity.status === 'fulfilled' && isConfirmedAbsent(identity.value);
    const historyGone = history.status === 'fulfilled' && !history.value.error && history.value.count === 0;
    if (identityGone && historyGone) return reply(200, 'deleted', '账号和本站历史记录已删除。',
      { deleted: true, pendingVerification: false });
    // Deletion may already have invalidated this identity. Do not promise that
    // repeating sign-in or this endpoint can complete a failed verification.
    return reply(202, 'deletion_unconfirmed', '注销结果仍待核验；当前不能确认账号和历史记录均已删除。',
      { pendingVerification: true });
  };
}

// Root api/ is a Vercel Function; Astro's static output/config stays unchanged.
export default { fetch: request => createAccountDeleteHandler()(request) };
