/**
 * The full-questionnaire pilot is NOT an official scoring implementation.
 * It reuses the already published, unreviewed bilingual source pack and the
 * separate source-ID/order index. Keep this module pure so its provenance and
 * privacy boundaries can be regression-tested without a browser.
 */

export const PILOT_STATUS = 'SOURCE_QUESTION_PILOT_UNREVIEWED_NOT_OFFICIAL';
const COUNTS = { 1: 87, 2: 37 };

export function extractDraftPack(html) {
  if (typeof html !== 'string') throw new Error('缺少译审页面源码');
  const matches = [...html.matchAll(/<script id="embedded-data" type="application\/json">([\s\S]*?)<\/script>/g)];
  if (matches.length !== 1) throw new Error('译审数据必须只有一份');
  return JSON.parse(matches[0][1]);
}

export function buildFullQuestionnaire(draft, index) {
  if (draft?.status !== 'PUBLIC_TRANSLATION_REVIEW_DRAFT_NOT_OFFICIAL' ||
      draft.reported_permission?.status !== 'USER_CONFIRMED_OFFICIAL_NONCOMMERCIAL_PERMISSION' ||
      draft.translation_status !== 'AI_DRAFT_ALL_ITEMS_UNREVIEWED' ||
      draft.independent_bilingual_review !== 'NOT_DONE') {
    throw new Error('译审资料状态发生变化：禁止自动晋级成正式题库');
  }
  if (!/^[a-f0-9]{64}$/.test(draft.source?.asset_sha256 || '') ||
      draft.source.asset_sha256 !== index?.sourceAssetSha256 ||
      !Array.isArray(draft.questions) || !Array.isArray(index?.questions) ||
      draft.questions.length !== 124 || index.questions.length !== 124) {
    throw new Error('源题数量或来源版本与索引不一致');
  }
  const byId = new Map(index.questions.map(q => [q.sourceQuestionId, q]));
  if (byId.size !== 124) throw new Error('索引含重复题号');
  // Season 1 draft positions restart inside each client group; the index
  // stores global source array positions. Season 2 positions are global.
  const expectedSourcePosition = new Map();
  const groupPositions = new Map();
  for (const meta of [...index.questions].sort((a, b) => a.sourceArrayPosition - b.sourceArrayPosition)) {
    const group = `${meta.season}:${meta.sourceGroup}`;
    const localPosition = (groupPositions.get(group) || 0) + 1;
    groupPositions.set(group, localPosition);
    expectedSourcePosition.set(meta.sourceQuestionId,
      meta.season === 1 ? localPosition : meta.sourceArrayPosition);
  }
  const ids = new Set();
  const seasons = { 1: [], 2: [] };
  const versions = new Set();
  let optionCount = 0;
  for (const q of draft.questions) {
    const meta = byId.get(q?.id);
    if (!meta || ids.has(q.id) || ![1, 2].includes(q.season) ||
        q.source_question_id !== q.id || meta.season !== q.season ||
        q.source_position !== expectedSourcePosition.get(q.id) ||
        (q.season === 1 && (q.source_group !== meta.sourceGroup ||
          q.reverse_flag_in_public_client !== meta.reverseFlagInPublicClient)) ||
        (q.season === 2 && (q.source_group_ko !== meta.sourceGroup ||
          q.agree_value_ko !== meta.agreeSideInPublicClient)) ||
        !/^draft-[0-9]+\.[0-9]+\.[0-9]+$/.test(q.translation_version) ||
        q.review_status !== 'draft' || q.translation_status !== 'AI_DRAFT_UNREVIEWED' ||
        q.rights_status !== 'licensed' || q.scoring_version !== 'UNKNOWN' ||
        q.source_url !== `https://thecommunity.co.kr/season/${q.season}/test` ||
        !q.source_text_ko?.trim() || !q.translation_zh_cn?.trim() ||
        !Array.isArray(q.options) || q.options.length !== meta.optionCount ||
        q.option_count !== meta.optionCount || !Number.isInteger(meta.displayPositionDerivedFromClient)) {
      throw new Error(`题目来源、状态或选项不匹配：${q?.id || 'UNKNOWN'}`);
    }
    const seen = new Set();
    for (const o of q.options) {
      if (!o || typeof o.ko !== 'string' || !o.ko.trim() ||
          typeof o.zh_cn !== 'string' || !o.zh_cn.trim() ||
          !(typeof o.value === 'string' || Number.isFinite(o.value)) ||
          seen.has(o.value)) throw new Error(`选项非法：${q.id}`);
      seen.add(o.value);
    }
    if (JSON.stringify(q.options.map(o => o.value)) !== JSON.stringify(meta.optionValues)) {
      throw new Error(`源选项值变化：${q.id}`);
    }
    versions.add(q.translation_version);
    ids.add(q.id);
    optionCount += q.options.length;
    seasons[q.season].push({
      id: q.id,
      season: q.season,
      order: meta.displayPositionDerivedFromClient,
      group: q.season === 1 ? q.source_group : q.source_group_zh_cn_draft,
      sourceKo: q.source_text_ko,
      draftZh: q.translation_zh_cn,
      sourceUrl: q.source_url,
      translationVersion: q.translation_version,
      options: q.options.map(o => ({ value: o.value, ko: o.ko, zh: o.zh_cn })),
    });
  }
  if (optionCount !== 550 || ids.size !== 124) throw new Error('总题数或选项数不符');
  for (const season of [1, 2]) {
    const questions = seasons[season];
    questions.sort((a, b) => a.order - b.order);
    if (questions.length !== COUNTS[season] ||
        questions.some((q, i) => q.order !== i + 1) ||
        questions.some(q => season === 2 ? q.options.length !== 2 : ![4, 6].includes(q.options.length))) {
      throw new Error(`第 ${season} 季缺题、重复展示位置或选项异常`);
    }
  }
  return {
    status: PILOT_STATUS,
    sourceSha256: draft.source.asset_sha256,
    observedAt: draft.observed_at,
    translationVersion: versions.size === 1 ? versions.values().next().value : 'MIXED_PER_QUESTION',
    rightsEvidence: 'USER_REPORTED_NOT_INDEPENDENTLY_VERIFIED',
    orderEvidence: 'PUBLIC_CLIENT_DERIVED_UNVERIFIED_END_TO_END',
    scoringVersion: 'UNKNOWN',
    seasons,
  };
}

