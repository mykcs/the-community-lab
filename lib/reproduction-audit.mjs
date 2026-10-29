import { ORIGINAL_SITE_AUDIT } from '../data/original-site-audit.mjs';
import { SEASONS } from '../data/questions.mjs';
import { validateSeason } from './quiz.mjs';
import SOURCE_INDEX from '../data/original-question-index.json' with { type: 'json' };

export function summarizeSourceIndex(index = SOURCE_INDEX) {
  if (!index || !Array.isArray(index.questions) || !/^[a-f0-9]{64}$/.test(index.sourceAssetSha256)) {
    throw new Error('缺少可追溯的源题索引');
  }
  const allowedKeys = new Set(['sourceQuestionId', 'season', 'sourceGroup', 'sourceArrayPosition',
    'optionCount', 'optionValues', 'reverseFlagInPublicClient', 'scoreWeight',
    'sourceTextReusePermission', 'translationStatus', 'independentBilingualReview',
    'displayPositionDerivedFromClient', 'agreeSideInPublicClient', 'sourceQuestionVersion']);
  const ids = new Set();
  for (const q of index.questions) {
    const key = `${q.season}:${q.sourceQuestionId}`;
    if (![1, 2].includes(q.season) || typeof q.sourceQuestionId !== 'string' || !q.sourceQuestionId.trim() ||
        ids.has(key) || Object.keys(q).some(k => !allowedKeys.has(k)) ||
        !Number.isSafeInteger(q.optionCount) || q.optionCount < 2 ||
        !Array.isArray(q.optionValues) || q.optionValues.length !== q.optionCount) {
      throw new Error('源题元数据有缺项、重复或包含非元数据字段');
    }
    ids.add(key);
  }
  return [1, 2].map(season => {
    const questions = index.questions.filter(q => q.season === season);
    if (!questions.length || questions.length !== index.sourceCountBySeason?.[season]) {
      throw new Error('源题索引数量与版本记录不符');
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
