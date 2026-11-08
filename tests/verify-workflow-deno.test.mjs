import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const workflow = readFileSync(new URL('../.github/workflows/verify.yml', import.meta.url), 'utf8');

test('Verify pins the official Deno npm runtime and type-checks without GitHub Release downloads', () => {
  assert.match(workflow, /npx --yes --registry=https:\/\/registry\.npmjs\.org deno@2\.5\.6 --version/);
  assert.match(workflow, /npx --yes --registry=https:\/\/registry\.npmjs\.org deno@2\.5\.6 check --config supabase\/functions\/account-delete\/deno\.json supabase\/functions\/account-delete\/index\.ts/);
  assert.doesNotMatch(workflow, /uses:\s*denoland\/setup-deno@/);
});
