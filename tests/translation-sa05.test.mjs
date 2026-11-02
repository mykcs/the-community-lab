import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { extractDraftPack } from '../lib/full-questionnaire.mjs';
import { loadFullQuestionnaire } from '../scripts/load-full-questionnaire.mjs';
import { verifyKoreanSourceSnapshot } from '../scripts/verify-korean-source-snapshot.mjs';

const paths = [
  'docs/translation-review/index.html',
  'docs/original-question-translation-review/index.html',
];
const expected = '用缴纳所得税和财产税后积累的资产传给子女时，还要征收遗产税，是对个人资产的过度侵害。';

test('S2 sa05 AI draft distinguishes a later inheritance tax from a second inheritance-tax levy', () => {
  const rows = paths.map(path => {
    const draft = extractDraftPack(readFileSync(path, 'utf8'));
    const q = draft.questions.find(item => item.id === 'sa05');
    assert.ok(q, path);
    assert.equal(q.translation_zh_cn, expected, path);
    assert.equal(q.translation_version, 'draft-0.1.1', path);
    assert.equal(q.review_status, 'draft', path);
    assert.equal(q.translation_status, 'AI_DRAFT_UNREVIEWED', path);
    assert.match(q.translator_note, /不同税种/);
    assert.match(q.translator_note, /独立韩中人工复核/);
    assert.equal(draft.independent_bilingual_review, 'NOT_DONE');
    return q;
  });
  assert.deepEqual(rows, [rows[0], rows[0]], 'both public review pages must agree');
  const pack = loadFullQuestionnaire();
  assert.equal(pack.seasons[2].find(q => q.id === 'sa05').draftZh, expected);
  assert.equal(verifyKoreanSourceSnapshot(pack), true, 'pinned original Korean is unchanged');
  assert.equal(pack.scoringVersion, 'UNKNOWN');
});
