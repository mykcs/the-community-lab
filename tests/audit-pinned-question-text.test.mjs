import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { auditPinnedKoreanQuestionText } from '../scripts/audit-pinned-question-text.mjs';

// Fictional Korean strings, never original test text.
const make = (source = '질문 하나 / 질문 둘') => {
  const bytes = Buffer.from(source, 'utf8');
  const sha256 = createHash('sha256').update(bytes).digest('hex');
  const expected = { sha256, bytes: bytes.length, counts: { 1: 1, 2: 1 } };
  const pack = {
    sourceSha256: sha256,
    seasons: {
      1: [{ season: 1, id: 'fiction-1', sourceKo: '질문 하나' }],
      2: [{ season: 2, id: 'fiction-2', sourceKo: '질문 둘' }],
    },
  };
  return { bytes, expected, pack };
};

test('offline source membership reports only counts and digest, never question prose', () => {
  const { bytes, expected, pack } = make();
  const result = auditPinnedKoreanQuestionText(bytes, pack, expected);
  assert.equal(result.totalUniqueExactTextMatches, 2);
  assert.equal(result.season1UniqueExactTextMatches, 1);
  assert.equal(result.season2UniqueExactTextMatches, 1);
  assert.equal(result.permissionsHumanReviewSourceIdMappingAndScoring,
    'NOT_VALIDATED_BY_THIS_AUDIT');
  assert.doesNotMatch(JSON.stringify(result), /질문/);
});

test('rejects missing, duplicated, or substituted Korean source strings', () => {
  const { bytes, expected, pack } = make();
  const missing = structuredClone(pack);
  missing.seasons[1][0].sourceKo = '미확인';
  assert.throws(() => auditPinnedKoreanQuestionText(bytes, missing, expected), /fiction-1/);

  const duplicate = structuredClone(pack);
  duplicate.seasons[2][0].sourceKo = '질문 하나';
  assert.throws(() => auditPinnedKoreanQuestionText(bytes, duplicate, expected), /Duplicate/);

  const repeated = make('질문 하나 / 질문 둘 / 질문 하나');
  assert.throws(() => auditPinnedKoreanQuestionText(
    repeated.bytes, repeated.pack, repeated.expected,
  ), /fiction-1/);
});

test('fails closed on altered client bytes, source fingerprint, or question counts', () => {
  const { bytes, expected, pack } = make();
  assert.throws(() => auditPinnedKoreanQuestionText(
    Buffer.from(bytes.toString() + 'changed'), pack, expected,
  ), /Client bytes/);
  const badProvenance = structuredClone(pack);
  badProvenance.sourceSha256 = '0'.repeat(64);
  assert.throws(() => auditPinnedKoreanQuestionText(bytes, badProvenance, expected),
    /Client bytes/);
  const missing = structuredClone(pack);
  missing.seasons[2] = [];
  assert.throws(() => auditPinnedKoreanQuestionText(bytes, missing, expected),
    /question count/);
});

test('requires valid unique question identities and raw Buffer input', () => {
  const { bytes, expected, pack } = make();
  assert.throws(() => auditPinnedKoreanQuestionText(bytes.toString(), pack, expected),
    /raw public client bytes/);
  const duplicatedIds = structuredClone(pack);
  duplicatedIds.seasons[2][0].id = 'fiction-1';
  assert.throws(() => auditPinnedKoreanQuestionText(bytes, duplicatedIds, expected),
    /Duplicate/);
});