export function summarizeUnscoredAnswers(pack, season, answers) {
  const questions = pack?.seasons?.[season];
  if (!Array.isArray(questions) || ![1, 2].includes(Number(season)) ||
      !answers || typeof answers !== 'object' || Array.isArray(answers) ||
      ![Object.prototype, null].includes(Object.getPrototypeOf(answers))) {
    throw new Error('无效的季别或答案集合');
  }
  const ids = new Set(questions.map(q => q.id));
  if (Reflect.ownKeys(answers).some(id => typeof id !== 'string' || !ids.has(id))) {
    throw new Error('答案包含无关题号');
  }
  const groups = new Map();
  const versionCounts = new Map();
  const selections = questions.map(q => {
    if (!Object.hasOwn(answers, q.id) || !q.options.some(o => o.value === answers[q.id])) {
      throw new Error(`缺少答案或非法选项：${q.id}`);
    }
    groups.set(q.group, (groups.get(q.group) || 0) + 1);
    versionCounts.set(q.translationVersion, (versionCounts.get(q.translationVersion) || 0) + 1);
    return { questionId: q.id, selectedValue: answers[q.id], translationVersion: q.translationVersion };
  });
  return {
    status: 'COMPLETED_ANSWERS_ONLY_NO_OFFICIAL_SCORING',
    season: Number(season),
    questionCount: questions.length,
    sourceSha256: pack.sourceSha256,
    translationVersion: versionCounts.size === 1 ? versionCounts.keys().next().value : 'MIXED_PER_QUESTION',
    translationVersions: [...versionCounts].map(([version, questionCount]) => ({ version, questionCount })),
    scoringVersion: 'UNKNOWN',
    groups: [...groups].map(([label, answered]) => ({ label, answered })),
    selections,
  };
}
