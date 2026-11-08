import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { extractDraftPack, createPrivateProgressReceipt, restorePrivateProgressReceipt } from '../lib/full-questionnaire.mjs';
import { loadFullQuestionnaire } from '../scripts/load-full-questionnaire.mjs';
import { verifyKoreanSourceSnapshot } from '../scripts/verify-korean-source-snapshot.mjs';

const pages = ['docs/translation-review/index.html', 'docs/original-question-translation-review/index.html'];
const originalKo = '대학 시절의 주된 기억 중 하나는 아르바이트였다';
const revisedZh = '大学时期，打工是我主要的回忆之一。';

test('s1-class-10 AI draft avoids an unsupported superlative', () => {
  const drafts = pages.map(path => extractDraftPack(readFileSync(path, 'utf8')));
  const rows = drafts.map(draft => {
    const q = draft.questions.find(item => item.id === 's1-class-10');
    assert.ok(q);
    assert.equal(q.source_text_ko, originalKo);
    assert.equal(q.translation_zh_cn, revisedZh);
    assert.equal(q.translation_version, 'draft-0.1.2');
    assert.match(q.translator_note, /最主要/);
    assert.match(q.translator_note, /独立韩中人工复核/);
    assert.equal(q.review_status, 'draft');
    assert.equal(q.translation_status, 'AI_DRAFT_UNREVIEWED');
    assert.equal(q.rights_status, 'user_reported_permission_unverified');
    assert.equal(q.scoring_version, 'UNKNOWN');
    assert.equal(draft.independent_bilingual_review, 'NOT_DONE');
    assert.deepEqual(q.options.map(option => option.value), [1, 2, 3, 4]);
    return q;
  });
  assert.deepEqual(rows[0], rows[1], 'both public review pages must agree');
  const pack = loadFullQuestionnaire();
  assert.equal(pack.seasons[1].find(q => q.id === 's1-class-10')?.draftZh, revisedZh);
  assert.equal(verifyKoreanSourceSnapshot(pack), true);
  assert.equal(pack.scoringVersion, 'UNKNOWN');
});

test('s1-class-10 old backups keep raw choice and require reconfirmation', () => {
  const pack = loadFullQuestionnaire();
  const index = pack.seasons[1].findIndex(q => q.id === 's1-class-10');
  assert.ok(index >= 0);
  const old = createPrivateProgressReceipt(pack, 1, { 's1-class-10': 1 }, index);
  old.selections[0].translationVersion = 'draft-0.1.1';
  const restored = restorePrivateProgressReceipt(pack, old);
  assert.deepEqual(restored.changedQuestionIds, ['s1-class-10']);
  assert.equal(restored.answers['s1-class-10'], 1);
});
