import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { displayedOptionCopy } from '../lib/option-display.mjs';
import { loadFullQuestionnaire } from '../scripts/load-full-questionnaire.mjs';
import { createPrivateProgressReceipt, restorePrivateProgressReceipt } from '../lib/full-questionnaire.mjs';

const pack = loadFullQuestionnaire();

// This is exactly the previous build-time hash recipe. Keep it only as a
// migration fixture; never use it for a new receipt.
function oldFingerprint(question) {
  return createHash('sha256').update(JSON.stringify([
    question.draftZh,
    question.options.map(option => [option.value, option.zh]),
    ...(question.readerNote ? [question.readerNote] : []),
    ...(question.season === 2 ? [question.group] : []),
  ])).digest('hex');
}

test('S1 six-choice guidance is hashed as seen, without rewriting original Korean or values', () => {
  const six = pack.seasons[1].filter(q => q.options.length === 6);
  assert.ok(six.length > 0);
  for (const question of six) {
    assert.deepEqual(question.options.map(o => o.value), [1, 2, 3, 4, 5, 6]);
    assert.equal(question.options[1].ko, '2점');
    assert.equal(question.options[4].ko, '5점');
    for (const index of [1, 4]) {
      const option = question.options[index];
      const display = displayedOptionCopy(question, option);
      assert.equal(display.koreanLabel, null, 'numeric draft placeholders must not appear as Korean source labels');
      assert.equal(display.zh, `${index === 1 ? '反对侧' : '赞同侧'} · 第 ${option.value} 档`);
      assert.ok(display.hint.includes(option.zh));
      assert.ok(display.hint.includes('没有韩文文字标签'));
      assert.ok(display.hint.includes('不是官网原文'));
      assert.ok(display.hint.includes('不是官网命名'));
    }
    assert.notEqual(question.translationFingerprint, oldFingerprint(question),
      `old numeric-only copy must not be accepted as the new on-screen wording: ${question.id}`);
  }
});


// The immediately preceding Pages release used direction hints but presented
// invented Korean numeric captions. Preserve its *exact* receipt fingerprint
// recipe so older private answers are not silently treated as newly reviewed.
function priorDirectionalHintFingerprint(question) {
  return createHash('sha256').update(JSON.stringify([
    question.draftZh,
    question.options.map(option => {
      if ([2, 5].includes(option.value)) {
        const side = option.value === 2 ? '反对侧' : '赞同侧';
        return [option.value, `${side} · 第 ${option.value} 档`,
          `中文直译：${option.zh}。方向是根据六级顺序的辅助说明，不是官网命名。`];
      }
      return [option.value, option.zh];
    }),
    ...(question.readerNote ? [question.readerNote] : []),
    ...(question.season === 2 ? [question.group] : []),
  ])).digest('hex');
}

test('previous six-step backup prompts to re-confirm after source label correction', () => {
  for (const question of pack.seasons[1].filter(q => q.options.length === 6)) {
    const oldHash = priorDirectionalHintFingerprint(question);
    assert.notEqual(oldHash, question.translationFingerprint, question.id);
    const restored = restorePrivateProgressReceipt(pack, createPrivateProgressReceipt(
      pack, 1, { [question.id]: 2 }, pack.seasons[1].indexOf(question),
      undefined, { [question.id]: oldHash },
    ));
    assert.deepEqual(restored.changedQuestionIds, [question.id]);
    assert.equal(restored.answers[question.id], 2);
    assert.equal(restored.answerFingerprints[question.id], oldHash);
  }
});

test('unaffected S1 four-choice and S2 bilingual wording hashes keep historical meaning', () => {
  const four = pack.seasons[1].filter(q => q.options.length === 4);
  assert.ok(four.length > 0);
  for (const question of [...four, ...pack.seasons[2]]) {
    assert.equal(question.translationFingerprint, oldFingerprint(question), question.id);
    for (const option of question.options) {
      assert.deepEqual(displayedOptionCopy(question, option), { koreanLabel: option.ko, zh: option.zh, hint: null });
    }
  }
});

test('pre-fix six-choice backups are flagged for re-confirmation, with exact answers preserved', () => {
  const question = pack.seasons[1].find(q => q.options.length === 6);
  const index = pack.seasons[1].indexOf(question);
  const selection = question.options[4].value;
  const oldHash = oldFingerprint(question);
  const answers = { [question.id]: selection };
  const oldReceipt = createPrivateProgressReceipt(
    pack, 1, answers, index, undefined, { [question.id]: oldHash },
  );
  const restored = restorePrivateProgressReceipt(pack, oldReceipt);
  assert.deepEqual(restored.changedQuestionIds, [question.id]);
  assert.equal(restored.answers[question.id], selection);
  assert.equal(restored.answerFingerprints[question.id], oldHash,
    'old provenance must never be rewritten as newly confirmed');

  const freshReceipt = createPrivateProgressReceipt(pack, 1, answers, index);
  const fresh = restorePrivateProgressReceipt(pack, freshReceipt);
  assert.deepEqual(fresh.changedQuestionIds, []);
  assert.equal(fresh.answerFingerprints[question.id], question.translationFingerprint);
});
