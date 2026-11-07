import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { REVIEW_ROUTES, stageReviewPages } from '../scripts/stage-review-pages.mjs';

test('shared Pages build copies both reviewer HTML files byte-for-byte into preview routes', () => {
  const root = mkdtempSync(join(tmpdir(), 'community-pages-stage-'));
  try {
    assert.deepEqual(REVIEW_ROUTES, ['translation-review', 'original-question-translation-review']);
    for (const [index, route] of REVIEW_ROUTES.entries()) {
      const source = join(root, 'docs', route, 'index.html');
      mkdirSync(dirname(source), { recursive: true });
      writeFileSync(source, `<!doctype html><html lang="ko">合成测试 ${index} 한국어</html>`);
    }
    stageReviewPages(root);
    for (const route of REVIEW_ROUTES) {
      assert.equal(
        readFileSync(join(root, 'dist', route, 'index.html'), 'utf8'),
        readFileSync(join(root, 'docs', route, 'index.html'), 'utf8'),
      );
    }
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
