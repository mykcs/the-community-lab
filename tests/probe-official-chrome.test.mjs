import assert from 'node:assert/strict';
import { test } from 'node:test';
import { overlayGate } from '../scripts/probe-official-chrome.mjs';

const candidate = {
  assetMatches: true, questionVisible: true, optionCount: 2,
  expectedOptions: 2, sourceIdCount: 0, rawValueCount: 0,
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
test('complete DOM identity still requires independent translation and rights gates', () => {
  assert.equal(overlayGate({ ...candidate, sourceIdCount: 1, rawValueCount: 2 }),
    'CANDIDATE_ONLY_REQUIRES_EXACT_MAPPING_RIGHTS_AND_REVIEW');
});
