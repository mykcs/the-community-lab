import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { test } from 'node:test';
import { auditPinnedQuestionBindings } from '../scripts/audit-pinned-question-bindings.mjs';

const factory = 'function Cu(l,r,s){return r.map(([c,f],m)=>({id:`s1-${l}-${String(m+1).padStart(2,"0")}`,group:l,prompt:c,reverse:!!f,scale:s,allowedAnswers:Array.from({length:s},(p,S)=>S+1)}))}';
const composition = 'const ks=[...Cu("politics",a1,6),...Cu("gender",n1,6),...Cu("openness",l1,6),...Cu("class",i1,4)];';

function synthetic() {
  const fourCaptions = ['합성 1', '합성 2', '합성 3', '합성 4'];
  const sixCaptions = ['합성 1', '', '합성 3', '합성 4', '', '합성 6'];
  const s2Captions = ['합성 예', '합성 아니요'];
  const buttons = `ze=l==="season-2"?[{value:"O",label:${JSON.stringify(s2Captions[0])},mark:"O",key:"O"},{value:"X",label:${JSON.stringify(s2Captions[1])},mark:"×",key:"X"}]:k.allowedAnswers.map((ue,se)=>({value:ue,mark:String(ue),key:String(ue),label:k.allowedAnswers.length===4?${JSON.stringify(fourCaptions)}[se]:${JSON.stringify(sixCaptions)}[se]}));`;
  const source = `const a1=[["합성 A",1]],n1=[["합성 B",0]],l1=[["합성 C",1]],i1=[["합성 D",0]];${factory}${composition}const ie=["O","X"],$s=[{id:"rp01",group:"합성 그룹",agreeValue:"左",prompt:"합성 E",allowedAnswers:ie},{id:"ms01",group:"합성 그룹",agreeValue:"右",prompt:"합성 F",allowedAnswers:ie}];Ks(JSON.stringify($s));${buttons}`;
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
      id, season, sourceKo: ko, options: values.map((value, optionIndex) => ({
        value, ko: season === 2 ? s2Captions[optionIndex] :
          (values.length === 4 ? fourCaptions : sixCaptions)[optionIndex],
      })),
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

test('rejects swapped Korean source captions even when source IDs and raw values match', () => {
  const f = synthetic();
  f.pack.seasons[1][0].options[0].ko = '错误标签';
  assert.throws(() => auditPinnedQuestionBindings(f.bytes, f.pack, f.index, f.expected),
    /S1 source Korean option captions/);
  f.pack.seasons[1][0].options[0].ko = '합성 1';
  f.pack.seasons[1][3].options[3].ko = '错误标签';
  assert.throws(() => auditPinnedQuestionBindings(f.bytes, f.pack, f.index, f.expected),
    /S1 source Korean option captions/);
  f.pack.seasons[1][3].options[3].ko = '합성 4';
  f.pack.seasons[2][0].options[1].ko = '错误标签';
  assert.throws(() => auditPinnedQuestionBindings(f.bytes, f.pack, f.index, f.expected),
    /S2 source Korean option captions/);
});

test('rejects modified source caption despite matching altered client fingerprint', () => {
  const f = synthetic();
  const altered = Buffer.from(f.bytes.toString('utf8').replace('label:"합성 예"', 'label:"错误标签"'));
  const sha256 = createHash('sha256').update(altered).digest('hex');
  f.pack.sourceSha256 = sha256;
  f.index.sourceAssetSha256 = sha256;
  assert.throws(() => auditPinnedQuestionBindings(altered, f.pack, f.index,
    { ...f.expected, sha256, bytes: altered.length }), /S2 source Korean option captions/);
});

test('rejects changed keyboard/visible marks and malformed client option rendering', () => {
  const f = synthetic();
  for (const [oldText, newText] of [
    ['mark:"×",key:"X"', 'mark:"?",key:"X"'],
    ['[se]:["합성 1"', '[se]:["错误标签"'],
  ]) {
    const altered = Buffer.from(f.bytes.toString('utf8').replace(oldText, newText));
    assert.notDeepEqual(altered, f.bytes);
    const sha256 = createHash('sha256').update(altered).digest('hex');
    f.pack.sourceSha256 = sha256;
    f.index.sourceAssetSha256 = sha256;
    assert.throws(() => auditPinnedQuestionBindings(altered, f.pack, f.index,
      { ...f.expected, sha256, bytes: altered.length }),
    /S2 button visible marks|S1 source Korean option captions/);
  }
});
