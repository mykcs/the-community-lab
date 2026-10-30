import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const config = JSON.parse(readFileSync(new URL('../vercel.json', import.meta.url), 'utf8'));

// The production static site now deploys from GitHub Pages. Retain Vercel's
// previous READY artifact for rollback, without creating new deployments for
// any Git push (including main, docs and pull request branches).
test('Vercel Git auto-deployments are disabled for every branch', () => {
  assert.equal(config.$schema, 'https://openapi.vercel.sh/vercel.json');
  assert.equal(config.git?.deploymentEnabled, false);
});

test('Vercel policy does not rely on legacy GitHub or ignored-build bypass', () => {
  assert.equal(config.github?.enabled, undefined);
  assert.equal(config.git.ignoredBuildStep, undefined);
});
