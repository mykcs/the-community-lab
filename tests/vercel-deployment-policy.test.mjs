import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const config = JSON.parse(readFileSync(new URL('../vercel.json', import.meta.url), 'utf8'));

// Docs-only research branches should not consume scarce Preview deployments.
// All unspecified branches, especially main and code fixes, retain Vercel's
// default Git Preview/Production deployment behavior.
test('Vercel skips only explicitly named docs and research branch families', () => {
  assert.equal(config.$schema, 'https://openapi.vercel.sh/vercel.json');
  assert.deepEqual(config.git?.deploymentEnabled, {
    'docs/**': false,
    'research/**': false,
  });
});

test('Vercel configuration does not disable main or implementation previews', () => {
  const disabled = config.git.deploymentEnabled;
  for (const protectedBranch of ['main', 'fix/**', 'feat/**', 'ops/**', 'release/**']) {
    assert.equal(Object.hasOwn(disabled, protectedBranch), false);
  }
  assert.equal(config.github?.enabled, undefined);
  assert.equal(config.git.ignoredBuildStep, undefined);
});
