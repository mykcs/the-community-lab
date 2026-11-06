import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  extractDraftPack,
  createPrivateProgressReceipt,
  restorePrivateProgressReceipt,
} from '../lib/full-questionnaire.mjs';
import { loadFullQuestionnaire } from '../scripts/load-full-questionnaire.mjs';

const paths = [
  'docs/translation-review/index.html',
  'docs/original-question-translation-review/index.html',
];
const expected = '一座聚集数万人的综合体育场收到炸弹袭击预告。若查明炸弹确切位置的唯一办法是对恐怖袭击嫌疑人无辜的年幼子女施以酷刑，那就应该施以酷刑。';

test('S2 rp06 AI draft preserves the bombing announcement, ambiguity of child count, and normative torture claim', () => {
  const rows = paths.map(path => {
    const draft = extractDraftPack(readFileSync(path, 'utf8'));
    const q = draft.questions.find(item => item.id === 'rp06');
    assert.ok(q, path);
    assert.match(q.source_text_ko, /폭탄 테러가 예고되었다/);
    assert.match(q.source_text_ko, /어린 자녀를 고문하는 것이라면 고문해야 한다/);
    assert.equal(q.translation_zh_cn, expected, path);
    assert.doesNotMatch(q.translation_zh_cn, /他们/);
    assert.equal(q.translation_version, 'draft-0.1.2', path);
    assert.match(q.translator_note, /자녀/);
    assert.match(q.translator_note, /独立韩中人工复核/);
    assert.equal(q.translation_status, 'AI_DRAFT_UNREVIEWED');
    assert.equal(q.review_status, 'draft');
    assert.deepEqual(q.options.map(option => option.value), ['O', 'X']);
    assert.equal(draft.independent_bilingual_review, 'NOT_DONE');
    return q;
  });
  assert.deepEqual(rows[0], rows[1]);
  const pack = loadFullQuestionnaire();
  assert.equal(pack.seasons[2].find(q => q.id === 'rp06')?.draftZh, expected);
  assert.equal(pack.scoringVersion, 'UNKNOWN');
});

test('old S2 rp06 answers keep original O/X but require review after the AI wording change', () => {
  const pack = loadFullQuestionnaire();
  const questions = pack.seasons[2];
  const index = questions.findIndex(q => q.id === 'rp06');
  assert.ok(index >= 0);
  const receipt = createPrivateProgressReceipt(pack, 2, { rp06: 'O' }, index);
  const oldReceipt = {
    ...receipt,
    selections: receipt.selections.map(selection => ({
      ...selection,
      translationVersion: 'draft-0.1.1',
    })),
  };
  const restored = restorePrivateProgressReceipt(pack, oldReceipt);
  assert.deepEqual(restored.changedQuestionIds, ['rp06']);
  assert.equal(restored.answers.rp06, 'O');
  assert.equal(restored.answerVersions.rp06, 'draft-0.1.1');
});
