import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  extractDraftPack, createPrivateProgressReceipt, restorePrivateProgressReceipt,
} from '../lib/full-questionnaire.mjs';
import { loadFullQuestionnaire, attachTranslationFingerprints } from '../scripts/load-full-questionnaire.mjs';
import { verifyKoreanSourceSnapshot } from '../scripts/verify-korean-source-snapshot.mjs';

const id = 's1-politics-02';
const before = '对非居住用途、以投机为目的购买房地产的行为应加以规制。';
const after = '以投机而非自住为目的购买房地产的行为，应受到监管。';
const paths = [
  'docs/translation-review/index.html',
  'docs/original-question-translation-review/index.html',
];

test('S1 politics 02 AI draft contrasts purpose of purchase, not property usage', () => {
  const records = paths.map(path => {
    const draft = extractDraftPack(readFileSync(path, 'utf8'));
    const question = draft.questions.find(q => q.id === id);
    assert.ok(question, path);
    assert.equal(question.source_text_ko, '거주가 아닌 투기 목적의 부동산 구입 행위는 규제되어야 한다.');
    assert.equal(question.translation_zh_cn, after);
    assert.equal(question.translation_version, 'draft-0.1.1');
    assert.match(question.translator_note, /居住／投机/);
    assert.match(question.translator_note, /独立韩中人工复核/);
    assert.equal(question.review_status, 'draft');
    assert.equal(question.translation_status, 'AI_DRAFT_UNREVIEWED');
    assert.equal(question.rights_status, 'user_reported_permission_unverified');
    assert.equal(question.scoring_version, 'UNKNOWN');
    assert.deepEqual(question.options.map(o => o.value), [1, 2, 3, 4, 5, 6]);
    assert.equal(draft.independent_bilingual_review, 'NOT_DONE');
    return question;
  });
  assert.deepEqual(records[0], records[1]);
  assert.doesNotMatch(after, /非居住用途/);
  const pack = loadFullQuestionnaire();
  assert.equal(pack.seasons[1].find(q => q.id === id)?.draftZh, after);
  assert.equal(pack.scoringVersion, 'UNKNOWN');
  assert.equal(verifyKoreanSourceSnapshot(pack), true);
});

test('old local selection retains source value but needs reconfirmation on translation change', () => {
  const current = loadFullQuestionnaire();
  const beforePack = structuredClone(current);
  const index = beforePack.seasons[1].findIndex(q => q.id === id);
  assert.ok(index >= 0);
  const q = beforePack.seasons[1][index];
  q.draftZh = before;
  q.translationVersion = 'draft-0.1.0';
  attachTranslationFingerprints(beforePack);
  const selection = q.options[0].value;
  const receipt = createPrivateProgressReceipt(beforePack, 1, { [id]: selection }, index);
  const restored = restorePrivateProgressReceipt(current, receipt);
  assert.equal(restored.answers[id], selection);
  assert.deepEqual(restored.changedQuestionIds, [id]);
  assert.deepEqual(restored.unknownWordingQuestionIds, []);
});
