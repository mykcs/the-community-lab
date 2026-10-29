import test from 'node:test';
import assert from 'node:assert/strict';
import INDEX from '../data/original-question-index.json' with { type: 'json' };
import { summarizeSourceIndex } from '../lib/reproduction-audit.mjs';

test('versioned metadata covers the observed 87 and 37 source IDs without filling absent labels', () => {
  assert.deepEqual(summarizeSourceIndex().map(x => x.observedSourceIdentityCount), [87, 37]);
  assert.equal(INDEX.sourceAssetSha256, '59a67f9d1e0049156bedfe4d61a4cf8511dc8903ba80cf297b6bffad3c2b379e');
  assert.equal(INDEX.sourceAssetBytes, 331501);
  const second = INDEX.questions.filter(q => q.season === 2);
  assert.ok(!second.some(q => ['ms09', 'ms12'].includes(q.sourceQuestionId)));
  assert.ok(second.some(q => q.sourceQuestionId === 'ms13'));
  for (const season of [1, 2]) {
    const questions = INDEX.questions.filter(q => q.season === season);
    assert.deepEqual(questions.map(q => q.displayPositionDerivedFromClient).sort((a, b) => a - b),
      Array.from({ length: questions.length }, (_, i) => i + 1));
  }
});

test('observed option counts and reverse flags remain separate from unknown score weights', () => {
  for (const group of INDEX.groups) {
    const questions = INDEX.questions.filter(q => q.season === 1 && q.sourceGroup === group.sourceGroup);
    assert.equal(questions.length, group.count);
    assert.ok(questions.every(q => q.optionCount === group.optionCount));
    assert.equal(questions.filter(q => q.reverseFlagInPublicClient === true).length, group.reverseFlagCount);
  }
  assert.ok(INDEX.questions.filter(q => q.season === 2).every(q => q.optionCount === 2));
  assert.ok(INDEX.questions.every(q => q.scoreWeight === 'UNKNOWN' &&
    q.sourceTextReusePermission === 'UNKNOWN' && q.sourceQuestionVersion === 'UNKNOWN' && q.translationStatus === 'UNKNOWN' &&
    q.independentBilingualReview === 'UNKNOWN'));
});

test('duplicate IDs, count drift, missing version fingerprints and question prose are rejected', () => {
  const duplicate = structuredClone(INDEX);
  duplicate.questions[1].sourceQuestionId = duplicate.questions[0].sourceQuestionId;
  assert.throws(() => summarizeSourceIndex(duplicate), /重复/);
  const incomplete = structuredClone(INDEX);
  incomplete.questions.pop();
  assert.throws(() => summarizeSourceIndex(incomplete), /数量/);
  const noVersion = structuredClone(INDEX);
  noVersion.sourceAssetSha256 = '';
  assert.throws(() => summarizeSourceIndex(noVersion), /可追溯/);
  const prose = structuredClone(INDEX);
  prose.questions[0].source_text_ko = 'synthetic text that must not enter the metadata index';
  assert.throws(() => summarizeSourceIndex(prose), /非元数据/);
});
