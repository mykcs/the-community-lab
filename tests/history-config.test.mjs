import test from 'node:test';
import assert from 'node:assert/strict';
import { getHistoryConfig, siteRoutePath } from '../lib/history-config.mjs';

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
test('shared GitHub Pages origins cannot hold PKCE or Supabase session storage', () => {
  for (const sharedOrigin of ['https://github.io', 'https://mykcs.github.io', 'https://another-owner.github.io']) {
    const config = getHistoryConfig({ ...configured, siteOrigin: sharedOrigin, saveEnabled: true }, sharedOrigin);
    assert.equal(config.configured, false, sharedOrigin);
    assert.equal(config.saveAvailable, false, sharedOrigin);
  }
  assert.equal(getHistoryConfig({ ...configured, siteOrigin: 'https://github.io.example' }, 'https://github.io.example').configured, true);
});
test('dedicated root and project-base origins use fixed local callback routes', () => {
  const root = getHistoryConfig(configured, configured.siteOrigin);
  assert.equal(root.callbackPath, '/auth/callback/');
  assert.equal(siteRoutePath(root.basePath, 'history/'), '/history/');
  const pages = getHistoryConfig({ ...configured, basePath: '/the-community-lab/' }, configured.siteOrigin);
  assert.equal(pages.configured, true);
  assert.equal(pages.callbackPath, '/the-community-lab/auth/callback/');
  assert.equal(siteRoutePath(pages.basePath, 'history/'), '/the-community-lab/history/');
  const sharedPages = getHistoryConfig({ ...configured, siteOrigin: 'https://mykcs.github.io', basePath: '/the-community-lab/' }, 'https://mykcs.github.io');
  assert.equal(sharedPages.configured, false);
  assert.equal(sharedPages.saveAvailable, false);
  assert.equal(sharedPages.callbackPath, '/the-community-lab/auth/callback/');
  for (const badPath of ['/other/../admin/', '//attacker/', '/the-community-lab/?next=other',
    'https://attacker.invalid/', '/the-community-lab']) {
    assert.equal(getHistoryConfig({ ...configured, basePath: badPath }, configured.siteOrigin).configured, false);
  }
  for (const badRoute of ['../admin/', '//attacker/', 'history?code=x', 'https://attacker.invalid/']) {
    assert.throws(() => siteRoutePath('/the-community-lab/', badRoute), TypeError);
  }
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
