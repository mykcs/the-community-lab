import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { extractDraftPack, createPrivateProgressReceipt, restorePrivateProgressReceipt } from '../lib/full-questionnaire.mjs';
import { loadFullQuestionnaire } from '../scripts/load-full-questionnaire.mjs';
import { verifyKoreanSourceSnapshot } from '../scripts/verify-korean-source-snapshot.mjs';

const paths = [
  'docs/translation-review/index.html',
  'docs/original-question-translation-review/index.html',
];
const expectedZh = '贫困者之所以无法摆脱贫困，主要是因为他们自身意志力不足、努力不够。';

test('S2 sa04 preserves the Korean causal attribution without awkward Chinese wording', () => {
  const drafts = paths.map(path => extractDraftPack(readFileSync(path, 'utf8')));
  const reviewed = drafts.map(draft => {
    const q = draft.questions.find(row => row.id === 'sa04');
    assert.ok(q);
    assert.match(q.source_text_ko, /본인의 의지와 노력이 부족/);
    assert.equal(q.translation_zh_cn, expectedZh);
    assert.equal(q.translation_version, 'draft-0.1.1');
    assert.match(q.translator_note, /因果判断/);
    assert.match(q.translator_note, /独立韩中人工复核/);
    assert.equal(q.review_status, 'draft');
    assert.equal(q.translation_status, 'AI_DRAFT_UNREVIEWED');
    assert.equal(q.rights_status, 'user_reported_permission_unverified');
    assert.equal(q.scoring_version, 'UNKNOWN');
    assert.deepEqual(q.options.map(option => option.value), ['O', 'X']);
    assert.equal(draft.independent_bilingual_review, 'NOT_DONE');
    return q;
  });
  assert.deepEqual(reviewed[0], reviewed[1], 'both public review pages must agree');
  const pack = loadFullQuestionnaire();
  assert.equal(pack.seasons[2].find(q => q.id === 'sa04')?.draftZh, expectedZh);
  assert.equal(verifyKoreanSourceSnapshot(pack), true, 'the source text and options remain pinned');
  assert.equal(pack.scoringVersion, 'UNKNOWN');
});

test('older sa04 receipts preserve raw choice and demand reconfirmation of edited draft', () => {
  const pack = loadFullQuestionnaire();
  const index = pack.seasons[2].findIndex(q => q.id === 'sa04');
  assert.ok(index >= 0);
  const previous = createPrivateProgressReceipt(pack, 2, { sa04: 'O' }, index);
  previous.selections[0].translationVersion = 'draft-0.1.0';
  const restored = restorePrivateProgressReceipt(pack, previous);
  assert.deepEqual(restored.changedQuestionIds, ['sa04']);
  assert.equal(restored.answers.sa04, 'O');
  assert.equal(restored.answerVersions.sa04, 'draft-0.1.0');
});
