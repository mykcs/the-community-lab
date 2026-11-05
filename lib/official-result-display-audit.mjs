import { createHash } from 'node:crypto';
import { OFFICIAL_SYNTHETIC_SCORE_OBSERVATIONS } from '../data/original-site-audit.mjs';
import { OFFICIAL_SYNTHETIC_RESULT_DISPLAY_DIGESTS } from '../data/official-result-display-digests.mjs';

const DIGEST = /^[a-f0-9]{64}$/;
const sha256 = text => typeof text === 'string'
  ? createHash('sha256').update(text, 'utf8').digest('hex') : null;

/**
 * Offline evidence coverage, NOT an official-scoring or Chinese translation
 * parity claim. The original public Korean result prose is never stored.
 */
export function summarizeOfficialResultDisplayDigestCoverage(
  observations = OFFICIAL_SYNTHETIC_SCORE_OBSERVATIONS,
  references = OFFICIAL_SYNTHETIC_RESULT_DISPLAY_DIGESTS,
) {
  if (!Array.isArray(observations) || !observations.length ||
      !references || typeof references !== 'object' || Array.isArray(references)) {
    throw new Error('官方结果说明摘要证据格式不完整');
  }
  const ids = observations.map(sample => sample?.publicResultId);
  if (ids.some(id => typeof id !== 'string') ||
      new Set(ids).size !== ids.length ||
      Object.keys(references).length !== ids.length ||
      ids.some(id => !Object.hasOwn(references, id))) {
    throw new Error('官方结果说明摘要必须逐条对应既有匿名合成结果');
  }
  for (const ref of Object.values(references)) {
    if (!ref || typeof ref !== 'object' || Array.isArray(ref) ||
        Object.keys(ref).sort().join(',') !== 'summarySha256,titleSha256' ||
        !DIGEST.test(ref.titleSha256) || !DIGEST.test(ref.summarySha256)) {
      throw new Error('官方结果说明摘要必须只有两个有效 SHA-256');
    }
  }
  const signatures = new Set(ids.map(id =>
    [references[id].titleSha256, references[id].summarySha256].join(':')));
  return {
    observedResultReadbacksWithDisplayDigests: ids.length,
    distinctResultDisplayTextSignatures: signatures.size,
    verifiedInputReadbacksWithDisplayDigests:
      observations.filter(sample => sample.inputVerification === 'verified').length,
    independentlyReviewedChineseResultExplanations: 0,
    officialFullResultEquivalenceVerified: false,
  };
}

/**
 * Compare ONLY hashes of already-public synthetic result text, plus publicly
 * visible Korean axis labels. No title/summary, metadata or answers are returned.
 * Axis and JSON property order do not affect correctness.
 */
export function compareOfficialResultDisplayFields(reference, live, expectedAxes) {
  const mismatches = [];
  if (!reference || !DIGEST.test(reference.titleSha256 || '') ||
      !DIGEST.test(reference.summarySha256 || '')) {
    throw new Error('官方结果说明摘要无效');
  }
  if (sha256(live?.title) !== reference.titleSha256) mismatches.push('title.sha256');
  if (sha256(live?.summary) !== reference.summarySha256) mismatches.push('summary.sha256');
  if (!Array.isArray(live?.axes) || !Array.isArray(expectedAxes) ||
      live.axes.length !== expectedAxes.length) {
    mismatches.push('axes.labels.length');
  } else {
    const byId = new Map();
    for (const axis of live.axes) {
      if (!axis || typeof axis.id !== 'string' || byId.has(axis.id)) {
        mismatches.push('axes.labels.duplicateOrInvalidId');
      } else {
        byId.set(axis.id, axis);
      }
    }
    for (const expected of expectedAxes) {
      const axis = byId.get(expected.id);
      const labels = expected.id.split('-');
      if (!axis || labels.length !== 2 || axis.leftLabel !== labels[0] ||
          axis.rightLabel !== labels[1]) {
        mismatches.push('axes.labels.' + expected.id);
      }
    }
  }
  return { matches: mismatches.length === 0, mismatches };
}
