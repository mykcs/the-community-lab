import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

// Canonical operational documents are a handoff contract for new agents.
// Test local references only; public external URL availability is a separate
// question and should not make a deterministic PR build network-dependent.
const documents = [
  'AGENTS.md', 'WISH.md', 'README.md',
  'docs/DEPLOYMENT.md', 'docs/VERIFICATION-MATRIX.md',
  'docs/TRANSLATION-STANDARD.md', 'docs/REUSE-IMPLEMENTATION-20261105.md',
];

function brokenLocalLinks(markdown, file) {
  const broken = [];
  for (const match of markdown.matchAll(/(?<!!)\[[^\]]+\]\(([^)]+)\)/g)) {
    const url = match[1].trim().split(/\s+"/)[0].replace(/^<|>$/g, '');
    if (!url || url.startsWith('#') || url.startsWith('/') ||
        /^[a-z][a-z\d+.-]*:/i.test(url)) continue;
    let path;
    try { path = decodeURIComponent(url.split(/[?#]/)[0]); }
    catch { broken.push(file + ': invalid encoded link ' + url); continue; }
    if (path && !existsSync(resolve(dirname(file), path))) {
      broken.push(file + ': ' + url);
    }
  }
  return broken;
}

test('project handoff documents have no broken relative links', () => {
  const missing = documents.flatMap(file => {
    assert.ok(existsSync(file), 'missing operational document: ' + file);
    return brokenLocalLinks(readFileSync(file, 'utf8'), file);
  });
  assert.deepEqual(missing, [], 'broken local references: ' + missing.join(', '));
});

test('missing local private-history file is detected rather than silently linked', () => {
  const typo = '[Private history](docs/__nonexistent_private_history_test_fixture__.md)';
  assert.deepEqual(brokenLocalLinks(typo, 'AGENTS.md'),
    ['AGENTS.md: docs/__nonexistent_private_history_test_fixture__.md']);
});
