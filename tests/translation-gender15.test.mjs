import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { extractDraftPack, createPrivateProgressReceipt, restorePrivateProgressReceipt } from '../lib/full-questionnaire.mjs';
import { loadFullQuestionnaire, attachTranslationFingerprints } from '../scripts/load-full-questionnaire.mjs';
import { verifyKoreanSourceSnapshot } from '../scripts/verify-korean-source-snapshot.mjs';

const id = 's1-gender-15';
const previousDraft = '在当今韩国社会，作为女性生活比作为男性生活有很多更方便之处。';
const revisedDraft = '在如今的韩国社会，女性在生活的许多方面比男性更轻松。';
const reviewPaths = [
  'docs/translation-review/index.html',
  'docs/original-question-translation-review/index.html',
];

test('S1 gender 15 AI draft describes ease of living, not just practical convenience', () => {
  const rows = reviewPaths.map(path => {
    const draft = extractDraftPack(readFileSync(path, 'utf8'));
    const question = draft.questions.find(q => q.id === id);
    assert.ok(question, path);
    assert.equal(question.translation_zh_cn, revisedDraft);
    assert.equal(question.translation_version, 'draft-0.1.1');
    assert.equal(question.review_status, 'draft');
    assert.equal(question.translation_status, 'AI_DRAFT_UNREVIEWED');
    assert.equal(draft.independent_bilingual_review, 'NOT_DONE');
    assert.match(question.translator_note, /편한 점이 많다/);
    assert.match(question.translator_note, /韩国国立国语院/);
    assert.match(question.translator_note, /仍待独立韩中人工复核/);
    return question;
  });
  assert.deepEqual(rows[0], rows[1], 'both public review pages must share a single source draft');
  const pack = loadFullQuestionnaire();
  const question = pack.seasons[1].find(q => q.id === id);
  assert.equal(question.draftZh, revisedDraft);
  assert.equal(pack.scoringVersion, 'UNKNOWN');
  assert.equal(verifyKoreanSourceSnapshot(pack), true);
});

test('an older local selection keeps its source choice but requires reconfirmation after this wording change', () => {
  const current = loadFullQuestionnaire();
  const prior = structuredClone(current);
  const index = prior.seasons[1].findIndex(q => q.id === id);
  const old = prior.seasons[1][index];
  old.draftZh = previousDraft;
  old.translationVersion = 'draft-0.1.0';
  attachTranslationFingerprints(prior);
  const previousReceipt = createPrivateProgressReceipt(
    prior, 1, { [id]: old.options[0].value }, index,
  );
  const restored = restorePrivateProgressReceipt(current, previousReceipt);
  assert.equal(restored.answers[id], old.options[0].value);
  assert.deepEqual(restored.changedQuestionIds, [id]);
  assert.equal(restored.unknownWordingQuestionIds.length, 0);
});
