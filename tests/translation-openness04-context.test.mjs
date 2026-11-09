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

test('S1 ethnic-term reader note explains source context without changing its opinion prompt or values', () => {
  const a = primary.questions.find(q => q.id === 's1-openness-04');
  const b = standalone.questions.find(q => q.id === 's1-openness-04');
  const current = loadFullQuestionnaire().seasons[1].find(q => q.id === a.id);
  assert.deepEqual(a, b);
  assert.equal(a.source_text_ko,
    '조선족이 범죄를 저지를 확률이 높다고 느끼는 것은 편견에 사로잡힌 잘못된 생각이다.');
  assert.equal(a.translation_zh_cn, '觉得朝鲜族犯罪概率更高，是受偏见影响的错误想法。');
  assert.deepEqual(a.options.map(o => o.value), [1, 2, 3, 4, 5, 6]);
  assert.equal(a.translation_version, 'draft-0.1.1');
  assert.match(a.reader_note_zh_cn, /조선족.*中国朝鲜族/);
  assert.match(a.reader_note_zh_cn, /不为题目中的犯罪率判断提供证据/);
  assert.match(a.translator_note, /encykorea\.aks\.ac\.kr\/Article\/E0068435/);
  assert.equal(current.readerNote, a.reader_note_zh_cn);
  assert.equal(current.draftZh, a.translation_zh_cn);
  assert.equal(a.review_status, 'draft');
  assert.equal(a.translation_status, 'AI_DRAFT_UNREVIEWED');
  assert.equal(a.rights_status, 'user_reported_permission_unverified');
  assert.equal(a.scoring_version, 'UNKNOWN');
  assert.equal(primary.questions.length, 124);
  assert.equal(standalone.questions.length, 124);
});

test('old same-wording local answers keep source values but must re-confirm added Korean-term context', () => {
  const pack = loadFullQuestionnaire();
  const old = structuredClone(pack);
  const question = old.seasons[1].find(q => q.id === 's1-openness-04');
  const questionIndex = old.seasons[1].indexOf(question);
  question.readerNote = null;
  question.translationVersion = 'draft-0.1.0';
  attachTranslationFingerprints(old);
  const receipt = createPrivateProgressReceipt(old, 1, { [question.id]: 4 }, questionIndex);
  const restored = restorePrivateProgressReceipt(pack, receipt);
  assert.equal(restored.answers[question.id], 4);
  assert.deepEqual(restored.changedQuestionIds, [question.id]);
  assert.equal(restored.answerVersions[question.id], 'draft-0.1.0');
  assert.equal(restored.complete, false);
});
