import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { OFFICIAL_SYNTHETIC_SCORE_OBSERVATIONS } from '../data/original-site-audit.mjs';
import { OFFICIAL_SYNTHETIC_RESULT_DISPLAY_DIGESTS } from '../data/official-result-display-digests.mjs';
import { compareOfficialResultDisplayFields, summarizeOfficialResultDisplayDigestCoverage } from '../lib/official-result-display-audit.mjs';
import { verifyOfficialSyntheticScoreReadbacks } from '../lib/reproduction-audit.mjs';

const hash = text => createHash('sha256').update(text, 'utf8').digest('hex');
const syntheticReference = {
  titleSha256: hash('SYNTHETIC_TITLE_ONLY'),
  summarySha256: hash('SYNTHETIC_SUMMARY_ONLY'),
};
const mockOutput = {
  title: 'SYNTHETIC_TITLE_ONLY',
  summary: 'SYNTHETIC_SUMMARY_ONLY',
  axes: [{ id: '원칙-결과', leftLabel: '원칙', rightLabel: '결과' }],
};
const expectedAxes = [{ id: '원칙-결과' }];

test('ten checked readbacks have only two official Korean display-text signatures', () => {
  assert.deepEqual(summarizeOfficialResultDisplayDigestCoverage(), {
    observedResultReadbacksWithDisplayDigests: 10,
    distinctResultDisplayTextSignatures: 2,
    verifiedInputReadbacksWithDisplayDigests: 9,
    independentlyReviewedChineseResultExplanations: 0,
    officialFullResultEquivalenceVerified: false,
  });
  assert.deepEqual(Object.keys(OFFICIAL_SYNTHETIC_RESULT_DISPLAY_DIGESTS).sort(),
    OFFICIAL_SYNTHETIC_SCORE_OBSERVATIONS.map(s => s.publicResultId).sort());
});

test('display evidence refuses invented, extra or malformed result digests', () => {
  assert.throws(() => summarizeOfficialResultDisplayDigestCoverage([], {}));
  const refs = structuredClone(OFFICIAL_SYNTHETIC_RESULT_DISPLAY_DIGESTS);
  delete refs[OFFICIAL_SYNTHETIC_SCORE_OBSERVATIONS[0].publicResultId];
  assert.throws(() => summarizeOfficialResultDisplayDigestCoverage(undefined, refs));
  refs[OFFICIAL_SYNTHETIC_SCORE_OBSERVATIONS[0].publicResultId] = { ...syntheticReference, personalName: 'SYNTHETIC' };
  assert.throws(() => summarizeOfficialResultDisplayDigestCoverage(undefined, refs));
  refs[OFFICIAL_SYNTHETIC_SCORE_OBSERVATIONS[0].publicResultId] = { titleSha256: 'UNKNOWN', summarySha256: hash('fake') };
  assert.throws(() => summarizeOfficialResultDisplayDigestCoverage(undefined, refs));
});

test('Korean result title/summary hashes and axis labels are distinct independently checked fields', () => {
  assert.deepEqual(compareOfficialResultDisplayFields(syntheticReference, mockOutput, expectedAxes),
    { matches: true, mismatches: [] });
  assert.deepEqual(compareOfficialResultDisplayFields(syntheticReference,
    { ...mockOutput, axes: [mockOutput.axes[0]], title: 'SYNTHETIC_CHANGED' }, expectedAxes).mismatches,
  ['title.sha256']);
  assert.deepEqual(compareOfficialResultDisplayFields(syntheticReference,
    { ...mockOutput, summary: null, axes: [{ ...mockOutput.axes[0], leftLabel: '잘못됨' }] }, expectedAxes).mismatches,
  ['summary.sha256', 'axes.labels.원칙-결과']);
  assert.deepEqual(compareOfficialResultDisplayFields(syntheticReference,
    { ...mockOutput, axes: [mockOutput.axes[0], mockOutput.axes[0]] }, expectedAxes).mismatches,
  ['axes.labels.length']);
});

test('axis list order is irrelevant, but missing labels are not silently accepted', () => {
  const two = { ...mockOutput, axes: [...mockOutput.axes, { id: '구조-능력', leftLabel: '구조', rightLabel: '능력' }] };
  const expected = [{ id: '구조-능력' }, ...expectedAxes];
  assert.equal(compareOfficialResultDisplayFields(syntheticReference, { ...two, axes: two.axes.reverse() }, expected).matches, true);
  assert.equal(compareOfficialResultDisplayFields(syntheticReference,
    { ...two, axes: two.axes.map(x => ({ ...x, rightLabel: undefined })) }, expected).matches, false);
});

test('strict live readback catches changed explanation without copying its raw contents', async () => {
  const calls = [];
  const request = async (url, options) => {
    calls.push([url, options.method]);
    const sample = OFFICIAL_SYNTHETIC_SCORE_OBSERVATIONS.find(s => url.endsWith(s.publicResultId));
    return { ok: true, json: async () => ({
      ...structuredClone(sample.output),
      title: 'SYNTHETIC_NOT_THE_OFFICIAL_TITLE',
      summary: 'SYNTHETIC_NOT_THE_OFFICIAL_SUMMARY',
      axes: sample.output.axes.map(axis => ({
        ...axis, leftLabel: axis.id.split('-')[0], rightLabel: axis.id.split('-')[1],
      })),
      nickname: 'DO_NOT_COPY', referralCode: 'DO_NOT_COPY', answers: { fake: 'DO_NOT_COPY' },
    }) };
  };
  const result = await verifyOfficialSyntheticScoreReadbacks(
    OFFICIAL_SYNTHETIC_SCORE_OBSERVATIONS, request, { verifyDisplayText: true });
  assert.equal(result.allMatch, false);
  assert.equal(result.checked.length, 10);
  assert.ok(result.checked.every(row => row.numericScoreFieldsMatch === true &&
    row.publicDisplayFieldsMatch === false && row.matchesRecordedReadback === false));
  assert.deepEqual(calls.map(x => x[1]), ['GET', 'GET', 'GET', 'GET', 'GET', 'GET', 'GET', 'GET', 'GET', 'GET']);
  assert.doesNotMatch(JSON.stringify(result), /DO_NOT_COPY|nickname|referralCode|answers|SYNTHETIC_NOT/);
});
