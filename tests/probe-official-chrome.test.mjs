import assert from 'node:assert/strict';
import { test } from 'node:test';
import { overlayGate, exactSuffixSourceMatches } from '../scripts/probe-official-chrome.mjs';

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
test('complete DOM identity still requires independent translation and rights gates', () => {
  assert.equal(overlayGate({ ...candidate, sourceIdCount: 1, rawValueCount: 2 }),
    'CANDIDATE_ONLY_REQUIRES_EXACT_MAPPING_RIGHTS_AND_REVIEW');
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
