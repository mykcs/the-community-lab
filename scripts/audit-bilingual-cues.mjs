/**
 * Offline reviewer triage, NOT a Korean→Chinese translation validator.
 *
 * The existing review UI flags Korean-only linguistic cues. This checks
 * both question stems and all source-value-stable answer captions for a
 * broad corresponding Chinese-language cue. The output contains only source
 * IDs, official option values and category codes (no question/answer text).
 * False positives/negatives are expected; every one of the 124 drafts still
 * requires independent qualified bilingual human review.
 */
import { pathToFileURL } from 'node:url';
import { loadFullQuestionnaire } from './load-full-questionnaire.mjs';

const RULES = Object.freeze([
  {
    id: 'negation',
    source: /않|(?<!잘)못|없|아니|(?:^|[\s.,?!])안\s|싫|금지|반대|거부|불가능/,
    target: /不|未|没|无|否|反对|禁止|拒绝|不能|无需|难以|并非|反感|错误|糟糕|更糟/,
  },
  {
    id: 'absolute_scope',
    source: /항상|언제나|반드시|절대|모든|누구나|전부|전혀|무조건/,
    target: /总|始终|永远|必须|必然|绝对|所有|任何|每|一切|完全|毫无|全都|全部|从不|无条件/,
  },
  {
    id: 'conditional_scope',
    source: /때문|경우|더라도|이라면|라면|다면|으면|하면/,
    target: /如果|若|当|只要|即使|尽管|情况下|因为|由于|一旦|就算|否则|的话|虽然|即便|因此|因|的时候|很多时候|往往|经常|通常|却|时|在.+地区/,
  },
  {
    id: 'comparative_degree',
    source: /보다|가장|최소|최대|적어도|넘게|더\s/,
    target: /比|更|最|至少|至多|不少于|不超过|超过|优于|较|多于|低于|高于|大于|少于|不及|尽可能|尽量/,
  },
  {
    id: 'korean_deixis',
    source: /우리나라|우리\s*사회|우리\s*문화/,
    target: /韩国|韩国社会|韩国文化/,
  },
]);

const valid = s => typeof s === 'string' && s.trim().length > 0;

export function triageBilingualCues(pack) {
  const items = [];
  for (const season of [1, 2]) {
    const questions = pack?.seasons?.[season];
    if (!Array.isArray(questions)) throw new TypeError('Missing season questions');
    for (const q of questions) {
      if (!q || !valid(q.id) || !valid(q.sourceKo) || !valid(q.draftZh)) {
        throw new TypeError('Invalid bilingual question fields');
      }
      if (!Array.isArray(q.options) || q.options.length === 0 ||
          q.options.some(o => !o || !['number', 'string'].includes(typeof o.value) ||
            typeof o.ko !== 'string' || !valid(o.zh))) {
        throw new TypeError('Invalid bilingual option fields');
      }
      const cues = RULES.filter(rule => rule.source.test(q.sourceKo));
      const missing = cues.filter(rule => !rule.target.test(q.draftZh));
      // S1 six-level scales genuinely have blank Korean captions at values
      // 2/5. Never invent source Korean text to fill these empty labels.
      const optionFlags = q.options.flatMap(option => {
        const sourceCues = RULES.filter(rule => rule.source.test(option.ko));
        const missingCues = sourceCues.filter(rule => !rule.target.test(option.zh));
        return missingCues.length ? [{
          sourceOptionValue: option.value,
          sourceCueIds: sourceCues.map(rule => rule.id),
          targetCueNotDetected: missingCues.map(rule => rule.id),
        }] : [];
      });
      items.push({
        season, sourceQuestionId: q.id,
        sourceCueIds: cues.map(rule => rule.id),
        targetCueNotDetected: missing.map(rule => rule.id),
        optionTargetCueNotDetected: optionFlags,
        priority: (missing.length || optionFlags.length) ? 'TARGET_CUE_ABSENT_REVIEW_FIRST' :
          cues.length >= 2 ? 'COMPLEX_SOURCE_CUES_REVIEW_FIRST' : 'STANDARD_BILINGUAL_CHECK',
      });
    }
  }
  const optionCount = [1, 2].flatMap(season => pack.seasons[season])
    .reduce((n, q) => n + q.options.length, 0);
  if (items.length !== 124 || optionCount !== 550 ||
      items.filter(q => q.season === 1).length !== 87 ||
      items.filter(q => q.season === 2).length !== 37 ||
      new Set(items.map(q => q.sourceQuestionId)).size !== 124) {
    throw new Error('Expected 87 S1 and 37 S2 distinct questions');
  }
  items.sort((a, b) =>
    (b.targetCueNotDetected.length + b.optionTargetCueNotDetected.length) -
    (a.targetCueNotDetected.length + a.optionTargetCueNotDetected.length) ||
    b.sourceCueIds.length - a.sourceCueIds.length ||
    a.season - b.season || a.sourceQuestionId.localeCompare(b.sourceQuestionId));
  return {
    schema: 'bilingual-cue-triage@2',
    sourceQuestionCount: items.length,
    sourceOptionCount: optionCount,
    independentlyHumanReviewed: 0,
    heuristicResultIsTranslationApproval: false,
    allItemsStillRequireIndependentBilingualReview: true,
    meaning: 'Lexical cues only; NOT proven errors, approvals, or an official translation',
    firstPassPriorityCount: items.filter(item => item.priority !== 'STANDARD_BILINGUAL_CHECK').length,
    lexicalCueWithoutTargetCount: items.filter(item => item.targetCueNotDetected.length).length,
    optionLexicalCueWithoutTargetCount: items.reduce((n, item) =>
      n + item.optionTargetCueNotDetected.length, 0),
    items,
  };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  // This command never sends or logs source/translation prose or personal data.
  console.log(JSON.stringify(triageBilingualCues(loadFullQuestionnaire()), null, 2));
}
