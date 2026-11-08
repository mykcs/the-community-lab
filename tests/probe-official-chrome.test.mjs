import assert from 'node:assert/strict';
import { test } from 'node:test';
import { overlayGate, exactSuffixSourceMatches, exactDomSourceOptionMapping, exactVisibleOptionLabelMapping,
  auditReadOnlyQuestionOrder, readOnlyPathChoiceIndex, readOnlyBacktrackPositions,
  auditReadOnlyBacktrack } from '../scripts/probe-official-chrome.mjs';

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
  assert.deepEqual(exactSuffixSourceMatches('Q.가상의 질문입니다.', sources),
    [{ sourceId: 'a', prefixLength: 2 }],
    'the exact literal label observed in the current official heading is allowed');
  assert.deepEqual(exactSuffixSourceMatches('1. 가상의 질문입니다?', sources), []);
  assert.deepEqual(exactSuffixSourceMatches('longprefix 가상의 질문입니다.', sources), []);
  assert.deepEqual(exactSuffixSourceMatches('xyz가상의 질문입니다.', sources), [],
    'a coincidental three-character prefix is NOT a source identity');
  assert.deepEqual(exactSuffixSourceMatches('37. 가상의 질문입니다.', sources),
    [{ sourceId: 'a', prefixLength: 4 }],
    'a two-digit number plus punctuation can precede an exact question');
  assert.deepEqual(exactSuffixSourceMatches('087) 가상의 질문입니다.', sources), [],
    'unrecognized padded numbering must fail closed');
  assert.deepEqual(exactSuffixSourceMatches('1234. 가상의 질문입니다.', sources), [],
    'arbitrary-long numeric prefixes must not qualify');
  assert.deepEqual(exactSuffixSourceMatches('3、가상의 질문입니다.', sources), [],
    'unverified punctuation cannot be treated as a source ID');
  assert.deepEqual(exactSuffixSourceMatches('R. 가상의 질문입니다.', sources), [],
    'unknown letter prefixes do not qualify as a source identity');
});
test('ambiguous identical Korean source wording is never resolved by a guessed ID', () => {
  const matches = exactSuffixSourceMatches('1. 같은 질문', [
    { id: 'a', sourceKo: '같은 질문' }, { id: 'b', sourceKo: '같은 질문' },
  ]);
  assert.equal(matches.length, 2);
});

test('read-only path maps visible Korean labels to one exact source question in order', () => {
  const entries = [{ id: 'fictional-01', sourceKo: '가상의 질문입니다.', options: [
    { value: 'O', ko: '동의' }, { value: 'X', ko: '비동의' },
  ] }];
  assert.deepEqual(exactVisibleOptionLabelMapping({
    headingText: 'Q.가상의 질문입니다.', optionLabels: ['동의', '비동의'],
  }, entries), { sourceId: 'fictional-01', optionCount: 2 });
  assert.equal(exactVisibleOptionLabelMapping({
    headingText: 'Q.가상의 질문입니다.', optionLabels: ['비동의', '동의'],
  }, entries), null);
  assert.equal(exactVisibleOptionLabelMapping({
    headingText: 'Q.가상의 질문입니다.', optionLabels: ['동의', '다른标签'],
  }, entries), null);
  assert.equal(exactVisibleOptionLabelMapping({
    headingText: 'Q. 가상의 질문입니다.', optionLabels: ['동의', '비동의'],
  }, entries), null);
  assert.equal(exactVisibleOptionLabelMapping({
    headingText: 'Q.가상의 질문입니다.', optionLabels: ['동의'],
  }, entries), null);
  assert.equal(exactVisibleOptionLabelMapping({
    headingText: 'Q.가상의 질문입니다.', optionLabels: ['동의', '비동의'],
  }, [...entries, { ...entries[0], id: 'fictional-02' }]), null);
});

