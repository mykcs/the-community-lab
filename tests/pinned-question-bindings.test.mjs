import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { test } from 'node:test';
import { auditPinnedQuestionBindings } from '../scripts/audit-pinned-question-bindings.mjs';

const factory = 'function Cu(l,r,s){return r.map(([c,f],m)=>({id:`s1-${l}-${String(m+1).padStart(2,"0")}`,group:l,prompt:c,reverse:!!f,scale:s,allowedAnswers:Array.from({length:s},(p,S)=>S+1)}))}';
const composition = 'const ks=[...Cu("politics",a1,6),...Cu("gender",n1,6),...Cu("openness",l1,6),...Cu("class",i1,4)];';

function synthetic() {
  const source = `const a1=[["합성 A",1]],n1=[["합성 B",0]],l1=[["합성 C",1]],i1=[["합성 D",0]];${factory}${composition}const ie=["O","X"],$s=[{id:"rp01",group:"합성 그룹",agreeValue:"左",prompt:"합성 E",allowedAnswers:ie},{id:"ms01",group:"합성 그룹",agreeValue:"右",prompt:"합성 F",allowedAnswers:ie}];Ks(JSON.stringify($s));`;
  const bytes = Buffer.from(source);
  const sha256 = createHash('sha256').update(bytes).digest('hex');
  const rows = [
    ['s1-politics-01', 1, 'politics', '합성 A', 1, [1, 2, 3, 4, 5, 6]],
    ['s1-gender-01', 1, 'gender', '합성 B', 0, [1, 2, 3, 4, 5, 6]],
    ['s1-openness-01', 1, 'openness', '합성 C', 1, [1, 2, 3, 4, 5, 6]],
    ['s1-class-01', 1, 'class', '합성 D', 0, [1, 2, 3, 4]],
    ['rp01', 2, '합성 그룹', '합성 E', '左', ['O', 'X']],
    ['ms01', 2, '합성 그룹', '합성 F', '右', ['O', 'X']],
  ];
  const pack = { sourceSha256: sha256, seasons: { 1: [], 2: [] } };
  const index = { sourceAssetSha256: sha256, questions: [] };
  rows.forEach(([id, season, group, ko, flag, values], i) => {
    pack.seasons[season].push({
      id, season, sourceKo: ko, options: values.map(value => ({ value })),
    });
    index.questions.push({
      sourceQuestionId: id, season, sourceGroup: group,
      sourceArrayPosition: season === 1 ? i + 1 : i - 3,
      optionValues: values,
      ...(season === 1 ? { reverseFlagInPublicClient: !!flag } :
        { agreeSideInPublicClient: flag }),
    });
  });
  return { bytes, pack, index, expected: {
    sha256, bytes: bytes.length, s1Counts: [1, 1, 1, 1], s2Count: 2,
  } };
}

test('synthetic source IDs, order, reversal, agreement and raw options are bound', () => {
  const f = synthetic();
  const result = auditPinnedQuestionBindings(f.bytes, f.pack, f.index, f.expected);
  assert.equal(result.season1DerivedSourceIdsReverseFlagsAndOptionValues, 4);
  assert.equal(result.season2LiteralSourceIdsGroupsAgreeSidesAndOptionValues, 2);
  assert.equal(result.sourceOptionsCovered, 26);
  assert.equal(result.claimsNotProven.includes('SCORING'), true);
});

test('fails closed when two original Korean prompts are swapped between IDs', () => {
  const f = synthetic();
  [f.pack.seasons[2][0].sourceKo, f.pack.seasons[2][1].sourceKo] =
    [f.pack.seasons[2][1].sourceKo, f.pack.seasons[2][0].sourceKo];
  assert.throws(() => auditPinnedQuestionBindings(f.bytes, f.pack, f.index, f.expected),
    /S2 text\/source ID/);
});

test('fails closed on source reverse flag or S2 agree-side mismatch', () => {
  const f = synthetic();
  f.index.questions[0].reverseFlagInPublicClient = false;
  assert.throws(() => auditPinnedQuestionBindings(f.bytes, f.pack, f.index, f.expected),
    /S1 reverse flag/);
  f.index.questions[0].reverseFlagInPublicClient = true;
  f.index.questions[4].agreeSideInPublicClient = '错误';
  assert.throws(() => auditPinnedQuestionBindings(f.bytes, f.pack, f.index, f.expected),
    /S2 agree side/);
});

test('fails closed on changed source value, source order, or client fingerprint', () => {
  const f = synthetic();
  f.pack.seasons[2][0].options[0].value = 'X';
  assert.throws(() => auditPinnedQuestionBindings(f.bytes, f.pack, f.index, f.expected),
    /S2 draft option values/);
  f.pack.seasons[2][0].options[0].value = 'O';
  f.index.questions[4].sourceArrayPosition = 2;
  assert.throws(() => auditPinnedQuestionBindings(f.bytes, f.pack, f.index, f.expected),
    /S2 literal source ID\/position/);
  f.index.questions[4].sourceArrayPosition = 1;
  assert.throws(() => auditPinnedQuestionBindings(Buffer.concat([f.bytes, Buffer.from('x')]),
    f.pack, f.index, f.expected), /provenance/);
});

test('refuses mutated source factory rather than evaluating third-party JS', () => {
  const f = synthetic();
  const mutated = Buffer.from(f.bytes.toString('utf8').replace(
    'allowedAnswers:Array.from({length:s},(p,S)=>S+1)',
    'allowedAnswers:Array.from({length:s},(p,S)=>S+2)',
  ));
  const expected = {
    ...f.expected, bytes: mutated.length,
    sha256: createHash('sha256').update(mutated).digest('hex'),
  };
  f.pack.sourceSha256 = expected.sha256;
  f.index.sourceAssetSha256 = expected.sha256;
  assert.throws(() => auditPinnedQuestionBindings(mutated, f.pack, f.index, expected),
    /factory has changed/);
});
