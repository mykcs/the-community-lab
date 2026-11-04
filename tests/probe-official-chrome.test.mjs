import assert from 'node:assert/strict';
import { test } from 'node:test';
import { overlayGate, exactSuffixSourceMatches, exactDomSourceOptionMapping } from '../scripts/probe-official-chrome.mjs';

const candidate = {
  assetMatches: true, questionVisible: true, optionCount: 2,
  expectedOptions: 2, sourceIdCount: 0, rawValueCount: 0, textMatchCount: 1,
};
test('observed official page without DOM source ID or value remains blocked', () => {
  assert.equal(overlayGate(candidate), 'BLOCKED_MISSING_DOM_IDENTITY');
  assert.equal(overlayGate({ ...candidate, sourceIdCount: 1, rawValueCount: 0 }),
    'BLOCKED_MISSING_DOM_IDENTITY');
});
test('client source drift blocks even a seemingly matching DOM', () => {
  assert.equal(overlayGate({ ...candidate, assetMatches: false, sourceIdCount: 1, rawValueCount: 2 }),
    'BLOCKED_SOURCE_ASSET_DRIFT');
});
test('question or option count drift prevents a translation overlay', () => {
  assert.equal(overlayGate({ ...candidate, optionCount: 3 }), 'BLOCKED_QUESTION_DOM_DRIFT');
  assert.equal(overlayGate({ ...candidate, questionVisible: false }), 'BLOCKED_QUESTION_DOM_DRIFT');
});
test('unknown or ambiguous Korean source-text identity never enables overlay', () => {
  assert.equal(overlayGate({ ...candidate, textMatchCount: 0 }),
    'BLOCKED_MISSING_OR_AMBIGUOUS_SOURCE_TEXT');
  assert.equal(overlayGate({ ...candidate, textMatchCount: 2 }),
    'BLOCKED_MISSING_OR_AMBIGUOUS_SOURCE_TEXT');
  assert.equal(overlayGate({ ...candidate, sourceIdCount: 2, rawValueCount: 2 }),
    'BLOCKED_MISSING_DOM_IDENTITY');
});
test('attribute counts alone cannot authorize an overlay even if all counts match', () => {
  assert.equal(overlayGate({ ...candidate, sourceIdCount: 1, rawValueCount: 2 }),
    'BLOCKED_UNVERIFIED_SOURCE_OPTION_MAPPING');
  assert.equal(overlayGate({ ...candidate, sourceIdCount: 1, rawValueCount: 2,
    exactSourceOptionMapping: false }), 'BLOCKED_UNVERIFIED_SOURCE_OPTION_MAPPING');
  assert.equal(overlayGate({ ...candidate, sourceIdCount: 1, rawValueCount: 2,
    exactSourceOptionMapping: true }), 'CANDIDATE_ONLY_REQUIRES_RIGHTS_AND_BILINGUAL_REVIEW');
});

test('synthetic DOM needs exact Korean, IDs, ordered raw values and Korean options', () => {
  const entries = [{ id: 'fictional-01', sourceKo: '가상의 질문입니다.', options: [
    { value: 'O', ko: '동의' }, { value: 'X', ko: '비동의' },
  ] }];
  const observed = {
    headingText: '1. 가상의 질문입니다.', sourceQuestionId: 'fictional-01',
    choices: [{ rawValue: 'O', koreanText: '동의' }, { rawValue: 'X', koreanText: '비동의' }],
  };
  assert.equal(exactDomSourceOptionMapping(observed, entries), true);
  assert.equal(exactDomSourceOptionMapping({ ...observed, sourceQuestionId: 'wrong' }, entries), false);
  assert.equal(exactDomSourceOptionMapping({ ...observed, headingText: '1. 다른 질문' }, entries), false);
  assert.equal(exactDomSourceOptionMapping({ ...observed, choices: observed.choices.slice().reverse() }, entries), false);
  assert.equal(exactDomSourceOptionMapping({ ...observed, choices: [observed.choices[0], observed.choices[0]] }, entries), false);
  assert.equal(exactDomSourceOptionMapping({ ...observed, choices: [observed.choices[0],
    { rawValue: 'X', koreanText: '다른 한국어' }] }, entries), false);
  assert.equal(exactDomSourceOptionMapping({ ...observed, choices: [{ rawValue: null, koreanText: '동의' },
    observed.choices[1]] }, entries), false);
  assert.equal(exactDomSourceOptionMapping(observed, [...entries,
    { id: 'fictional-02', sourceKo: entries[0].sourceKo, options: entries[0].options }]), false);
});
test('exact suffix matches synthetic Korean text without guessing or stripping source wording', () => {
  const sources = [
    { id: 'a', sourceKo: '가상의 질문입니다.' },
    { id: 'b', sourceKo: '다른 질문입니다.' },
  ];
  assert.deepEqual(exactSuffixSourceMatches('1. 가상의 질문입니다.', sources),
    [{ sourceId: 'a', prefixLength: 3 }]);
  assert.deepEqual(exactSuffixSourceMatches('1. 가상의 질문입니다?', sources), []);
  assert.deepEqual(exactSuffixSourceMatches('longprefix 가상의 질문입니다.', sources), []);
});
test('ambiguous identical Korean source wording is never resolved by a guessed ID', () => {
  const matches = exactSuffixSourceMatches('1. 같은 질문', [
    { id: 'a', sourceKo: '같은 질문' }, { id: 'b', sourceKo: '같은 질문' },
  ]);
  assert.equal(matches.length, 2);
});
