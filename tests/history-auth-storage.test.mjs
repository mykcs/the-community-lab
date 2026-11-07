import test from 'node:test';
import assert from 'node:assert/strict';
import { authSessionStorage, clearPkceStorage } from '../lib/history-auth-storage.mjs';
import { HISTORY_AUTH_STORAGE_KEY } from '../lib/history-config.mjs';
test('auth storage keeps the required Supabase session but never persists GitHub provider credentials', () => {
  const data = new Map();
  const storage = authSessionStorage({ getItem: key => data.get(key) ?? null,
    setItem: (key, value) => data.set(key, value), removeItem: key => data.delete(key) });
  storage.setItem(HISTORY_AUTH_STORAGE_KEY, JSON.stringify({ access_token: 'synthetic-session', refresh_token: 'synthetic-refresh',
    provider_token: 'synthetic-provider', provider_refresh_token: 'synthetic-provider-refresh', user: { id: 'synthetic' } }));
  const persisted = JSON.parse(data.get(HISTORY_AUTH_STORAGE_KEY));
  assert.equal(persisted.access_token, 'synthetic-session');
  assert.equal(persisted.refresh_token, 'synthetic-refresh');
  assert.equal(Object.hasOwn(persisted, 'provider_token'), false);
  assert.equal(Object.hasOwn(persisted, 'provider_refresh_token'), false);
  storage.setItem(`${HISTORY_AUTH_STORAGE_KEY}-code-verifier`, 'synthetic-pkce-verifier');
  assert.equal(storage.getItem(`${HISTORY_AUTH_STORAGE_KEY}-code-verifier`), 'synthetic-pkce-verifier');
  storage.removeItem(HISTORY_AUTH_STORAGE_KEY); assert.equal(storage.getItem(HISTORY_AUTH_STORAGE_KEY), null);
});

test('cleanup removes all SDK PKCE slots including orphaned indices, preserving the session and unrelated storage', () => {
  const data = new Map([[HISTORY_AUTH_STORAGE_KEY, 'synthetic-session'], ['other-key', 'keep'],
    [`${HISTORY_AUTH_STORAGE_KEY}-code-verifier`, 'legacy'], [`${HISTORY_AUTH_STORAGE_KEY}-flows-code-verifier`, 'index'],
    [`${HISTORY_AUTH_STORAGE_KEY}-flow-12345678-code-verifier`, 'slot'],
    [`${HISTORY_AUTH_STORAGE_KEY}-flow-abcdefgh-code-verifier`, 'orphan-slot']]);
  const storage = { get length() { return data.size; }, key: index => [...data.keys()][index], removeItem: key => data.delete(key) };
  clearPkceStorage(storage);
  assert.deepEqual([...data], [[HISTORY_AUTH_STORAGE_KEY, 'synthetic-session'], ['other-key', 'keep']]);
  assert.throws(() => clearPkceStorage({ get length() { throw new Error('blocked'); }, removeItem() {} }), /未确认清除/);
});
