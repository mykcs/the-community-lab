import { ORIGINAL_SITE_AUDIT } from '../data/original-site-audit.mjs';
import { SEASONS } from '../data/questions.mjs';
import { validateSeason } from './quiz.mjs';
import SOURCE_INDEX from '../data/original-question-index.json' with { type: 'json' };

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

  return [1, 2].map(season => {
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
