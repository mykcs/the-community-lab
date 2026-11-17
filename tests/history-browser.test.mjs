import test from 'node:test';
import assert from 'node:assert/strict';
import { createClient } from '@supabase/supabase-js';
import { historyAuthOptions } from '../lib/history-browser.mjs';
import { HISTORY_AUTH_STORAGE_KEY } from '../lib/history-config.mjs';

test('pinned Supabase JS emits the PKCE flow id required by the callback', async () => {
  const entries = new Map();
  const storage = {
    getItem: key => entries.get(key) ?? null,
    setItem: (key, value) => entries.set(key, value),
    removeItem: key => entries.delete(key),
  };
  const client = createClient('https://project.supabase.co', 'sb_publishable_synthetic', historyAuthOptions(storage));

  const { data, error } = await client.auth.signInWithOAuth({
    provider: 'github',
    options: { redirectTo: 'https://app.example/auth/callback/', skipBrowserRedirect: true },
  });

  assert.equal(error, null);
  assert.match(data.flowId, /^[A-Za-z0-9_-]{8,64}$/);
  const authorizeUrl = new URL(data.url);
  assert.equal(authorizeUrl.origin, 'https://project.supabase.co');
  assert.equal(authorizeUrl.pathname, '/auth/v1/authorize');
  assert.equal(authorizeUrl.searchParams.get('provider'), 'github');
  const redirectTo = new URL(authorizeUrl.searchParams.get('redirect_to'));
  assert.equal(redirectTo.searchParams.get('sb_flow_id'), data.flowId);
  assert.ok(entries.has(`${HISTORY_AUTH_STORAGE_KEY}-flow-${data.flowId}-code-verifier`));
  client.auth.stopAutoRefresh();
});
