import { ORIGINAL_SITE_AUDIT, OFFICIAL_SYNTHETIC_SCORE_OBSERVATIONS } from '../data/original-site-audit.mjs';
import { SEASONS } from '../data/questions.mjs';
import { validateSeason } from './quiz.mjs';
import { verifySourceMetadataSnapshot } from '../scripts/verify-korean-source-snapshot.mjs';
import SOURCE_INDEX from '../data/original-question-index.json' with { type: 'json' };

// A gold *pair* requires a checked input vector and its official readback.
// Checking an output alone cannot recover an input, even when the UI operator
// intended to answer all X. Keep this separate from official algorithm parity.
export function summarizeOfficialSyntheticScoreObservations(observations = OFFICIAL_SYNTHETIC_SCORE_OBSERVATIONS) {
  if (!Array.isArray(observations)) throw new Error('官方合成结果证据必须是数组');
  // An empty fixture is not a successful verification: [].every(...) is true,
  // which would otherwise label 0 checked official responses as all matching.
  if (observations.length === 0) throw new Error('官方合成结果证据至少需要一条，空证据不能视为验证通过');
  const ids = new Set();
  const versions = new Set();
  let verifiedInputOutputPairs = 0;
  for (const sample of observations) {
    const expectedFields = ['origin', 'publicResultId', 'resultCreatedAt', 'inputVerification', 'input', 'output'];
    if (!sample || Object.keys(sample).length !== expectedFields.length ||
        expectedFields.some(key => !Object.hasOwn(sample, key)) ||
        sample.origin !== 'anonymous_synthetic' ||
        typeof sample.publicResultId !== 'string' || !/^[A-Za-z0-9_-]{16}$/.test(sample.publicResultId) ||
        typeof sample.resultCreatedAt !== 'string' || !/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/.test(sample.resultCreatedAt) ||
        ids.has(sample.publicResultId) ||
        !['verified', 'unverified'].includes(sample.inputVerification)) {
      throw new Error('官方合成结果元数据缺失、含多余字段或不是独立匿名合成记录');
    }
    ids.add(sample.publicResultId);
    if (sample.inputVerification === 'verified') {
      const input = sample.input;
      let completeInput = false;
      if (input && input.pattern === 'uniform' &&
          Object.keys(input).sort().join(',') === 'choice,pattern,questionCount' &&
          ['O', 'X'].includes(input.choice) && input.questionCount === 37) {
        completeInput = SOURCE_INDEX.questions.filter(q => q.season === 2).length === input.questionCount;
      } else if (input && input.pattern === 'by_source_group' &&
          Object.keys(input).sort().join(',') === 'pattern,questionCount,questionIdsByChoice' &&
          input.questionCount === 37 && input.questionIdsByChoice &&
          Object.keys(input.questionIdsByChoice).sort().join(',') === 'O,X') {
        const sourceQuestions = SOURCE_INDEX.questions.filter(q => q.season === 2);
        const knownGroups = new Set(sourceQuestions.map(q => q.sourceGroup));
        const idsByChoice = input.questionIdsByChoice;
        const choicesAreArrays = Array.isArray(idsByChoice.O) && Array.isArray(idsByChoice.X);
        const flattenedIds = choicesAreArrays ? [...idsByChoice.O, ...idsByChoice.X] : [];
        const expectedAnswer = new Map(sourceQuestions.map(q => [q.sourceQuestionId,
          q.sourceGroup === '원칙-결과' ? 'O' : 'X']));
        completeInput = choicesAreArrays && sourceQuestions.length === input.questionCount &&
          [...knownGroups].sort().join(',') === ['구조-능력', '의미-실리', '원칙-결과'].sort().join(',') &&
          flattenedIds.length === input.questionCount &&
          flattenedIds.every(id => typeof id === 'string') &&
          new Set(flattenedIds).size === input.questionCount &&
          flattenedIds.every(id => expectedAnswer.get(id) === (idsByChoice.O.includes(id) ? 'O' : 'X'));
      }
      if (!completeInput) {
        throw new Error('完整输入未经逐题验收，不能冒充官方输入→输出样本');
      }
      verifiedInputOutputPairs++;
    } else if (sample.input !== null) {
      throw new Error('未验收的真实输入必须保持 null，不能记录目标猜测');
    }

    const out = sample.output;
    const expectedOutput = ['season', 'questionnaireVersion', 'questionSetHash', 'scoringVersion', 'resultType', 'axes'];
    if (!out || Object.keys(out).length !== expectedOutput.length ||
        expectedOutput.some(key => !Object.hasOwn(out, key)) ||
        out.season !== 'season-2' || !/^season-2@\d{4}-\d{2}$/.test(out.questionnaireVersion) ||
        !/^[a-f0-9]{16}$/.test(out.questionSetHash) ||
        !/^season-2-score@\d+$/.test(out.scoringVersion) ||
        typeof out.resultType !== 'string' || !out.resultType.trim() ||
        !Array.isArray(out.axes) || out.axes.length !== 3) {
      throw new Error('官方合成结果缺少可复核的版本或完整三轴回读');
    }
    const axisIds = new Set();
    for (const axis of out.axes) {
      if (!axis || Object.keys(axis).sort().join(',') !== 'dominant,id,intensity,leftPercent,rightPercent' ||
          !['원칙-결과', '구조-능력', '의미-실리'].includes(axis.id) || axisIds.has(axis.id) ||
          typeof axis.dominant !== 'string' || !axis.id.split('-').includes(axis.dominant) ||
          !Number.isInteger(axis.leftPercent) || !Number.isInteger(axis.rightPercent) ||
          axis.leftPercent < 0 || axis.rightPercent < 0 ||
          axis.leftPercent + axis.rightPercent !== 100 ||
          ![1, 2].includes(axis.intensity)) {
        throw new Error('官方合成结果的轴数据缺失、冲突或越界');
      }
      axisIds.add(axis.id);
    }
    versions.add([out.questionnaireVersion, out.scoringVersion, out.questionSetHash].join(' / '));
  }
  return {
    observedAnonymousSyntheticResults: observations.length,
    verifiedInputOutputPairs,
    inputUnverifiedResults: observations.length - verifiedInputOutputPairs,
    observedVersionTuples: [...versions].sort(),
    officialAlgorithmVerified: false,
  };
}

