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

test('source array and presented order must each be complete permutations', () => {
  const duplicateDisplay = structuredClone(INDEX);
  duplicateDisplay.questions[0].displayPositionDerivedFromClient =
    duplicateDisplay.questions[1].displayPositionDerivedFromClient;
  assert.throws(() => summarizeSourceIndex(duplicateDisplay), /顺序/);

  const duplicateSource = structuredClone(INDEX);
  duplicateSource.questions[1].sourceArrayPosition =
    duplicateSource.questions[0].sourceArrayPosition;
  assert.throws(() => summarizeSourceIndex(duplicateSource), /顺序/);

  const outOfRange = structuredClone(INDEX);
  outOfRange.questions[0].displayPositionDerivedFromClient = 0;
  assert.throws(() => summarizeSourceIndex(outOfRange), /顺序/);
});

test('group counts, option scale and reverse-flag summaries cannot silently drift', () => {
  const groupCount = structuredClone(INDEX);
  groupCount.groups[0].count++;
  assert.throws(() => summarizeSourceIndex(groupCount), /组别|客户端摘要/);

  const falseOptionCount = structuredClone(INDEX);
  falseOptionCount.questions[0].optionCount = 4;
  falseOptionCount.questions[0].optionValues = [1, 2, 3, 4];
  assert.throws(() => summarizeSourceIndex(falseOptionCount), /客户端摘要/);

  const changedReverseFlag = structuredClone(INDEX);
  changedReverseFlag.questions[0].reverseFlagInPublicClient =
    !changedReverseFlag.questions[0].reverseFlagInPublicClient;
  assert.throws(() => summarizeSourceIndex(changedReverseFlag), /客户端摘要/);

  const unlistedGroup = structuredClone(INDEX);
  unlistedGroup.questions[0].sourceGroup = 'unverified-group';
  assert.throws(() => summarizeSourceIndex(unlistedGroup), /客户端摘要|未登记/);
});

test('two distinct choices cannot be silently replaced by equal values', () => {
  const duplicateChoice = structuredClone(INDEX);
  duplicateChoice.questions[0].optionValues[1] = duplicateChoice.questions[0].optionValues[0];
  assert.throws(() => summarizeSourceIndex(duplicateChoice), /选项值/);
  const unknownSecondReverse = structuredClone(INDEX);
  unknownSecondReverse.questions.find(q => q.season === 2).reverseFlagInPublicClient = false;
  assert.throws(() => summarizeSourceIndex(unknownSecondReverse), /第二季客户端/);
});

test('observed client metadata cannot silently lose its permission and review fields', () => {
  const missing = structuredClone(INDEX);
  delete missing.questions[0].sourceTextReusePermission;
  assert.throws(() => summarizeSourceIndex(missing), /缺项|证据/);

  const changed = structuredClone(INDEX);
  changed.questions[0].sourceTextReusePermission = 'licensed';
  assert.throws(() => summarizeSourceIndex(changed), /证据|未知|许可/);

  const changedReview = structuredClone(INDEX);
  changedReview.questions[0].independentBilingualReview = 'bilingual_reviewed';
  assert.throws(() => summarizeSourceIndex(changedReview), /证据|未知|复核/);
});

test('a source list fingerprint alone cannot certify official origin, legal reuse or scoring', () => {
  for (const [field, value] of [
    ['sourceAuthority', 'OFFICIAL_VERIFIED'],
    ['legalReusePermission', 'licensed'],
    ['translationAndIndependentReview', 'verified'],
    ['officialScoringAgreement', 'validated_against_original'],
    ['sourceIdentityCoverage', 'OFFICIAL_ALL_PATHS_VERIFIED'],
  ]) {
    const inflated = structuredClone(INDEX);
    inflated[field] = value;
    assert.throws(() => summarizeSourceIndex(inflated), /证据|状态|权限/, field);
  }
});
