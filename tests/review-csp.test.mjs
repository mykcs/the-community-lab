import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { REVIEW_PAGES, withReviewCsp, checkReviewCsp, expectedReviewCsp } from '../scripts/sync-review-csp.mjs';

test('both standalone bilingual review pages pin one script hash and deny outgoing subresources', async () => {
  await checkReviewCsp();
  for (const page of REVIEW_PAGES) {
    const source = await readFile(page, 'utf8');
    const policy = expectedReviewCsp(source);
    assert.equal(withReviewCsp(source), source, `${page}: stale or missing CSP`);
    assert.match(policy, /script-src 'sha256-[\w+/=]+'/);
    assert.doesNotMatch(policy, /script-src[^;]*unsafe-inline/);
    for (const directive of [
      "default-src 'none'", "connect-src 'none'", "frame-src 'none'",
      "media-src 'none'", "form-action 'none'", "worker-src 'none'",
      'img-src data:',
    ]) assert.ok(policy.includes(directive), `${page}: missing ${directive}`);
  }
});

test('review CSP check is invalidated by a changed inline executable script', async () => {
  for (const page of REVIEW_PAGES) {
    const html = await readFile(page, 'utf8');
    const mutated = html.replace('<script>\n', '<script>\n// synthetic drift (no user data)\n');
    assert.notEqual(mutated, html);
    assert.notEqual(withReviewCsp(mutated), mutated, `${page}: old hash incorrectly accepted`);
  }
});

test('review CSP generator rejects a second inline script or remote script', async () => {
  const html = await readFile(REVIEW_PAGES[0], 'utf8');
  assert.throws(() => expectedReviewCsp(html.replace('</head>', '<script>void 0</script></head>')));
  assert.throws(() => expectedReviewCsp(html.replace('</head>', '<script src="https://example.invalid/demo.js"></script></head>')));
});