test('read-only path rejects a reordered complete source set', () => {
  assert.deepEqual(auditReadOnlyQuestionOrder(['s1', 's2', 's3'], ['s1', 's2', 's3']), {
    completeUniqueQuestionSet: true, orderedPathMatchesPinnedClient: true,
  });
  assert.deepEqual(auditReadOnlyQuestionOrder(['s3', 's2', 's1'], ['s1', 's2', 's3']), {
    completeUniqueQuestionSet: true, orderedPathMatchesPinnedClient: false,
  });
  assert.deepEqual(auditReadOnlyQuestionOrder(['s1', 's1', 's3'], ['s1', 's2', 's3']), {
    completeUniqueQuestionSet: false, orderedPathMatchesPinnedClient: false,
  });
  assert.deepEqual(auditReadOnlyQuestionOrder(['s1', 's2'], ['s1', 's2', 's3']), {
    completeUniqueQuestionSet: false, orderedPathMatchesPinnedClient: false,
  });
});

test('readonly path can choose last visible source option without guessing values', () => {
  assert.equal(readOnlyPathChoiceIndex(2, 'first'), 0);
  assert.equal(readOnlyPathChoiceIndex(2, 'last'), 1);
  assert.equal(readOnlyPathChoiceIndex(6, 'last'), 5);
  assert.throws(() => readOnlyPathChoiceIndex(0, 'last'), /invalid read-only option strategy/);
  assert.throws(() => readOnlyPathChoiceIndex(2, 'random'), /invalid read-only option strategy/);
});

test('read-only path preserves intentionally blank source labels exactly', () => {
  const entries = [{ id: 'fictional-scale', sourceKo: '가상의 척도 질문입니다.', options: [
    { value: '1', ko: '' }, { value: '2', ko: '보통' }, { value: '3', ko: '' },
  ] }];
  assert.deepEqual(exactVisibleOptionLabelMapping({
    headingText: 'Q.가상의 척도 질문입니다.', optionLabels: ['', '보통', ''],
  }, entries), { sourceId: 'fictional-scale', optionCount: 3 });
  assert.equal(exactVisibleOptionLabelMapping({
    headingText: 'Q.가상의 척도 질문입니다.', optionLabels: ['1', '보통', '3'],
  }, entries), null);
});

test('read-only backtrack covers every transition before the unanswered final question', () => {
  const seasonOne = readOnlyBacktrackPositions(87);
  const seasonTwo = readOnlyBacktrackPositions(37);
  assert.equal(seasonOne.length, 86);
  assert.equal(seasonTwo.length, 36);
  assert.deepEqual(seasonOne, Array.from({ length: 86 }, (_, index) => index));
  assert.deepEqual(seasonTwo, Array.from({ length: 36 }, (_, index) => index));
  assert.deepEqual(readOnlyBacktrackPositions(3), [0, 1]);
  assert.throws(() => readOnlyBacktrackPositions(2), /invalid read-only backtrack question count/);
  assert.throws(() => readOnlyBacktrackPositions(0), /invalid read-only backtrack question count/);
});

test('read-only backtrack requires the same pinned question and next identity at each transition', () => {
  const expected = ['fictional-first', 'fictional-second', 'fictional-last'];
  const visit = {
    questionIndex: 1, currentId: 'fictional-second', revisitedCurrentId: 'fictional-second',
    nextId: 'fictional-last', revisitedNextId: 'fictional-last',
  };
  assert.equal(auditReadOnlyBacktrack(visit, expected), true);
  assert.equal(auditReadOnlyBacktrack({ ...visit, revisitedCurrentId: 'wrong' }, expected), false);
  assert.equal(auditReadOnlyBacktrack({ ...visit, revisitedNextId: 'wrong' }, expected), false);
  assert.equal(auditReadOnlyBacktrack({ ...visit, nextId: visit.currentId }, expected), false);
  assert.equal(auditReadOnlyBacktrack({ ...visit, questionIndex: 2 }, expected), false);
  assert.equal(auditReadOnlyBacktrack({ ...visit, questionIndex: -1 }, expected), false);
  assert.equal(auditReadOnlyBacktrack(visit, ['fictional-first']), false);
  assert.equal(auditReadOnlyBacktrack(visit, null), false);
});
