import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import {
  auditPinnedKoreanQuestionText,
  verifyPinnedSeason2QuestionBindings,
} from '../scripts/audit-pinned-question-text.mjs';

// Fictional Korean strings, never original test text.
const make = (source = 'const ie=["O","X"],$s=[{id:"fiction-2",group:"fiction-group",agreeValue:"fiction-agree",prompt:"질문 둘",allowedAnswers:ie}]; 질문 하나') => {
  const bytes = Buffer.from(source, 'utf8');
  const sha256 = createHash('sha256').update(bytes).digest('hex');
  const expected = { sha256, bytes: bytes.length, counts: { 1: 1, 2: 1 } };
  const pack = {
    sourceSha256: sha256,
    seasons: {
      1: [{ season: 1, id: 'fiction-1', sourceKo: '질문 하나' }],
      2: [{ season: 2, id: 'fiction-2', sourceKo: '질문 둘', groupKo: 'fiction-group',
        options: [{ value: 'O' }, { value: 'X' }] }],
    },
  };
  const index = { questions: [{
    sourceQuestionId: 'fiction-2', season: 2, sourceGroup: 'fiction-group',
    agreeSideInPublicClient: 'fiction-agree', optionValues: ['O', 'X'],
  }] };
  return { bytes, expected, pack, index };
};

const makeS2Binding = () => {
  const prompt = '가상 질문 문장';
  const code = `const ie=["O","X"],$s=[{id:"fiction-s2",group:"fiction-group",agreeValue:"fiction-agree",prompt:${JSON.stringify(prompt)},allowedAnswers:ie}];`;
  const pack = { seasons: { 2: [{
    id: 'fiction-s2', season: 2, sourceKo: prompt, groupKo: 'fiction-group',
    options: [{ value: 'O' }, { value: 'X' }],
  }] } };
  const index = { questions: [{
    sourceQuestionId: 'fiction-s2', season: 2, sourceGroup: 'fiction-group',
    agreeSideInPublicClient: 'fiction-agree', optionValues: ['O', 'X'],
  }] };
  return { code, pack, index, prompt };
};

test('offline source membership reports only counts and digest, never question prose', () => {
  const { bytes, expected, pack, index } = make();
  const result = auditPinnedKoreanQuestionText(bytes, pack, expected, index);
  assert.equal(result.totalUniqueExactTextMatches, 2);
  assert.equal(result.season1UniqueExactTextMatches, 1);
  assert.equal(result.season2UniqueExactTextMatches, 1);
  assert.equal(result.permissionsHumanReviewSourceIdMappingAndScoring,
    'NOT_VALIDATED_BY_THIS_AUDIT');
  assert.doesNotMatch(JSON.stringify(result), /질문/);
});

test('rejects missing, duplicated, or substituted Korean source strings', () => {
  const { bytes, expected, pack, index } = make();
  const missing = structuredClone(pack);
  missing.seasons[1][0].sourceKo = '미확인';
  assert.throws(() => auditPinnedKoreanQuestionText(bytes, missing, expected, index), /fiction-1/);

  const duplicate = structuredClone(pack);
  duplicate.seasons[2][0].sourceKo = '질문 하나';
  assert.throws(() => auditPinnedKoreanQuestionText(bytes, duplicate, expected, index), /Duplicate/);

  const repeated = make('질문 하나 / 질문 둘 / 질문 하나');
  assert.throws(() => auditPinnedKoreanQuestionText(
    repeated.bytes, repeated.pack, repeated.expected, repeated.index,
  ), /fiction-1/);
});

test('fails closed on altered client bytes, source fingerprint, or question counts', () => {
  const { bytes, expected, pack, index } = make();
  assert.throws(() => auditPinnedKoreanQuestionText(
    Buffer.from(bytes.toString() + 'changed'), pack, expected, index,
  ), /Client bytes/);
  const badProvenance = structuredClone(pack);
  badProvenance.sourceSha256 = '0'.repeat(64);
  assert.throws(() => auditPinnedKoreanQuestionText(bytes, badProvenance, expected, index),
    /Client bytes/);
  const missing = structuredClone(pack);
  missing.seasons[2] = [];
  assert.throws(() => auditPinnedKoreanQuestionText(bytes, missing, expected, index),
    /question count/);
});

test('requires valid unique question identities and raw Buffer input', () => {
  const { bytes, expected, pack, index } = make();
  assert.throws(() => auditPinnedKoreanQuestionText(bytes.toString(), pack, expected, index),
    /raw public client bytes/);
  const duplicatedIds = structuredClone(pack);
  duplicatedIds.seasons[2][0].id = 'fiction-1';
  assert.throws(() => auditPinnedKoreanQuestionText(bytes, duplicatedIds, expected, index),
    /Duplicate/);
});

test('directly binds each S2 source ID to its prompt, group, agree-side and source options', () => {
  const { code, pack, index, prompt } = makeS2Binding();
  const result = verifyPinnedSeason2QuestionBindings(code, pack, index, 1);
  assert.equal(result.season2DirectIdTextGroupAndOptionBindings, 1);
  assert.equal(result.season2BindingMetadataSha256.length, 64);
  assert.doesNotMatch(JSON.stringify(result), /fiction|\u95ee\u9898/);

  for (const mutate of [
    value => { value.pack.seasons[2][0].sourceKo = '另一个虚构句子'; },
    value => { value.pack.seasons[2][0].groupKo = 'other-group'; },
    value => { value.index.questions[0].agreeSideInPublicClient = 'other-side'; },
    value => { value.index.questions[0].optionValues = ['X', 'O']; },
    value => { value.pack.seasons[2][0].options[1].value = 'O'; },
  ]) {
    const changed = makeS2Binding();
    mutate(changed);
    assert.throws(() => verifyPinnedSeason2QuestionBindings(
      changed.code, changed.pack, changed.index, 1,
    ), /fiction-s2/);
  }
  assert.equal(prompt, '가상 질문 문장');
});

test('S2 binding audit rejects duplicate list markers, missing objects and duplicate IDs', () => {
  const { code, pack, index } = makeS2Binding();
  assert.throws(() => verifyPinnedSeason2QuestionBindings(
    code + code, pack, index, 1,
  ), /not unique/);
  assert.throws(() => verifyPinnedSeason2QuestionBindings(
    code.replace('fiction-s2', 'fiction-other'), pack, index, 1,
  ), /fiction-other/);
  const duplicate = code.replace('}];', '},{id:"fiction-s2",group:"fiction-group",agreeValue:"fiction-agree",prompt:"第二虚构句子",allowedAnswers:ie}];');
  assert.throws(() => verifyPinnedSeason2QuestionBindings(
    duplicate, pack, index, 1,
  ), /count or IDs/);
});
