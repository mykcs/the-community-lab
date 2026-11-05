import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';

// A Pages-only build must still react to every reachable build-time script,
// while verification-only probes/tests must not redeploy unchanged public HTML.
const read = file => readFileSync(file, 'utf8');
const pages = read('.github/workflows/pages.yml');
const verify = read('.github/workflows/verify.yml');
const beforeJobs = pages.split('\npermissions:')[0];
const publishPaths = new Set([...beforeJobs.matchAll(/^\s+- '([^']+)'/gm)].map(m => m[1]));

function findBuildScriptImports() {
  const visited = new Set();
  const pending = ['src/pages/index.astro', 'src/pages/questionnaire/index.astro', 'astro.config.mjs'];
  while (pending.length) {
    const file = pending.pop();
    if (visited.has(file)) continue;
    assert.ok(existsSync(file), `missing referenced build module: ${file}`);
    visited.add(file);
    let source = read(file);
    if (file.endsWith('.astro')) {
      const frontmatter = source.match(/^---\s*\n([\s\S]*?)\n---/);
      assert.ok(frontmatter, `missing Astro frontmatter in ${file}`);
      source = frontmatter[1];
    }
    for (const match of source.matchAll(/\b(?:from\s*|import\s*)['"]((?:\.\.\/|\.\/)[^'"]+)['"]/g)) {
      const spec = match[1];
      let resolved = path.posix.normalize(path.posix.join(path.posix.dirname(file), spec));
      if (!path.posix.extname(resolved)) resolved += '.mjs';
      if (/\.(?:mjs|js|astro)$/.test(resolved)) pending.push(resolved);
    }
  }
  return [...visited].filter(file => file.startsWith('scripts/')).sort();
}

test('Pages redeploys on static build dependencies, not research-only changes', () => {
  assert.equal(publishPaths.has('scripts/**'), false);
  assert.equal(publishPaths.has('tests/**'), false);
  assert.equal(publishPaths.has('e2e/**'), false);
  for (const file of findBuildScriptImports()) {
    assert.ok(publishPaths.has(file), `Pages must rebuild when ${file} changes`);
  }
  for (const path of ['src/**', 'data/**', 'lib/**',
    'docs/translation-review/**', 'docs/original-question-translation-review/**']) {
    assert.ok(publishPaths.has(path), `missing public build input: ${path}`);
  }
  // Full CI continues to protect PRs that change research and unit tests.
  assert.match(verify, /'scripts\/\*\*'/);
  assert.match(verify, /'tests\/\*\*'/);
});
