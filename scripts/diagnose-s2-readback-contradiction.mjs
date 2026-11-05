/**
 * Narrow read-only diagnosis of already-authorized S2 synthetic readbacks.
 * Never submits answers or publishes prose, referral codes, timestamps, or
 * arbitrary API fields. Repeated outputs are NOT a scoring formula.
 */
import { pathToFileURL } from 'node:url';
import SOURCE_INDEX from '../data/original-question-index.json' with { type: 'json' };
import { OFFICIAL_SYNTHETIC_SCORE_OBSERVATIONS } from '../data/original-site-audit.mjs';
import { OFFICIAL_SYNTHETIC_RESULT_DISPLAY_DIGESTS } from '../data/official-result-display-digests.mjs';
import { summarizeOfficialSyntheticScoreObservations } from '../lib/reproduction-audit.mjs';
import { compareRecordedOfficialScoreFields } from '../lib/official-score-parity.mjs';
import { compareOfficialResultDisplayFields } from '../lib/official-result-display-audit.mjs';

const ORDER = SOURCE_INDEX.questions.filter(q => q.season === 2)
  .sort((a, b) => a.displayPositionDerivedFromClient - b.displayPositionDerivedFromClient);
const VERSION_FIELDS = ['season', 'questionnaireVersion', 'questionSetHash', 'scoringVersion'];
const PUBLIC_SCORE_FIELDS = ['season', 'questionnaireVersion', 'questionSetHash', 'scoringVersion', 'resultType'];
const AXIS_SCORE_FIELDS = ['id', 'leftPercent', 'rightPercent', 'dominant', 'intensity'];

function canonicalInput(sample) {
  const byId = sample.input.pattern === 'uniform' ? null : new Map(
    Object.entries(sample.input.questionIdsByChoice)
      .flatMap(([value, ids]) => ids.map(id => [id, value])),
  );
  return JSON.stringify([
    ...VERSION_FIELDS.map(field => sample.output[field]),
    ORDER.map(q => sample.input.pattern === 'uniform'
      ? sample.input.choice : byId.get(q.sourceQuestionId)),
  ]);
}

function knownEquality(left, right, key) {
  if (!Object.hasOwn(left, key) || !Object.hasOwn(right, key) ||
      left[key] === null || right[key] === null) return 'UNKNOWN';
  if (key === 'storedAt') {
    const canonical = value => value && typeof value === 'object' &&
      Number.isInteger(value._seconds) && Number.isInteger(value._nanoseconds)
      ? `${value._seconds}:${value._nanoseconds}` : null;
    const a = canonical(left[key]);
    const b = canonical(right[key]);
    return a === null || b === null ? 'UNKNOWN' : a === b;
  }
  return typeof left[key] !== 'string' || typeof right[key] !== 'string'
    ? 'UNKNOWN' : left[key] === right[key];
}

function scoreProjection(response) {
  return {
    ...Object.fromEntries(PUBLIC_SCORE_FIELDS.map(key => [key, response[key]])),
    axes: Array.isArray(response.axes)
      ? response.axes.map(axis => Object.fromEntries(
        AXIS_SCORE_FIELDS.map(key => [key, axis?.[key]]))) : null,
  };
}

function repeatedGroups(observations) {
  summarizeOfficialSyntheticScoreObservations(observations);
  const groups = new Map();
  for (const row of observations.filter(row => row.inputVerification === 'verified')) {
    const key = canonicalInput(row);
    groups.set(key, [...(groups.get(key) ?? []), row]);
  }
  return [...groups.values()].filter(rows => rows.length > 1);
}

// Cluster only previously checked, unchanged public output fields. Do not
// expose result IDs, answer vectors, values, dates or which record is an
// outlier. A 6:1 split is NOT a vote for the correct official score.
function summarizeReadbackClusters(groups, liveById) {
  const summaries = groups.map(group => {
    const clusters = [];
    for (const row of group) {
      const output = scoreProjection(liveById.get(row.publicResultId));
      const cluster = clusters.find(entry =>
        compareRecordedOfficialScoreFields(entry.output, output).matches);
      if (cluster) cluster.count++;
      else clusters.push({ output, count: 1 });
    }
    return {
      observationCount: group.length,
      distinctScoreOutputs: clusters.length,
      outputClusterSizesDescending: clusters.map(entry => entry.count)
        .sort((a, b) => b - a),
      conflicting: clusters.length > 1,
    };
  });
  return {
    status: 'VERIFIED_EXISTING_READBACKS',
    repeatedInputGroups: summaries.length,
    conflictingInputGroups: summaries.filter(group => group.conflicting).length,
    groups: summaries,
    majorityDoesNotEstablishGoldStandard: true,
  };
}

