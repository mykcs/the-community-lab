import test from 'node:test';
import assert from 'node:assert/strict';
import { getHistoryConfig } from '../lib/history-config.mjs';

const configured = { authEnabled: true, siteOrigin: 'https://app.example', supabaseUrl: 'https://project.supabase.co', publishableKey: 'sb_publishable_synthetic' };
test('history defaults off and neither a save flag nor browser key can replace absent configuration', () => {
  assert.equal(getHistoryConfig().configured, false);
  assert.equal(getHistoryConfig({ saveEnabled: true }).saveAvailable, false);
  assert.equal(getHistoryConfig(configured, 'https://app.example').configured, true);
  assert.equal(getHistoryConfig(configured, 'https://app.example').saveAvailable, false);
});
test('exact callback origin and publishable-only key reject open redirects or accidental server secrets', () => {
  for (const patch of [
    { siteOrigin: 'https://app.example/redirect' }, { siteOrigin: 'https://app.example?next=https://elsewhere.example' },
    { siteOrigin: 'https://user:password@app.example' }, { supabaseUrl: 'http://project.supabase.co' },
    { supabaseUrl: 'https://project.supabase.co/auth/v1' }, { publishableKey: 'sb_secret_must_never_bundle' },
  ]) assert.equal(getHistoryConfig({ ...configured, ...patch }, 'https://app.example').configured, false);
  assert.equal(getHistoryConfig(configured, 'https://another-preview.example').configured, false);
  assert.equal(getHistoryConfig({ ...configured, siteOrigin: 'http://127.0.0.1:4321' }, 'http://127.0.0.1:4321').configured, true);
});
test('undecided privacy/region/retention/deletion gates prevent new saves while configured account access remains possible', () => {
  const ready = { ...configured, saveEnabled: true, privacyApproved: true, deletionAvailable: true, regionLabel: 'synthetic region', retentionLabel: 'synthetic policy' };
  assert.equal(getHistoryConfig(ready, configured.siteOrigin).saveAvailable, true);
  for (const patch of [{ regionLabel: '' }, { retentionLabel: '' }, { privacyApproved: false }, { deletionAvailable: false }, { saveEnabled: false }]) {
    const config = getHistoryConfig({ ...ready, ...patch }, configured.siteOrigin);
    assert.equal(config.configured, true);
    assert.equal(config.saveAvailable, false);
  }
});
