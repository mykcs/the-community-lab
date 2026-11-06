import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  extractDraftPack,
  createPrivateProgressReceipt,
  restorePrivateProgressReceipt,
} from '../lib/full-questionnaire.mjs';
import { loadFullQuestionnaire } from '../scripts/load-full-questionnaire.mjs';
import { verifyKoreanSourceSnapshot } from '../scripts/verify-korean-source-snapshot.mjs';

const reviewerPages = [
  'docs/translation-review/index.html',
  'docs/original-question-translation-review/index.html',
];
const expected = '选择职业时，比起银行账户上显示的金额，更应把是否适合自己、能否获得成就感放在首位。';

test('ms11 keeps the bank-account monetary metaphor without inventing a salary deposit', () => {
  const rows = reviewerPages.map(path => {
    const draft = extractDraftPack(readFileSync(path, 'utf8'));
    const q = draft.questions.find(row => row.id === 'ms11');
    assert.ok(q, path);
    assert.equal(
      q.source_text_ko,
      '직업을 선택할 때는 통장에 찍히는 숫자보다 적성이나 보람이 최우선이어야 한다.',
    );
    assert.equal(q.translation_zh_cn, expected, path);
    assert.equal(q.translation_version, 'draft-0.1.2', path);
    assert.doesNotMatch(q.translation_zh_cn, /工资到账/);
    assert.match(q.translator_note, /原文没有限定为/);
    assert.match(q.translator_note, /独立韩中人工复核/);
    assert.deepEqual(q.options.map(o => o.value), ['O', 'X']);
    assert.equal(q.agree_value_ko, '의미');
    assert.equal(q.translation_status, 'AI_DRAFT_UNREVIEWED');
    assert.equal(q.review_status, 'draft');
    assert.equal(draft.independent_bilingual_review, 'NOT_DONE');
    return q;
  });
  assert.deepEqual(rows[0], rows[1], 'two reviewer pages must use the same ms11 draft');

  const pack = loadFullQuestionnaire();
  assert.equal(pack.seasons[2].find(q => q.id === 'ms11').draftZh, expected);
  assert.equal(pack.scoringVersion, 'UNKNOWN');
  assert.equal(verifyKoreanSourceSnapshot(pack), true);
});

test('restoring an old ms11 wording record requires reconfirmation, not silent provenance upgrade', () => {
  const pack = loadFullQuestionnaire();
  const questions = pack.seasons[2];
  const index = questions.findIndex(q => q.id === 'ms11');
  assert.ok(index >= 0);
  const current = createPrivateProgressReceipt(pack, 2, { ms11: 'O' }, index);
  const oldRecord = {
    ...current,
    selections: current.selections.map(choice => ({
      ...choice,
      translationVersion: 'draft-0.1.1',
    })),
  };
  const restored = restorePrivateProgressReceipt(pack, oldRecord);
  assert.deepEqual(restored.changedQuestionIds, ['ms11']);
  assert.equal(restored.answers.ms11, 'O');
  assert.equal(restored.answerVersions.ms11, 'draft-0.1.1');
});