/** A small, privacy-safe summary of confirmed repeat observations only. */
export function diagnoseExistingRepeatedReadbacks(
  observations = OFFICIAL_SYNTHETIC_SCORE_OBSERVATIONS, liveById,
  references = OFFICIAL_SYNTHETIC_RESULT_DISPLAY_DIGESTS,
) {
  if (!(liveById instanceof Map)) throw new TypeError('Live readbacks must be a Map');
  const pairs = [];
  const groups = repeatedGroups(observations);
  for (const group of groups) {
    for (let i = 0; i < group.length; i++) {
      for (let j = i + 1; j < group.length; j++) {
        const left = group[i];
        const right = group[j];
        const a = liveById.get(left.publicResultId);
        const b = liveById.get(right.publicResultId);
        if (!a || !b) throw new Error('Existing public readback absent');
        const unchanged = [[left, a], [right, b]].every(([row, response]) =>
          compareRecordedOfficialScoreFields(row.output, scoreProjection(response)).matches &&
          compareOfficialResultDisplayFields(
            references[row.publicResultId],
            response, row.output.axes,
          ).matches && response.createdAt === row.resultCreatedAt);
        // If even one recorded result has drifted, diagnosis is unsafe.
        if (!unchanged) {
          pairs.push({ status: 'BLOCKED_READBACK_DRIFT', recordedInputCount: ORDER.length });
          continue;
        }
        const mismatches = compareRecordedOfficialScoreFields(
          scoreProjection(a), scoreProjection(b)).mismatches;
        pairs.push({
          status: mismatches.length ? 'CONFIRMED_REPEATED_INPUT_CONFLICT'
            : 'REPEATED_INPUT_CONSISTENT_ON_RECORDED_FIELDS',
          recordedInputCount: ORDER.length,
          differentOfficialFields: mismatches,
          versionFieldsMatch: VERSION_FIELDS.every(field => a[field] === b[field]),
          titleAndSummaryMatch:
            references[left.publicResultId].titleSha256 ===
              references[right.publicResultId].titleSha256 &&
            references[left.publicResultId].summarySha256 ===
              references[right.publicResultId].summarySha256,
          // Only equality flags: no raw dates, consent metadata, referral codes,
          // nicknames, answer vectors or public result identifiers enter output.
          createdAtSame: knownEquality(a, b, 'createdAt'),
          storedAtSame: knownEquality(a, b, 'storedAt'),
          consentVersionSame: knownEquality(a, b, 'consentVersion'),
        });
      }
    }
  }
  const drifted = pairs.some(pair => pair.status === 'BLOCKED_READBACK_DRIFT');
  return {
    schemaVersion: 's2-readback-contradiction-diagnostic@2',
    repeatedInputPairs: pairs.length,
    pairs,
    // A changed historical readback invalidates all cluster conclusions.
    readbackClusterSummary: drifted
      ? { status: 'BLOCKED_READBACK_DRIFT', groups: [] }
      : summarizeReadbackClusters(groups, liveById),
    rootCauseEstablished: false,
    officialScoringEquivalenceVerified: false,
  };
}

async function main() {
  if (!process.argv.includes('--live-readonly')) {
    throw new Error('Explicit --live-readonly required; no official request sent');
  }
  // Only re-read previously authorized anonymous synthetic result identifiers.
  const observations = OFFICIAL_SYNTHETIC_SCORE_OBSERVATIONS;
  // Fetch only already-approved records belonging to a verified repeated
  // input, not every available synthetic readback.
  const checkedIds = new Set(repeatedGroups(observations)
    .flatMap(rows => rows.map(row => row.publicResultId)));
  if (!checkedIds.size) throw new Error('No verified repeated input to diagnose');
  const live = new Map();
  for (const id of checkedIds) {
    const response = await fetch(`https://thecommunity.co.kr/api/v1/results/${id}`, {
      method: 'GET', headers: { Accept: 'application/json' }, signal: AbortSignal.timeout(10_000),
    });
    if (!response.ok) throw new Error('Existing synthetic readback failed (HTTP ' + response.status + ')');
    live.set(id, await response.json());
  }
  const report = diagnoseExistingRepeatedReadbacks(observations, live);
  console.log(JSON.stringify(report, null, 2));
  if (report.pairs.some(pair => pair.status === 'BLOCKED_READBACK_DRIFT')) process.exitCode = 1;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch(() => {
    // Do not print arbitrary remote API error bodies or participant metadata.
    console.error('Read-only public result diagnosis could not complete; no answers submitted');
    process.exitCode = 1;
  });
}