// The API may change JSON property order or return axes in another order.
// Compare the same public, named score fields, not their serialization order.
// Extra response fields (including participant data) are intentionally ignored.
function sameOfficialScoreReadback(expected, actual) {
  const fields = ['season', 'questionnaireVersion', 'questionSetHash', 'scoringVersion', 'resultType'];
  if (!actual || fields.some(field => actual[field] !== expected[field]) ||
      !Array.isArray(actual.axes) || actual.axes.length !== expected.axes.length) return false;
  const byId = new Map(expected.axes.map(axis => [axis.id, axis]));
  const seen = new Set();
  for (const axis of actual.axes) {
    if (!axis || seen.has(axis.id) || !byId.has(axis.id)) return false;
    const reference = byId.get(axis.id);
    if (['leftPercent', 'rightPercent', 'dominant', 'intensity'].some(field =>
      axis[field] !== reference[field])) return false;
    seen.add(axis.id);
  }
  return seen.size === expected.axes.length;
}

/** Optional bounded GET-only freshness check; never creates a new survey result. */
export async function verifyOfficialSyntheticScoreReadbacks(
  observations = OFFICIAL_SYNTHETIC_SCORE_OBSERVATIONS,
  request = globalThis.fetch,
) {
  summarizeOfficialSyntheticScoreObservations(observations);
  const checked = [];
  for (const sample of observations) {
    const url = `https://thecommunity.co.kr/api/v1/results/${sample.publicResultId}`;
    const response = await request(url, {
      method: 'GET',
      headers: { Accept: 'application/json' },
      signal: AbortSignal.timeout(10_000),
    });
    if (!response.ok) throw new Error(`官方合成结果 ${sample.publicResultId} 只读查询失败：HTTP ${response.status}`);
    const live = await response.json();
    // Read back ONLY the public, non-personal score fields we actually audit.
    // API metadata (e.g. referral codes) and any future raw answers are never
    // copied into the audit output, logs, or repository.
    const result = live && {
      season: live.season,
      questionnaireVersion: live.questionnaireVersion,
      questionSetHash: live.questionSetHash,
      scoringVersion: live.scoringVersion,
      resultType: live.resultType,
      axes: Array.isArray(live.axes) && live.axes.map(axis => ({
        id: axis.id, leftPercent: axis.leftPercent,
        rightPercent: axis.rightPercent, dominant: axis.dominant,
        intensity: axis.intensity,
      })),
    };
    checked.push({
      publicResultId: sample.publicResultId,
      matchesRecordedReadback: sameOfficialScoreReadback(sample.output, result),
    });
  }
  return { checked, allMatch: checked.every(row => row.matchesRecordedReadback) };
}

