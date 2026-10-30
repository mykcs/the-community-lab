import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';

// Run on the built artifact, not on source templates: this catches root-relative
// links that would silently leave a GitHub project Pages deployment.
const pages = [
  ['index.html', ['history/', 'privacy/']],
  ['history/index.html', ['', 'privacy/']],
  ['privacy/index.html', ['', 'history/']],
  ['auth/callback/index.html', ['', 'history/']],
];
const base = '/the-community-lab/';
for (const [file, required] of pages) {
  const html = readFileSync(new URL(`../dist/${file}`, import.meta.url), 'utf8');
  const localLinks = [...html.matchAll(/href="(\/[^"#?]*)"/g)].map(match => match[1]);
  for (const href of localLinks) assert.ok(href.startsWith(base), `${file}: escaped Pages base: ${href}`);
  for (const route of required) assert.ok(localLinks.includes(`${base}${route}`), `${file}: missing ${route}`);
}
const assets = readdirSync(new URL('../dist/_astro/', import.meta.url)).filter(name => name.endsWith('.js'));
const script = assets.map(name => readFileSync(new URL(`../dist/_astro/${name}`, import.meta.url), 'utf8')).join('\n');
assert.ok(script.includes('account-delete'), 'History account removal must include the Edge endpoint');
assert.ok(!script.includes('/api/account-delete'), 'Static Pages bundle cannot call the old Vercel-only API');
assert.ok(script.includes('auth/callback/'), 'OAuth callback URL must remain in the built bundle');
console.log(`Pages history navigation: ${pages.length} routes verified under ${base}`);
