import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { extractDraftPack, createPrivateProgressReceipt, restorePrivateProgressReceipt } from '../lib/full-questionnaire.mjs';
import { attachTranslationFingerprints, loadFullQuestionnaire } from '../scripts/load-full-questionnaire.mjs';

// Regression-only Chinese draft copy. This is NOT independent human review of
// third-party Korean questions or permission to release an official scorer.
const corrections = [
  {
    id: 's1-openness-14',
    previous: '大众媒体频繁出现正面的性少数群体角色，是提高少数群体可见度的好方法。',
    current: '大众媒体频繁出现正面的性少数群体角色，是提高性少数群体可见度的好方法。',
    before: 'draft-0.1.0', after: 'draft-0.1.1',
  },
  {
    id: 's1-openness-19',
    previous: '对美国黑人群体的歧视在某种程度上有合理依据。',
    current: '在美国，对黑人群体的歧视在某种程度上有合理依据。',
    before: 'draft-0.1.0', after: 'draft-0.1.1',
  },
  {
    id: 's1-class-21',
    previous: '我的家人或亲戚大多读完了四年制大学。',
    current: '我的家人或亲戚大多毕业于四年制大学。',
    before: 'draft-0.1.1', after: 'draft-0.1.2',
  },
];

const source = extractDraftPack(readFileSync(
  new URL('../docs/translation-review/index.html', import.meta.url), 'utf8'));
const independentView = extractDraftPack(readFileSync(
  new URL('../docs/original-question-translation-review/index.html', import.meta.url), 'utf8'));
const pack = loadFullQuestionnaire();

test('three S1 AI meaning clarifications propagate to both review pages and private pilot only', () => {
  for (const row of corrections) {
    const first = source.questions.find(q => q.id === row.id);
    const second = independentView.questions.find(q => q.id === row.id);
    const displayed = pack.seasons[1].find(q => q.id === row.id);
    assert.ok(first && second && displayed, row.id);
    assert.equal(first.translation_zh_cn, row.current);
    assert.equal(second.translation_zh_cn, row.current);
    assert.equal(displayed.draftZh, row.current);
    assert.equal(first.translation_version, row.after);
    assert.equal(second.translation_version, row.after);
    assert.equal(displayed.translationVersion, row.after);
    assert.equal(first.source_text_ko, second.source_text_ko);
    assert.deepEqual(first.options, second.options);
    assert.equal(first.review_status, 'draft');
    assert.equal(first.translation_status, 'AI_DRAFT_UNREVIEWED');
    assert.equal(first.rights_status, 'user_reported_permission_unverified');
    assert.equal(first.scoring_version, 'UNKNOWN');
  }
  assert.equal(source.questions.length, 124);
  assert.equal(independentView.questions.length, 124);
  assert.equal(pack.scoringVersion, 'UNKNOWN');
});

test('previous wording receipts retain source choices and require fresh confirmation after S1 revisions', () => {
  for (const row of corrections) {
    const previousPack = structuredClone(pack);
    const q = previousPack.seasons[1].find(item => item.id === row.id);
    q.draftZh = row.previous;
    q.translationVersion = row.before;
    attachTranslationFingerprints(previousPack);
    const selectedValue = q.options[0].value;
    const oldReceipt = createPrivateProgressReceipt(
      previousPack, 1, { [q.id]: selectedValue }, previousPack.seasons[1].indexOf(q));
    const imported = restorePrivateProgressReceipt(pack, oldReceipt);
    assert.deepEqual(imported.changedQuestionIds, [row.id]);
    assert.equal(imported.answers[row.id], selectedValue);
    assert.equal(imported.answerVersions[row.id], row.before);
    assert.equal(imported.answerFingerprints[row.id], oldReceipt.selections[0].translationFingerprint);
    assert.equal(imported.complete, false);
  }
});