export function summarizeSourceIndex(index = SOURCE_INDEX) {
  if (!index || !Array.isArray(index.questions) || !/^[a-f0-9]{64}$/.test(index.sourceAssetSha256)) {
    throw new Error('缺少可追溯的源题索引');
  }
  // This index covers *observed client metadata*, not a licensed question pack.
  // A SHA of a public client does not establish official authority, legal
  // reuse, translation review or scoring agreement. Those require separate
  // independent evidence before any status can be promoted.
  const evidenceFlags = {
    sourceAuthority: 'SELF_DESCRIBED_PROGRAM_TEST_UNCONFIRMED',
    sourceIdentityCoverage: 'OBSERVED_PUBLIC_CLIENT_LIST_COMPLETE',
    legalReusePermission: 'UNKNOWN',
    translationAndIndependentReview: 'UNKNOWN',
    officialScoringAgreement: 'UNKNOWN',
  };
  if (Object.entries(evidenceFlags).some(([key, value]) => index[key] !== value)) {
    throw new Error('源题证据状态未经独立核验，不能升级');
  }
  const baseKeys = ['sourceQuestionId', 'season', 'sourceGroup', 'sourceArrayPosition',
    'optionCount', 'optionValues', 'reverseFlagInPublicClient', 'scoreWeight',
    'sourceTextReusePermission', 'translationStatus', 'independentBilingualReview',
    'displayPositionDerivedFromClient', 'sourceQuestionVersion'];
  const allowedKeys = new Set([...baseKeys, 'agreeSideInPublicClient']);
  const unverifiedFields = ['scoreWeight', 'sourceTextReusePermission',
    'translationStatus', 'independentBilingualReview', 'sourceQuestionVersion'];
  const ids = new Set();
  for (const q of index.questions) {
    const key = `${q.season}:${q.sourceQuestionId}`;
    const keys = Object.keys(q);
    const requiredKeys = q.season === 2 ? [...baseKeys, 'agreeSideInPublicClient'] : baseKeys;
    if (![1, 2].includes(q.season) || typeof q.sourceQuestionId !== 'string' || !q.sourceQuestionId.trim() ||
        ids.has(key) || keys.some(k => !allowedKeys.has(k)) ||
        keys.length !== requiredKeys.length || requiredKeys.some(k => !Object.hasOwn(q, k)) ||
        !Number.isSafeInteger(q.optionCount) || q.optionCount < 2 ||
        !Array.isArray(q.optionValues) || q.optionValues.length !== q.optionCount) {
      throw new Error('源题元数据有缺项、重复或包含非元数据字段');
    }
    if (unverifiedFields.some(field => q[field] !== 'UNKNOWN')) {
      throw new Error('源题许可、复核或评分证据仍未知，不能自行升级');
    }
    // Invalid/duplicate choice values cannot support a verifiable answer path.
    if (q.optionValues.some(v => !(typeof v === 'string' && v.length > 0) &&
        !(typeof v === 'number' && Number.isFinite(v))) ||
        new Set(q.optionValues).size !== q.optionCount) {
      throw new Error('源题选项值无效或重复');
    }
    ids.add(key);
  }

  const positionsArePermutation = (values, length) =>
    values.length === length &&
    values.every(n => Number.isSafeInteger(n) && n >= 1 && n <= length) &&
    new Set(values).size === length;

  // The summary table is a claim about the public client, not independently
  // verified official content. Guard it against accidental edits that would
  // otherwise leave a misleading 124/124 identity count.
  if (!Array.isArray(index.groups) || index.groups.length === 0) {
    throw new Error('缺少第一季客户端组别摘要');
  }
  const groupNames = new Set();
  for (const group of index.groups) {
    if (group.season !== 1 || typeof group.sourceGroup !== 'string' || !group.sourceGroup.trim() ||
        groupNames.has(group.sourceGroup) ||
        !Number.isSafeInteger(group.count) || group.count < 1 ||
        !Number.isSafeInteger(group.optionCount) || group.optionCount < 2 ||
        !Number.isSafeInteger(group.reverseFlagCount) || group.reverseFlagCount < 0 ||
        group.reverseFlagCount > group.count || !/^[a-f0-9]{64}$/.test(group.sourceArraySha256)) {
      throw new Error('第一季组别摘要缺项、重复或指纹错误');
    }
    groupNames.add(group.sourceGroup);
    const actual = index.questions.filter(q => q.season === 1 && q.sourceGroup === group.sourceGroup);
    if (actual.length !== group.count || actual.some(q =>
      q.optionCount !== group.optionCount || typeof q.reverseFlagInPublicClient !== 'boolean') ||
      actual.filter(q => q.reverseFlagInPublicClient).length !== group.reverseFlagCount) {
      throw new Error('第一季组别、选项数或反向标志与客户端摘要不符');
    }
  }

  const rows = [1, 2].map(season => {
    const questions = index.questions.filter(q => q.season === season);
    if (!questions.length || questions.length !== index.sourceCountBySeason?.[season]) {
      throw new Error('源题索引数量与版本记录不符');
    }
    if (!positionsArePermutation(questions.map(q => q.sourceArrayPosition), questions.length) ||
        !positionsArePermutation(questions.map(q => q.displayPositionDerivedFromClient), questions.length)) {
      throw new Error('源题顺序有重复、缺项或越界');
    }
    if (season === 1 && questions.some(q => !groupNames.has(q.sourceGroup))) {
      throw new Error('源题引用了未登记的第一季组别');
    }
    if (season === 2 && questions.some(q => q.optionCount !== 2 ||
        q.reverseFlagInPublicClient !== 'UNKNOWN')) {
      throw new Error('第二季客户端选项数或反向标志与已观测状态不符');
    }
    return { season, observedSourceIdentityCount: questions.length,
      sourceAssetUrl: index.sourceAssetUrl, sourceAssetSha256: index.sourceAssetSha256,
      observedAt: index.observedAt, sourceAuthority: index.sourceAuthority };
  });
  // Check the immutable source-data mapping only after reporting structural
  // mistakes with their more informative errors.
  verifySourceMetadataSnapshot(index);
  return rows;
}

