import { getHistoryConfig, HISTORY_AUTH_STORAGE_KEY } from './history-config.mjs';
import { createHistoryService } from './history-service.mjs';
import { clearPendingHistory, PENDING_HISTORY_KEY } from './history-handoff.mjs';
import { authSessionStorage, clearPkceStorage } from './history-auth-storage.mjs';

const FLOW_KEY = 'community-auth-flow-v1';
const FLOW_TTL = 15 * 60 * 1000;
let clientPromise;

export function historyAuthOptions(storage) {
  return { auth: {
    flowType: 'pkce', storage: authSessionStorage(storage), storageKey: HISTORY_AUTH_STORAGE_KEY,
    persistSession: true, autoRefreshToken: true, detectSessionInUrl: false,
    experimental: { appendPkceFlowIdToRedirects: true },
  } };
}

export function browserHistoryConfig() {
  return getHistoryConfig({
    authEnabled: import.meta.env.PUBLIC_HISTORY_AUTH_ENABLED === 'true',
    saveEnabled: import.meta.env.PUBLIC_HISTORY_SAVE_ENABLED === 'true',
    privacyApproved: import.meta.env.PUBLIC_HISTORY_PRIVACY_APPROVED === 'true',
    deletionAvailable: import.meta.env.PUBLIC_HISTORY_DELETION_AVAILABLE === 'true',
    siteOrigin: import.meta.env.PUBLIC_HISTORY_SITE_ORIGIN,
    basePath: import.meta.env.BASE_URL,
    supabaseUrl: import.meta.env.PUBLIC_SUPABASE_URL,
    publishableKey: import.meta.env.PUBLIC_SUPABASE_PUBLISHABLE_KEY,
    regionLabel: import.meta.env.PUBLIC_HISTORY_REGION_LABEL,
    retentionLabel: import.meta.env.PUBLIC_HISTORY_RETENTION_LABEL,
  }, window.location.origin);
}

export async function historyClient() {
  const config = browserHistoryConfig();
  if (!config.configured) throw new Error('GitHub 登录与私人历史尚未启用。');
  clientPromise ??= import('@supabase/supabase-js').then(({ createClient }) => {
    // Test storage before starting OAuth. A redirect must not lose its PKCE
    // verifier because this browser silently refuses session storage.
    const storage = window.sessionStorage;
    const probe = 'community-storage-probe';
    storage.setItem(probe, '1'); storage.removeItem(probe);
    return createClient(config.supabaseUrl, config.publishableKey, historyAuthOptions(storage));
  }).catch(() => { clientPromise = undefined; throw new Error('暂时无法准备登录，请检查浏览器的同标签页存储权限后重试。'); });
  return clientPromise;
}

export async function historyContext() {
  const client = await historyClient();
  return { client, service: createHistoryService(client) };
}

export function clearLoginHandoff() {
  const storage = window.sessionStorage;
  let failed = false;
  try { clearPkceStorage(storage); } catch { failed = true; }
  for (const key of [PENDING_HISTORY_KEY, FLOW_KEY]) {
    try { storage.removeItem(key); } catch { failed = true; }
  }
  if (failed) throw new Error('浏览器未确认清除登录交接，请关闭当前标签页。');
}

export async function startGithubLogin({ preservePending = false } = {}) {
  const config = browserHistoryConfig();
  const storage = window.sessionStorage;
  const now = Date.now();
  let previous;
  try { previous = JSON.parse(storage.getItem(FLOW_KEY)); } catch { previous = null; }
  if (previous?.startedAt > now - FLOW_TTL && previous.startedAt <= now) throw new Error('当前标签页已有登录正在进行，请完成或取消后再试。');
  clearPkceStorage(storage);
  if (!preservePending) clearPendingHistory(storage);
  storage.setItem(FLOW_KEY, JSON.stringify({ startedAt: now, flowId: null }));
  try {
    const client = await historyClient();
    const { data, error } = await client.auth.signInWithOAuth({ provider: 'github', options: {
      redirectTo: `${config.siteOrigin}${config.callbackPath}`, skipBrowserRedirect: true,
    } });
    if (error || !data?.url) throw new Error('暂时无法前往 GitHub 登录，请稍后重试。');
    if (typeof data.flowId !== 'string' || !/^[A-Za-z0-9_-]{8,64}$/.test(data.flowId)) throw new Error('登录交接标识无效。');
    storage.setItem(FLOW_KEY, JSON.stringify({ startedAt: now, flowId: data.flowId }));
    const target = new URL(data.url);
    if (target.origin !== config.supabaseUrl || target.pathname !== '/auth/v1/authorize') throw new Error('登录地址未通过检查。');
    window.location.assign(target.href);
  } catch {
    clearLoginHandoff();
    throw new Error('暂时无法前往 GitHub，交接已取消，请重新开始。');
  }
}

export function consumeExpectedLogin() {
  const storage = window.sessionStorage;
  let flow;
  try { flow = JSON.parse(storage.getItem(FLOW_KEY)); } catch { flow = null; }
  storage.removeItem(FLOW_KEY);
  const now = Date.now();
  return flow && Number.isSafeInteger(flow.startedAt) && flow.startedAt > 0 && flow.startedAt <= now &&
    now - flow.startedAt < FLOW_TTL && typeof flow.flowId === 'string' && /^[A-Za-z0-9_-]{8,64}$/.test(flow.flowId) ? flow : null;
}

export function downloadHistory(records) {
  const blob = new Blob([JSON.stringify({ format: 'community-private-history-v1',
    notice: '本站原创示例结果，不代表节目官方成绩。', records }, null, 2)], { type: 'application/json;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url; anchor.download = 'community-private-history.json'; anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
