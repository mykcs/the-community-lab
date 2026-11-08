import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { selectedDeployTarget } from '../scripts/deploy-target.mjs';

const stageScript = fileURLToPath(new URL('../scripts/stage-review-pages.mjs', import.meta.url));

test('GitHub Pages is the default build; Vercel requires explicit opt-in', () => {
  assert.equal(selectedDeployTarget({}), 'github-pages');
  assert.equal(selectedDeployTarget({ COMMUNITY_DEPLOY_TARGET: 'github-pages' }), 'github-pages');
  assert.equal(selectedDeployTarget({ COMMUNITY_DEPLOY_TARGET: 'vercel' }), 'vercel');
  assert.throws(() => selectedDeployTarget({ COMMUNITY_DEPLOY_TARGET: '' }), /Unsupported/);
  assert.throws(() => selectedDeployTarget({ COMMUNITY_DEPLOY_TARGET: 'github-page' }), /Unsupported/);
});

test('the normal local build stages BOTH reviewer routes; explicit Vercel rollback does not', () => {
  const root = mkdtempSync(join(tmpdir(), 'community-build-target-'));
  const routes = ['translation-review', 'original-question-translation-review'];
  try {
    for (const route of routes) {
      const source = join(root, 'docs', route, 'index.html');
      mkdirSync(dirname(source), { recursive: true });
      writeFileSync(source, `<!doctype html><title>synthetic ${route}</title>`);
    }
    const defaultEnv = { ...process.env };
    delete defaultEnv.COMMUNITY_DEPLOY_TARGET;
    const run = env => spawnSync(process.execPath, [stageScript], {
      cwd: root, env, encoding: 'utf8',
    });

    const defaultRun = run(defaultEnv);
    assert.equal(defaultRun.status, 0, defaultRun.stderr);
    for (const route of routes) {
      assert.equal(
        readFileSync(join(root, 'dist', route, 'index.html'), 'utf8'),
        readFileSync(join(root, 'docs', route, 'index.html'), 'utf8'),
      );
    }

    rmSync(join(root, 'dist'), { recursive: true, force: true });
    const rollbackRun = run({ ...defaultEnv, COMMUNITY_DEPLOY_TARGET: 'vercel' });
    assert.equal(rollbackRun.status, 0, rollbackRun.stderr);
    assert.equal(existsSync(join(root, 'dist')), false,
      'rollback must not unexpectedly publish Pages-only reviewer routes');

    const invalidRun = run({ ...defaultEnv, COMMUNITY_DEPLOY_TARGET: 'unknown-target' });
    assert.notEqual(invalidRun.status, 0, 'invalid target must fail closed');
    assert.equal(existsSync(join(root, 'dist')), false);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