/**
 * Deliberately measures two unrelated things separately:
 * (1) whether the local independent-demo survey is structurally coherent;
 * (2) whether it is proven equivalent to the original Korean survey.
 */
export function buildReproductionAudit(seasons = SEASONS, evidence = ORIGINAL_SITE_AUDIT) {
  const index = summarizeSourceIndex();
  const rows = [1, 2].map(id => {
    const season = seasons[id];
    const source = evidence[id];
    validateSeason(season);
    if (!source || source.observedQuestionCount <= 0 || !Number.isSafeInteger(source.observedQuestionCount)) {
      throw new Error('缺失原站题量观测：S' + id);
    }
    const demoCount = season.questions.length;
    // validateSeason currently accepts independent_demo only. Even a complete
    // set of source observations must never upgrade those demo questions.
    const licensedReviewedCount = season.questions.filter(q =>
      q.origin === 'licensed_official' && q.rights_status === 'licensed' &&
      q.review_status === 'bilingual_reviewed').length;
    const officialVerified = (
      source.questionTextReusePermission === 'verified' &&
      source.questionIdentityCoverage === 'verified_complete' &&
      source.answerBranchingCoverage === 'verified_complete' &&
      source.scoringAgreement === 'validated_against_original'
    );
    return {
      season: id,
      publicSourceUrl: source.url,
      observedAt: source.observedAt,
      sourceObservedQuestionCount: source.observedQuestionCount,
      observedSourceIdentityCount: index.find(row => row.season === id).observedSourceIdentityCount,
      independentDemoQuestionCount: demoCount,
      licensedReviewedOfficialQuestionCount: licensedReviewedCount,
      bilingualDemoPass: true,
      originalQuestionIdentitiesVerified: source.questionIdentityCoverage === 'verified_complete',
      originalBranchingVerified: source.answerBranchingCoverage === 'verified_complete',
      originalScoringVerified: source.scoringAgreement === 'validated_against_original',
      reproductionReady: officialVerified && licensedReviewedCount === source.observedQuestionCount,
    };
  });
  return { generatedAt: new Date().toISOString(), originalEquivalenceVerified: rows.every(row => row.reproductionReady), rows };
}
