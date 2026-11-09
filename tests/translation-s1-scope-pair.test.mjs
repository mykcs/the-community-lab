import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { extractDraftPack, createPrivateProgressReceipt, restorePrivateProgressReceipt } from '../lib/full-questionnaire.mjs';
import { loadFullQuestionnaire, attachTranslationFingerprints } from '../scripts/load-full-questionnaire.mjs';

const fixes = [
  {
    id: 's1-politics-08',
    korean: '기업이 정부보다 더 큰 해악을 끼칠 가능성이 높다.',
    previous: '企业比政府更有可能造成更大的危害。',
    corrected: '企业造成的危害很可能比政府更大。',
    previousVersion: 'draft-0.1.3',
    currentVersion: 'draft-0.1.4',
    rawValues: [1, 2, 3, 4, 5, 6],
    noteCue: /可能性高的是/,
  },
  {
    id: 's1-class-18',
    korean: '어린 시절 집안일을 도와주는 가사 도우미가 상주했다',
    previous: '我小时候，家里一直有住家帮佣。',
    corrected: '小时候，我家有住家的家政人员帮忙做家务。',
    previousVersion: 'draft-0.1.1',
    currentVersion: 'draft-0.1.2',
    rawValues: [1, 2, 3, 4],
    noteCue: /始终/,
  },
];

test('S1 scope fixes agree across both public review sources without changing source values or review status', () => {
  const paths = ['docs/translation-review/index.html', 'docs/original-question-translation-review/index.html'];
  const copies = paths.map(path => extractDraftPack(readFileSync(path, 'utf8')));
  assert.equal(copies[0].questions.length, 124);
  assert.deepEqual(copies[0].questions, copies[1].questions);
  const live = loadFullQuestionnaire();
  for (const item of fixes) {
    for (const draft of copies) {
      const q = draft.questions.find(q => q.id === item.id);
      assert.ok(q, item.id);
      assert.equal(q.source_text_ko, item.korean);
      assert.equal(q.translation_zh_cn, item.corrected);
      assert.equal(q.translation_version, item.currentVersion);
      assert.match(q.translator_note, item.noteCue);
      assert.match(q.translator_note, /待独立韩中人工复核/);
      assert.equal(q.review_status, 'draft');
      assert.equal(q.translation_status, 'AI_DRAFT_UNREVIEWED');
      assert.equal(q.scoring_version, 'UNKNOWN');
      assert.deepEqual(q.options.map(option => option.value), item.rawValues);
      assert.equal(draft.independent_bilingual_review, 'NOT_DONE');
    }
    const rendered = live.seasons[1].find(q => q.id === item.id);
    assert.equal(rendered.draftZh, item.corrected);
    assert.deepEqual(rendered.options.map(option => option.value), item.rawValues);
  }
});

test('S1 previous wording stays attached to raw selections and requires explicit reconfirmation', () => {
  const current = loadFullQuestionnaire();
  for (const item of fixes) {
    const previous = structuredClone(current);
    const position = previous.seasons[1].findIndex(q => q.id === item.id);
    const q = previous.seasons[1][position];
    q.draftZh = item.previous;
    q.translationVersion = item.previousVersion;
    q.readerNote = null;
    attachTranslationFingerprints(previous);
    const selectedValue = q.options.at(-1).value;
    const oldBackup = createPrivateProgressReceipt(previous, 1, { [item.id]: selectedValue }, position);
    const restored = restorePrivateProgressReceipt(current, oldBackup);
    assert.equal(restored.answers[item.id], selectedValue);
    assert.deepEqual(restored.changedQuestionIds, [item.id]);
    assert.equal(restored.answerVersions[item.id], item.previousVersion);
    assert.deepEqual(restored.unknownWordingQuestionIds, []);
    assert.notEqual(restored.answerFingerprints[item.id], current.seasons[1][position].translationFingerprint);
  }
});
