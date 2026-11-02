/**
 * Offline contract for the three VERIFIED anonymous S2 input→output pairs.
 * This module does not implement, infer, or call the official scoring service.
 * A matching candidate proves agreement on recorded samples ONLY, never parity
 * for all 2^37 possible responses or for another scoring version.
 */
import SOURCE_INDEX from '../data/original-question-index.json' with { type: 'json' };
import { OFFICIAL_SYNTHETIC_SCORE_OBSERVATIONS } from '../data/original-site-audit.mjs';
import { summarizeOfficialSyntheticScoreObservations } from './reproduction-audit.mjs';
import { verifySourceMetadataSnapshot } from '../scripts/verify-korean-source-snapshot.mjs';

const OFFICIAL_FIELDS = Object.freeze([
  'season', 'questionnaireVersion', 'questionSetHash', 'scoringVersion', 'resultType',
]);
const AXIS_FIELDS = Object.freeze(['leftPercent', 'rightPercent', 'dominant', 'intensity']);

export function buildVerifiedOfficialScoreFixtures(
  observations = OFFICIAL_SYNTHETIC_SCORE_OBSERVATIONS,
  sourceIndex = SOURCE_INDEX,
) {
  // The gold-standard input identity and display order must be bound to the
  // independently pinned client metadata. A plausible 37-row index is not
  // enough: accidental reordering would make parity test the WRONG answers.
  verifySourceMetadataSnapshot(sourceIndex);
  // This separately verifies every observation's origin, full input coverage,
  // version shape and three-axis output before materializing any answer.
  const checked = summarizeOfficialSyntheticScoreObservations(observations);
  // A differential scoring claim is version-specific. The evidence log may
  // retain readbacks from several historical versions, but a single gold
  // fixture batch must not silently pool VERIFIED inputs submitted under
  // different questionnaire, question-set or scoring versions.
  const verifiedVersions = new Set(observations
    .filter(sample => sample.inputVerification === 'verified')
    .map(sample => [
      sample.output.questionnaireVersion,
      sample.output.questionSetHash,
      sample.output.scoringVersion,
    ].join(' / ')));
  if (verifiedVersions.size > 1) {
    throw new Error('官方金标准必须属于同一题库与计分版本，不能跨版本混合验收');
  }
  const source = sourceIndex.questions.filter(q => q.season === 2)
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
        sourceAssetSha256: sourceIndex.sourceAssetSha256,
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
  // Same source IDs, raw selections and pinned scoring version must give the
  // same public score fields. Independent identical repeat observations are
  // useful, but contradictory readbacks are not valid deterministic gold.
  // Fail closed without including sensitive answer values in error messages.
  const outputByInput = new Map();
  for (const fixture of fixtures) {
    const key = JSON.stringify(fixture.input.selections);
    const previous = outputByInput.get(key);
    if (previous && !compareRecordedOfficialScoreFields(previous, fixture.expectedOutput).matches) {
      throw new Error('同一原始答卷在相同题库及计分版本下结果冲突：不能建立官方评分金标准');
    }
    outputByInput.set(key, fixture.expectedOutput);
  }
  return Object.freeze(fixtures);
}

/**
 * Count how much of the original S2 O/X input space the verified evidence
 * actually contrasts. Bundled changes cannot identify per-question effects.
 * Unverified historical readbacks must not supply invented input vectors.
 */
export function summarizeVerifiedOfficialScoreInputCoverage(
  observations = OFFICIAL_SYNTHETIC_SCORE_OBSERVATIONS,
) {
  // Reuse the pinned source-index, complete-vector and version-mixing guards.
  const fixtures = buildVerifiedOfficialScoreFixtures(observations);
  // Repeated identical readbacks can corroborate reproducibility, but must
  // not multiply independent input contrasts or introduce zero-distance pairs.
  // Count each distinct raw answer vector once for identifiability statistics.
  const distinctVectors = new Map();
  for (const fixture of fixtures) {
    const vector = fixture.input.selections.map(selection => selection.selectedValue);
    distinctVectors.set(JSON.stringify(vector), vector);
  }
  const vectors = [...distinctVectors.values()];
  const questionCount = SOURCE_INDEX.questions.filter(q => q.season === 2).length;
  const uniqueInputVectors = vectors.length;
  let questionsObservedWithBothValues = 0;
  for (let index = 0; index < questionCount; index++) {
    if (new Set(vectors.map(vector => vector[index])).size === 2) {
      questionsObservedWithBothValues++;
    }
  }
  const hamming = [];
  for (let i = 0; i < vectors.length; i++) {
    for (let j = i + 1; j < vectors.length; j++) {
      hamming.push(vectors[i].filter((value, index) => value !== vectors[j][index]).length);
    }
  }
  return {
    verifiedPairs: fixtures.length,
    questionCount,
    uniqueInputVectors,
    questionsObservedWithBothValues,
    questionsObservedWithOnlyOneValue: vectors.length ? questionCount - questionsObservedWithBothValues : 0,
    questionsObservedWithNoVerifiedValues: vectors.length ? 0 : questionCount,
    comparedInputPairs: hamming.length,
    singleQuestionContrastPairs: hamming.filter(distance => distance === 1).length,
    minPairwiseHammingDistance: hamming.length ? Math.min(...hamming) : null,
    maxPairwiseHammingDistance: hamming.length ? Math.max(...hamming) : null,
    officialAlgorithmVerified: false,
  };
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
