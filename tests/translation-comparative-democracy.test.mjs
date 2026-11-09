import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  extractDraftPack,
  createPrivateProgressReceipt,
  restorePrivateProgressReceipt,
} from '../lib/full-questionnaire.mjs';
import {
  attachTranslationFingerprints,
  loadFullQuestionnaire,
} from '../scripts/load-full-questionnaire.mjs';
import { verifyKoreanSourceSnapshot } from '../scripts/verify-korean-source-snapshot.mjs';

const pages = [
  'docs/translation-review/index.html',
  'docs/original-question-translation-review/index.html',
];

const cases = [
  {
    id: 's1-politics-11',
    ko: '자유시장에 맡기는 게 정부정책을 세우는 것보다 낫다.',
    before: '把事情交给自由市场处理，比制定政府政策更好。',
    after: '与由政府制定政策相比，交由自由市场调节更好。',
  },
  {
    id: 's1-openness-12',
    ko: '다수를 위해 소수가 희생하고 따르는 것이 민주주의의 원칙이다.',
    before: '为了多数人，少数人牺牲并服从，是民主主义的原则。',
    after: '少数人为多数人作出牺牲并服从，是民主的原则。',
  },
];

test('Two AI draft improvements keep both review sources identical and original values intact', () => {
  const [left, right] = pages.map(path => extractDraftPack(readFileSync(path, 'utf8')));
  assert.deepEqual(left, right, 'both published review variants must agree');
  assert.equal(left.questions.length, 124);
  assert.equal(left.independent_bilingual_review, 'NOT_DONE');
  const sourceOptions = left.questions.reduce((n, q) => n + q.options.length, 0);
  assert.equal(sourceOptions, 550);
  for (const item of cases) {
    const q = left.questions.find(row => row.id === item.id);
    assert.ok(q, item.id);
    assert.equal(q.source_text_ko, item.ko);
    assert.equal(q.translation_zh_cn, item.after);
    assert.equal(q.translation_version, 'draft-0.1.1');
    assert.match(q.translator_note, /2026-11-09 AI 语言预审/);
    assert.match(q.translator_note, /仍待独立韩中人工复核/);
    assert.equal(q.translation_status, 'AI_DRAFT_UNREVIEWED');
    assert.equal(q.review_status, 'draft');
    assert.equal(q.rights_status, 'user_reported_permission_unverified');
    assert.equal(q.scoring_version, 'UNKNOWN');
    assert.deepEqual(q.options.map(({ value, ko, zh_cn }) => [value, ko, zh_cn]), [
      [1, '매우 반대', '非常反对'],
      [2, '', '2分'],
      [3, '약간 반대', '略微反对'],
      [4, '약간 동의', '略微赞同'],
      [5, '', '5分'],
      [6, '강하게 동의', '强烈赞同'],
    ]);
  }
  const pack = loadFullQuestionnaire();
  assert.equal(verifyKoreanSourceSnapshot(pack), true);
  assert.equal(pack.scoringVersion, 'UNKNOWN');
  assert.equal(pack.seasons[1].length, 87);
  assert.equal(pack.seasons[2].length, 37);
});

for (const item of cases) {
  test(item.id + ' historic synthetic answer preserves the source value but requires current Chinese reconfirmation', () => {
    const current = loadFullQuestionnaire();
    const previous = structuredClone(current);
    const position = previous.seasons[1].findIndex(q => q.id === item.id);
    assert.ok(position >= 0);
    const oldQuestion = previous.seasons[1][position];
    oldQuestion.draftZh = item.before;
    oldQuestion.translationVersion = 'draft-0.1.0';
    oldQuestion.readerNote = null;
    attachTranslationFingerprints(previous);
    const receipt = createPrivateProgressReceipt(previous, 1, { [item.id]: 1 }, position);
    const restored = restorePrivateProgressReceipt(current, receipt);
    assert.deepEqual(restored.changedQuestionIds, [item.id]);
    assert.equal(restored.answers[item.id], 1);
    assert.equal(restored.answerVersions[item.id], 'draft-0.1.0');
    assert.equal(restored.complete, false);
  });
}
