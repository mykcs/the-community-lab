import { ORIGINAL_SITE_AUDIT } from '../data/original-site-audit.mjs';
import { SEASONS } from '../data/questions.mjs';
import { validateSeason } from './quiz.mjs';

/**
 * Deliberately measures two unrelated things separately:
 * (1) whether the local independent-demo survey is structurally coherent;
 * (2) whether it is proven equivalent to the original Korean survey.
 */
export function buildReproductionAudit(seasons = SEASONS, evidence = ORIGINAL_SITE_AUDIT) {
  const rows = [1, 2].map(id => {
    const season = seasons[id];
    const source = evidence[id];
    validateSeason(season);
    if (!source || source.observedQuestionCount <= 0 || !Number.isSafeInteger(source.observedQuestionCount)) {
      throw new Error('缺失原站题量观测：S' + id);
    }
    const demoCount = season.questions.length;
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
      independentDemoQuestionCount: demoCount,
      bilingualDemoPass: true,
      originalQuestionIdentitiesVerified: source.questionIdentityCoverage === 'verified_complete',
      originalBranchingVerified: source.answerBranchingCoverage === 'verified_complete',
      originalScoringVerified: source.scoringAgreement === 'validated_against_original',
      reproductionReady: officialVerified && season.questions.length === source.observedQuestionCount,
    };
  });
  return { generatedAt: new Date().toISOString(), originalEquivalenceVerified: rows.every(row => row.reproductionReady), rows };
}
