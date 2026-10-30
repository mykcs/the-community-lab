// Observations of the Korean public test landing pages, not a grant to
// redistribute their questions and not proof of the official scoring algorithm.
// Do not replace observations with claims that the independent demo is official.
export const ORIGINAL_SITE_AUDIT = Object.freeze({
  1: Object.freeze({
    url: 'https://the-community-survey.web.app/season/1',
    observedQuestionCount: 87,
    observedAt: '2026-10-29',
    questionTextReusePermission: 'unknown',
    questionIdentityCoverage: 'unverified',
    answerBranchingCoverage: 'unverified',
    scoringAgreement: 'unverified',
    guestScoresComparable: false,
  }),
  2: Object.freeze({
    url: 'https://the-community-survey.web.app/season/2',
    observedQuestionCount: 37,
    observedAt: '2026-10-29',
    questionTextReusePermission: 'unknown',
    questionIdentityCoverage: 'unverified',
    answerBranchingCoverage: 'unverified',
    scoringAgreement: 'unverified',
    guestScoresComparable: false,
  }),
});

// Two already-public, anonymous *synthetic* results. These observations are a
// read-only evidence subset: never copy the API's referral code, timestamp,
// nickname or a real participant's answers into this public repository.
// In particular, the second UI session did NOT verify its submitted choices.
// A version string and one checked input/output pair are not a scoring rule.
const observedSeason2Output = Object.freeze({
  season: 'season-2',
  questionnaireVersion: 'season-2@2026-08',
  questionSetHash: '2e4ed483b6b79197',
  scoringVersion: 'season-2-score@2',
  resultType: '원칙·구조·의미',
  axes: Object.freeze([
    Object.freeze({ id: '원칙-결과', leftPercent: 50, rightPercent: 50, dominant: '원칙', intensity: 1 }),
    Object.freeze({ id: '구조-능력', leftPercent: 50, rightPercent: 50, dominant: '구조', intensity: 1 }),
    Object.freeze({ id: '의미-실리', leftPercent: 50, rightPercent: 50, dominant: '의미', intensity: 1 }),
  ]),
});

export const OFFICIAL_SYNTHETIC_SCORE_OBSERVATIONS = Object.freeze([
  Object.freeze({
    origin: 'anonymous_synthetic',
    publicResultId: 'jNEcQ1XSk2uFGGyi',
    inputVerification: 'verified',
    input: Object.freeze({ pattern: 'uniform', choice: 'O', questionCount: 37 }),
    output: observedSeason2Output,
  }),
  Object.freeze({
    origin: 'anonymous_synthetic',
    publicResultId: '0JR4VZqW4PrpCqv7',
    inputVerification: 'unverified',
    input: null,
    output: observedSeason2Output,
  }),
]);
