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

// Four already-public, anonymous *synthetic* results. These observations are
// a narrow evidence subset: never copy referral codes, nicknames or real
// participant answers into this repository. One historical UI session did NOT
// verify its submitted choices. Three checked pairs are not a scoring rule.
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

const observedSeason2PartialGroupOutput = Object.freeze({
  season: 'season-2',
  questionnaireVersion: 'season-2@2026-08',
  questionSetHash: '2e4ed483b6b79197',
  scoringVersion: 'season-2-score@2',
  resultType: '결과·구조·의미',
  axes: Object.freeze([
    Object.freeze({ id: '원칙-결과', leftPercent: 49, rightPercent: 51, dominant: '결과', intensity: 1 }),
    Object.freeze({ id: '구조-능력', leftPercent: 50, rightPercent: 50, dominant: '구조', intensity: 1 }),
    Object.freeze({ id: '의미-실리', leftPercent: 50, rightPercent: 50, dominant: '의미', intensity: 1 }),
  ]),
});

export const OFFICIAL_SYNTHETIC_SCORE_OBSERVATIONS = Object.freeze([
  Object.freeze({
    origin: 'anonymous_synthetic',
    publicResultId: 'jNEcQ1XSk2uFGGyi',
    resultCreatedAt: '2026-10-30T11:39:31.678Z',
    inputVerification: 'verified',
    input: Object.freeze({ pattern: 'uniform', choice: 'O', questionCount: 37 }),
    output: observedSeason2Output,
  }),
  Object.freeze({
    origin: 'anonymous_synthetic',
    publicResultId: '0JR4VZqW4PrpCqv7',
    resultCreatedAt: '2026-10-30T11:42:12.666Z',
    inputVerification: 'unverified',
    input: null,
    output: observedSeason2Output,
  }),
  Object.freeze({
    origin: 'anonymous_synthetic',
    publicResultId: 'SWh2Vsfu3fltLZVI',
    resultCreatedAt: '2026-10-31T16:12:32.732Z',
    inputVerification: 'verified',
    input: Object.freeze({
      pattern: 'by_source_group',
      questionCount: 37,
      questionIdsByChoice: Object.freeze({
        O: Object.freeze(['rp01', 'rp02', 'rp03', 'rp04', 'rp05', 'rp06', 'rp07', 'rp08', 'rp09', 'rp10', 'rp11', 'rp12', 'rp13']),
        X: Object.freeze(['sa01', 'sa02', 'sa03', 'sa04', 'sa05', 'sa06', 'sa07', 'sa08', 'sa09', 'sa10', 'sa11', 'sa12', 'sa13', 'ms01', 'ms02', 'ms03', 'ms04', 'ms05', 'ms06', 'ms07', 'ms08', 'ms10', 'ms11', 'ms13']),
      }),
    }),
    output: observedSeason2Output,
  }),
  Object.freeze({
    origin: 'anonymous_synthetic',
    publicResultId: 'z0EAod4cJsXX-MvJ',
    resultCreatedAt: '2026-10-31T17:42:02.315Z',
    inputVerification: 'verified',
    input: Object.freeze({
      pattern: 'by_question_id',
      questionCount: 37,
      questionIdsByChoice: Object.freeze({
        O: Object.freeze([
          'rp01', 'rp02', 'rp03', 'rp04', 'rp05', 'rp06', 'rp07', 'rp08', 'rp09', 'rp10', 'rp11',
        ]),
        X: Object.freeze([
          'rp12', 'rp13', 'sa01', 'sa02', 'sa03', 'sa04', 'sa05', 'sa06', 'sa07',
          'sa08', 'sa09', 'sa10', 'sa11', 'sa12', 'sa13',
          'ms01', 'ms02', 'ms03', 'ms04', 'ms05', 'ms06', 'ms07', 'ms08', 'ms10', 'ms11', 'ms13',
        ]),
      }),
    }),
    output: observedSeason2PartialGroupOutput,
  }),
]);
