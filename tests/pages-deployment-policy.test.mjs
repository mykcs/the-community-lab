import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const workflow = readFileSync(new URL('../.github/workflows/pages.yml', import.meta.url), 'utf8');
const translationWorkflow = readFileSync(new URL('../.github/workflows/github-pages-translation-review.yml', import.meta.url), 'utf8');
const astro = readFileSync(new URL('../astro.config.mjs', import.meta.url), 'utf8');
const homepage = readFileSync(new URL('../src/pages/index.astro', import.meta.url), 'utf8');
const vercel = JSON.parse(readFileSync(new URL('../vercel.json', import.meta.url), 'utf8'));

test('Pages builds static site from main after all project checks', () => {
  assert.match(workflow, /branches:\s*\[main\]/);
  assert.match(workflow, /COMMUNITY_DEPLOY_TARGET:\s*github-pages/);
  assert.match(workflow, /- run: npm ci/);
  assert.match(workflow, /- run: npm run check/);
  assert.match(workflow, /- run: npm run build/);
  assert.match(workflow, /docs\/translation-review\/\*\*/);
  assert.match(workflow, /public\/\*\*/);
  assert.match(workflow, /cp docs\/translation-review\/index\.html dist\/translation-review\/index\.html/);
  assert.match(workflow, /path:\s*\.\/dist/);
  assert.match(workflow, /uses: actions\/deploy-pages@v4/);
  assert.match(workflow, /pages:\s*write/);
  assert.match(workflow, /id-token:\s*write/);
});

test('Vercel stays available as rollback but no longer auto-deploys Git pushes', () => {
  assert.equal(vercel.git.deploymentEnabled, false);
});

test('Only the unified Pages workflow deploys; translation review still has its own validation', () => {
  assert.match(translationWorkflow, /name: Validate translation review draft/);
  assert.match(translationWorkflow, /- run: node --test tests\/translation-review-page\.test\.mjs/);
  assert.doesNotMatch(translationWorkflow, /deploy-pages|upload-pages-artifact|pages:\s*write/);
});

test('the homepage makes the public translation review route discoverable and labels it as an unreviewed draft', () => {
  assert.match(homepage, /https:\/\/mykcs\.github\.io\/the-community-lab\/translation-review\//);
  assert.match(homepage, /124 题和 550 个选项/);
  assert.match(homepage, /尚无独立人工韩中复核，不能作为正式测试/);
});

test('Astro keeps Vercel rollback origin and uses GitHub project subpath only for Pages', () => {
  assert.match(astro, /output:\s*'static'/);
  assert.match(astro, /process\.env\.COMMUNITY_DEPLOY_TARGET === 'github-pages'/);
  assert.match(astro, /https:\/\/mykcs\.github\.io/);
  assert.match(astro, /\/the-community-lab\//);
  assert.match(astro, /https:\/\/the-community-lab\.vercel\.app/);
});
