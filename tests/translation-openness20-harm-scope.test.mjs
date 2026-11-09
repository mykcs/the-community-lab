import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  extractDraftPack, createPrivateProgressReceipt, restorePrivateProgressReceipt,
} from '../lib/full-questionnaire.mjs';
import {
  attachTranslationFingerprints, loadFullQuestionnaire,
} from '../scripts/load-full-questionnaire.mjs';

const primary = extractDraftPack(readFileSync(
  new URL('../docs/translation-review/index.html', import.meta.url), 'utf8'));
const standalone = extractDraftPack(readFileSync(
  new URL('../docs/original-question-translation-review/index.html', import.meta.url), 'utf8'));

test('S1 protest wording preserves Korean source, six raw values and the breadth of 피해', () => {
  const a = primary.questions.find(q => q.id === 's1-openness-20');
  const b = standalone.questions.find(q => q.id === 's1-openness-20');
  const current = loadFullQuestionnaire().seasons[1].find(q => q.id === a.id);
  assert.deepEqual(a, b);
  assert.equal(a.source_text_ko,
    '장애인들이 바쁜 출퇴근 시간에까지 피해를 끼치며 시위하는 것은 동의할 수 없다.');
  assert.equal(a.translation_zh_cn,
    '我无法认同残障人士甚至在繁忙的上下班高峰时段示威、给他人造成不利影响的做法。');
  assert.deepEqual(a.options.map(o => o.value), [1, 2, 3, 4, 5, 6]);
  assert.equal(a.translation_version, 'draft-0.1.4');
  assert.match(a.translator_note, /피해를 끼치며/);
  assert.match(a.translator_note, /人身伤害或财产损失/);
  assert.equal(a.review_status, 'draft');
  assert.equal(a.translation_status, 'AI_DRAFT_UNREVIEWED');
  assert.equal(a.scoring_version, 'UNKNOWN');
  assert.equal(current.draftZh, a.translation_zh_cn);
  assert.equal(primary.questions.length, 124);
  assert.equal(standalone.questions.length, 124);
});

test('old S1 local progress retains its raw answer and requires reconfirmation after revised wording', () => {
  const current = loadFullQuestionnaire();
  const old = structuredClone(current);
  const q = old.seasons[1].find(q => q.id === 's1-openness-20');
  const index = old.seasons[1].indexOf(q);
  q.draftZh = '我无法认同残障人士甚至在繁忙的上下班高峰时段示威并给他人造成损害。';
  q.translationVersion = 'draft-0.1.3';
  attachTranslationFingerprints(old);
  const receipt = createPrivateProgressReceipt(old, 1, { [q.id]: 4 }, index);
  const restored = restorePrivateProgressReceipt(current, receipt);
  assert.equal(restored.answers[q.id], 4);
  assert.deepEqual(restored.changedQuestionIds, [q.id]);
  assert.equal(restored.answerVersions[q.id], 'draft-0.1.3');
  assert.equal(restored.complete, false);
});
