import { HISTORY_AUTH_STORAGE_KEY } from './history-config.mjs';

export function clearPkceStorage(storage) {
  const keys = new Set([`${HISTORY_AUTH_STORAGE_KEY}-code-verifier`, `${HISTORY_AUTH_STORAGE_KEY}-flows-code-verifier`]);
  let failed = false;
  try {
    // Enumerate first, then remove: Storage.key indices shift on deletion.
    for (let index = 0; index < storage.length; index++) {
      const key = storage.key(index);
      if (typeof key === 'string' && key.startsWith(`${HISTORY_AUTH_STORAGE_KEY}-flow-`) &&
          /^[A-Za-z0-9_-]{8,64}-code-verifier$/.test(key.slice(`${HISTORY_AUTH_STORAGE_KEY}-flow-`.length))) keys.add(key);
    }
  } catch { failed = true; }
  for (const key of keys) { try { storage.removeItem(key); } catch { failed = true; } }
  if (failed) throw new Error('浏览器未确认清除登录校验缓存，请关闭当前标签页。');
}

// Supabase may return GitHub provider tokens alongside its own session. The
// website needs only the Supabase session; never persist provider credentials.
export function authSessionStorage(storage) {
  function filtered(key, value) {
    if (key !== HISTORY_AUTH_STORAGE_KEY) return value;
    const session = JSON.parse(value);
    delete session.provider_token; delete session.provider_refresh_token;
    return JSON.stringify(session);
  }
  return {
    getItem(key) { const value = storage.getItem(key); return value === null ? null : filtered(key, value); },
    setItem(key, value) { storage.setItem(key, filtered(key, value)); },
    removeItem(key) { storage.removeItem(key); },
  };
}
