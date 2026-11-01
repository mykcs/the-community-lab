/**
 * Offline contract for the three VERIFIED anonymous S2 input→output pairs.
 * This module does not implement, infer, or call the official scoring service.
 * A matching candidate proves agreement on recorded samples ONLY, never parity
 * for all 2^37 possible responses or for another scoring version.
 */
import SOURCE_INDEX from '../data/original-question-index.json' with { type: 'json' };
import { OFFICIAL_SYNTHETIC_SCORE_OBSERVATIONS } from '../data/original-site-audit.mjs';
import { summarizeOfficialSyntheticScoreObservations } from './reproduction-audit.mjs';

const OFFICIAL_FIELDS = Object.freeze([
  'season', 'questionnaireVersion', 'questionSetHash', 'scoringVersion', 'resultType',
]);
const AXIS_FIELDS = Object.freeze(['leftPercent', 'rightPercent', 'dominant', 'intensity']);

export function buildVerifiedOfficialScoreFixtures(observations = OFFICIAL_SYNTHETIC_SCORE_OBSERVATIONS) {
  // This separately verifies every observation's origin, full input coverage,
  // version shape and three-axis output before materializing any answer.
  const checked = summarizeOfficialSyntheticScoreObservations(observations);
  const source = SOURCE_INDEX.questions.filter(q => q.season === 2)
    .sort((a, b) => a.displayPositionDerivedFromClient - b.displayPositionDerivedFromClient);
  if (source.length !== 37 || new Set(source.map(q => q.sourceQuestionId)).size !== 37) {
    throw new Error('第二季源题身份不完整，不能重建金标准输入');
  }
  const fixtures = [];
  for (const sample of observations) {
    if (sample.inputVerification !== 'verified') continue;
    const values = new Map();
    if (sample.input.pattern === 'uniform') {
      for (const q of source) values.set(q.sourceQuestionId, sample.input.choice);
    } else {
      for (const choice of ['O', 'X']) {
        for (const id of sample.input.questionIdsByChoice[choice]) values.set(id, choice);
      }
    }
    const selections = source.map(q => {
      const value = values.get(q.sourceQuestionId);
      if (!q.optionValues.includes(value)) {
        throw new Error('官方合成输入不对应当前源题原始选项值：' + q.sourceQuestionId);
      }
      return Object.freeze({ questionId: q.sourceQuestionId, selectedValue: value });
    });
    if (selections.length !== sample.input.questionCount || values.size !== selections.length) {
      throw new Error('官方合成输入缺题、重复或含无关题号');
    }
    fixtures.push(Object.freeze({
      publicResultId: sample.publicResultId,
      input: Object.freeze({
        season: 2,
        questionnaireVersion: sample.output.questionnaireVersion,
        questionSetHash: sample.output.questionSetHash,
        scoringVersion: sample.output.scoringVersion,
        sourceAssetSha256: SOURCE_INDEX.sourceAssetSha256,
        selections: Object.freeze(selections),
      }),
      // The imported evidence log remains mutable in process. A fixture must
      // snapshot and freeze the whole visible output, not just the outer row,
      // or a later mutation can silently rewrite the comparison gold standard.
      expectedOutput: Object.freeze({
        ...sample.output,
        axes: Object.freeze(sample.output.axes.map(axis => Object.freeze({ ...axis }))),
      }),
    }));
  }
  if (fixtures.length !== checked.verifiedInputOutputPairs) {
    throw new Error('官方已验收输入→输出数量不一致');
  }
  return Object.freeze(fixtures);
}

/** Compare ALL recorded S2 public score fields exactly, not rounded/tolerant. */
export function compareRecordedOfficialScoreFields(expected, actual) {
  const mismatches = [];
  if (!actual || typeof actual !== 'object' || Array.isArray(actual)) {
    return { matches: false, mismatches: ['result'] };
  }
  for (const field of OFFICIAL_FIELDS) {
    if (actual[field] !== expected[field]) mismatches.push(field);
  }
  if (!Array.isArray(actual.axes)) {
    mismatches.push('axes');
  } else {
    if (actual.axes.length !== expected.axes.length) mismatches.push('axes.length');
    const observed = new Map();
    for (const axis of actual.axes) {
      if (!axis || typeof axis.id !== 'string') {
        mismatches.push('axes.invalidId');
      } else if (observed.has(axis.id)) {
        mismatches.push('axes.duplicateId');
      } else {
        observed.set(axis.id, axis);
      }
    }
    for (const reference of expected.axes) {
      const axis = observed.get(reference.id);
      if (!axis) {
        mismatches.push(`axes.${reference.id}.missing`);
      } else {
        for (const field of AXIS_FIELDS) {
          if (axis[field] !== reference[field]) mismatches.push(`axes.${reference.id}.${field}`);
        }
      }
    }
    for (const id of observed.keys()) {
      if (!expected.axes.some(axis => axis.id === id)) mismatches.push('axes.unexpectedId');
    }
  }
  return { matches: mismatches.length === 0, mismatches };
}

/**
 * Candidate must be a separately evidenced LOCAL scorer. No candidate exists
 * today: do not treat zero comparisons or a fixture lookup as scoring parity.
 */
export async function compareCandidateAgainstRecordedOfficialPairs(
  candidateScore = null,
  observations = OFFICIAL_SYNTHETIC_SCORE_OBSERVATIONS,
) {
  const fixtures = buildVerifiedOfficialScoreFixtures(observations);
  const base = {
    availableVerifiedPairs: fixtures.length,
    officialAlgorithmVerified: false,
  };
  if (candidateScore === null) {
    return {
      ...base, status: 'BLOCKED_NO_LOCAL_OFFICIAL_SCORER',
      comparedPairs: 0, allRecordedPairsMatch: false, cases: [],
    };
  }
  if (typeof candidateScore !== 'function') throw new TypeError('候选计分器必须是本地函数');
  const cases = [];
  for (const fixture of fixtures) {
    let comparison;
    try {
      const candidateOutput = await candidateScore(fixture.input);
      comparison = compareRecordedOfficialScoreFields(fixture.expectedOutput, candidateOutput);
    } catch {
      // Never include exception messages that could accidentally carry answers
      // or credentials into public CI logs.
      comparison = { matches: false, mismatches: ['candidateScore.threw'] };
    }
    cases.push({ publicResultId: fixture.publicResultId, ...comparison });
  }
  const allRecordedPairsMatch = cases.length > 0 && cases.every(row => row.matches);
  return {
    ...base,
    status: allRecordedPairsMatch ? 'RECORDED_SAMPLE_MATCH_ONLY' : 'RECORDED_SAMPLE_MISMATCH',
    comparedPairs: cases.length,
    allRecordedPairsMatch,
    cases,
  };
}
