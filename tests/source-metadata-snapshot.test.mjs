import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import INDEX from '../data/original-question-index.json' with { type: 'json' };
import { summarizeSourceIndex } from '../lib/reproduction-audit.mjs';
import { extractDraftPack, buildFullQuestionnaire } from '../lib/full-questionnaire.mjs';
import { verifyKoreanSourceSnapshot } from '../scripts/verify-korean-source-snapshot.mjs';

const DRAFT = extractDraftPack(readFileSync(new URL('../docs/translation-review/index.html', import.meta.url), 'utf8'));

test('the pinned official client fingerprint cannot hide a changed S2 answer direction', () => {
  const metadata = structuredClone(INDEX);
  const draft = structuredClone(DRAFT);
  const source = metadata.questions.find(q => q.season === 2);
  const sides = source.sourceGroup.split('-');
  source.agreeSideInPublicClient = sides.find(side => side !== source.agreeSideInPublicClient);
  draft.questions.find(q => q.id === source.sourceQuestionId).agree_value_ko = source.agreeSideInPublicClient;
  // Both mutable copies would agree and Korean text and option hashes are unchanged.
  assert.equal(verifyKoreanSourceSnapshot(buildFullQuestionnaire(draft, metadata)), true);
  assert.throws(() => summarizeSourceIndex(metadata), /源题元数据指纹/);
});

test('two compensating S1 reversed-direction changes cannot bypass group totals', () => {
  const metadata = structuredClone(INDEX);
  const draft = structuredClone(DRAFT);
  const group = metadata.questions.filter(q => q.season === 1 && q.sourceGroup === 'politics');
  const trueItem = group.find(q => q.reverseFlagInPublicClient === true);
  const falseItem = group.find(q => q.reverseFlagInPublicClient === false);
  for (const entry of [trueItem, falseItem]) {
    entry.reverseFlagInPublicClient = !entry.reverseFlagInPublicClient;
    draft.questions.find(q => q.id === entry.sourceQuestionId).reverse_flag_in_public_client = entry.reverseFlagInPublicClient;
  }
  assert.equal(verifyKoreanSourceSnapshot(buildFullQuestionnaire(draft, metadata)), true);
  assert.throws(() => summarizeSourceIndex(metadata), /源题元数据指纹/);
});
