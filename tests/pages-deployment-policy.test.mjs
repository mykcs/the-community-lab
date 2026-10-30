import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const workflow = readFileSync(new URL('../.github/workflows/pages.yml', import.meta.url), 'utf8');
const astro = readFileSync(new URL('../astro.config.mjs', import.meta.url), 'utf8');

test('Pages builds static site from main after all project checks', () => {
  assert.match(workflow, /branches:\s*\[main\]/);
  assert.match(workflow, /COMMUNITY_DEPLOY_TARGET:\s*github-pages/);
  assert.match(workflow, /- run: npm ci/);
  assert.match(workflow, /- run: npm run check/);
  assert.match(workflow, /- run: npm run build/);
  assert.match(workflow, /path:\s*\.\/dist/);
  assert.match(workflow, /uses: actions\/deploy-pages@v4/);
  assert.match(workflow, /pages:\s*write/);
  assert.match(workflow, /id-token:\s*write/);
});

test('Astro keeps Vercel rollback origin and uses GitHub project subpath only for Pages', () => {
  assert.match(astro, /output:\s*'static'/);
  assert.match(astro, /process\.env\.COMMUNITY_DEPLOY_TARGET === 'github-pages'/);
  assert.match(astro, /https:\/\/mykcs\.github\.io/);
  assert.match(astro, /\/the-community-lab\//);
  assert.match(astro, /https:\/\/the-community-lab\.vercel\.app/);
});
