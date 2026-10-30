import test from 'node:test';
import assert from 'node:assert/strict';
import { loadFullQuestionnaire } from '../scripts/load-full-questionnaire.mjs';
import { extractDraftPack, buildFullQuestionnaire, summarizeUnscoredAnswers } from '../lib/full-questionnaire.mjs';
import { readFileSync } from 'node:fs';

const pack = loadFullQuestionnaire();
const raw = extractDraftPack(readFileSync(new URL('../docs/translation-review/index.html', import.meta.url), 'utf8'));
const index = JSON.parse(readFileSync(new URL('../data/original-question-index.json', import.meta.url), 'utf8'));

test('124 source IDs, 550 bilingual choices and observed fixed client order survive integration', () => {
  assert.equal(pack.status, 'SOURCE_QUESTION_PILOT_UNREVIEWED_NOT_OFFICIAL');
  assert.equal(pack.rightsEvidence, 'USER_REPORTED_NOT_INDEPENDENTLY_VERIFIED');
  assert.equal(pack.scoringVersion, 'UNKNOWN');
  assert.equal(pack.seasons[1].length, 87);
  assert.equal(pack.seasons[2].length, 37);
  assert.equal([...pack.seasons[1], ...pack.seasons[2]].reduce((n, q) => n + q.options.length, 0), 550);
  for (const season of [1, 2]) {
    assert.deepEqual(pack.seasons[season].map(q => q.order),
      Array.from({ length: season === 1 ? 87 : 37 }, (_, i) => i + 1));
    assert.ok(pack.seasons[season].every(q => q.sourceKo.trim() && q.draftZh.trim() && q.options.every(o => o.ko.trim() && o.zh.trim())));
  }
  assert.equal(pack.seasons[1][0].id, index.questions.find(q => q.season === 1 && q.displayPositionDerivedFromClient === 1).sourceQuestionId);
  assert.equal(pack.seasons[2][0].id, index.questions.find(q => q.season === 2 && q.displayPositionDerivedFromClient === 1).sourceQuestionId);
});

test('source provenance, reported permission, unreviewed status and question count are hard gates', () => {
  const mutate = change => {
    const draft = structuredClone(raw);
    const metadata = structuredClone(index);
    change(draft, metadata);
    assert.throws(() => buildFullQuestionnaire(draft, metadata));
  };
  mutate(d => { d.reported_permission.status = 'UNKNOWN'; });
  mutate(d => { d.questions[0].review_status = 'bilingual_reviewed'; });
  mutate(d => { d.questions[0].scoring_version = 'official'; });
  mutate(d => { d.questions[0].source_text_ko = ''; });
  mutate(d => { d.questions[0].options[1].value = d.questions[0].options[0].value; });
  mutate(d => { d.questions.pop(); });
  mutate((_d, m) => { m.sourceAssetSha256 = 'a'.repeat(64); });
  mutate((_d, m) => { m.questions[0].displayPositionDerivedFromClient = 2; });
});

test('all answers can be completed as a receipt, but never produce invented official axes or matches', () => {
  for (const season of [1, 2]) {
    const answer = Object.fromEntries(pack.seasons[season].map(q => [q.id, q.options[0].value]));
    const result = summarizeUnscoredAnswers(pack, season, answer);
    assert.equal(result.questionCount, season === 1 ? 87 : 37);
    assert.equal(result.selections.length, result.questionCount);
    assert.equal(result.groups.reduce((n, g) => n + g.answered, 0), result.questionCount);
    assert.equal(result.scoringVersion, 'UNKNOWN');
    assert.equal(result.status, 'COMPLETED_ANSWERS_ONLY_NO_OFFICIAL_SCORING');
    assert.ok(!('dimensions' in result) && !('matches' in result));
    assert.throws(() => summarizeUnscoredAnswers(pack, season, { ...answer, 's9-wrong': 'X' }));
    const incomplete = structuredClone(answer); delete incomplete[pack.seasons[season][0].id];
    assert.throws(() => summarizeUnscoredAnswers(pack, season, incomplete));
  }
});
