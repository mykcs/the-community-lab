import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const workflow = readFileSync(new URL('../.github/workflows/pages.yml', import.meta.url), 'utf8');
const verifyWorkflow = readFileSync(new URL('../.github/workflows/verify.yml', import.meta.url), 'utf8');
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
  assert.match(workflow, /docs\/original-question-translation-review\/\*\*/);
  assert.match(workflow, /public\/\*\*/);
  assert.match(workflow, /cp docs\/translation-review\/index\.html dist\/translation-review\/index\.html/);
  assert.match(workflow, /cp docs\/original-question-translation-review\/index\.html dist\/original-question-translation-review\/index\.html/);
  assert.match(workflow, /path:\s*\.\/dist/);
  assert.match(workflow, /uses: actions\/deploy-pages@368f82528645a54fb793d4d04e342629a3f51346 # v5\.0\.1/);
  assert.match(workflow, /pages:\s*write/);
  assert.match(workflow, /id-token:\s*write/);
});

test('GitHub workflows use pinned Node 24 action releases and a fixed Ubuntu LTS image', () => {
  const workflows = [workflow, verifyWorkflow, translationWorkflow];
  for (const yaml of workflows) {
    assert.match(yaml, /runs-on: ubuntu-24\.04/);
    assert.match(yaml, /uses: actions\/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1 # v7\.0\.1/);
    assert.match(yaml, /uses: actions\/setup-node@949feb2413d6458794dcd2491c4babbbce0c15c1 # v7\.1\.0/);
    assert.match(yaml, /node-version: ['"]?24['"]?/);
    assert.doesNotMatch(yaml, /ubuntu-latest|actions\/(?:checkout|setup-node)@v[0-9]+/);
  }
  assert.match(workflow, /uses: actions\/upload-pages-artifact@fc324d3547104276b827a68afc52ff2a11cc49c9 # v5\.0\.0/);
});

test('Vercel stays available as rollback but no longer auto-deploys Git pushes', () => {
  assert.equal(vercel.git.deploymentEnabled, false);
});

test('Only the unified Pages workflow deploys; translation review still has its own validation', () => {
  assert.match(translationWorkflow, /name: Validate translation review draft/);
  assert.match(translationWorkflow, /- run: node --test tests\/translation-review-page\.test\.mjs/);
  assert.doesNotMatch(translationWorkflow, /deploy-pages|upload-pages-artifact|pages:\s*write/);
});

test('the homepage distinguishes source-question pilot from the translation review draft and official score', () => {
  assert.match(homepage, /https:\/\/mykcs\.github\.io\/the-community-lab\/translation-review\//);
  assert.match(homepage, /124 题[、和]\s*550 个选项/);
  assert.match(homepage, /questionnaire\/\?season=2/);
  assert.match(homepage, /questionnaire\/\?season=1/);
  assert.match(homepage, /非官方原题试填/);
  assert.match(homepage, /真人复核/);
  assert.match(homepage, /不提供官方分数或嘉宾匹配/);
});

test('the homepage value-axis figure is illustrative, Chinese-readable, and not a personal result', () => {
  const figure = homepage.match(/<figure class="hero-art"[^>]*>([\s\S]*?)<\/figure>/)?.[1];
  assert.ok(figure, 'the hero diagram must use a semantic figure');
  assert.match(figure, /figcaption class="hero-axis-caption" id="hero-axis-caption"/);
  assert.match(figure, /第二季的三个价值维度/);
  assert.match(figure, /示意图 · 不代表个人结果/);
  for (const axis of ['01', '原则', '结果', '02', '结构', '能力', '03', '意义', '实利']) assert.ok(figure.includes(axis), axis);
  assert.match(figure, /aria-hidden="true"/);
  assert.doesNotMatch(figure, /YOUR POSITION|당신의 좌표/);
});

test('Astro keeps Vercel rollback origin and uses GitHub project subpath only for Pages', () => {
  assert.match(astro, /output:\s*'static'/);
  assert.match(astro, /process\.env\.COMMUNITY_DEPLOY_TARGET === 'github-pages'/);
  assert.match(astro, /https:\/\/mykcs\.github\.io/);
  assert.match(astro, /\/the-community-lab\//);
  assert.match(astro, /https:\/\/the-community-lab\.vercel\.app/);
});

test('standalone questionnaire browser logic changes trigger PR Verify and Pages publication', () => {
  for (const [name, yaml] of [['PR/commit Verify', verifyWorkflow], ['production Pages', workflow]]) {
    assert.match(yaml, /['"]full-questionnaire-app\.mjs['"]/, name);
    if (name === 'PR/commit Verify') {
      assert.equal((yaml.match(/'full-questionnaire-app\.mjs'/g) || []).length, 2,
        'both pull_request and main push must trigger Verify');
    }
  }
});
