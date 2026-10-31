/**
 * The full-questionnaire pilot is NOT an official scoring implementation.
 * It reuses the already published, unreviewed bilingual source pack and the
 * separate source-ID/order index. Keep this module pure so its provenance and
 * privacy boundaries can be regression-tested without a browser.
 */

export const PILOT_STATUS = 'SOURCE_QUESTION_PILOT_UNREVIEWED_NOT_OFFICIAL';
export const PRIVATE_PROGRESS_FORMAT = 'the-community-lab-local-progress@1';
const PRIVATE_PROGRESS_STATUS = 'PRIVATE_ANSWERS_ONLY_NO_OFFICIAL_SCORING';
const COUNTS = { 1: 87, 2: 37 };
const isDraftVersion = version => typeof version === 'string' &&
  /^draft-[0-9]+\.[0-9]+\.[0-9]+$/.test(version);
const validSeasonVersion = version => version === 'MIXED_PER_QUESTION' || isDraftVersion(version);

// A translation edit changes what the respondent read, not their source
// question ID or original option value. Preserve the recorded selection
// version until the respondent actually reconfirms the updated wording.
function versionOfAnswer(question, answerVersions) {
  const version = answerVersions?.[question.id] ?? question.translationVersion;
  if (!isDraftVersion(version)) throw new Error('答题时的译文版本非法');
  return version;
}


// Version labels are editorial metadata, not a guarantee that a wording
// change was correctly version-bumped. Compare exact build-time SHA-256s too.
function fingerprintOfAnswer(question, answerFingerprints) {
  // A legacy backup did not record the wording the respondent read. Preserve
  // that explicit unknown (null) rather than forge the CURRENT text's hash.
  const fingerprint = answerFingerprints && Object.hasOwn(answerFingerprints, question.id)
    ? answerFingerprints[question.id] : question.translationFingerprint;
  if (fingerprint === null) return null;
  if (typeof fingerprint !== 'string' || !/^[a-f0-9]{64}$/.test(fingerprint)) {
    throw new Error('答题时的中文文字指纹非法');
  }
  return fingerprint;
}

function seasonTranslationVersion(questions) {
  const versions = new Set(questions.map(q => q.translationVersion));
  return versions.size === 1 ? versions.values().next().value : 'MIXED_PER_QUESTION';
}

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

export function summarizeUnscoredAnswers(pack, season, answers, answerVersions = undefined, answerFingerprints = undefined) {
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
    const translationVersion = versionOfAnswer(q, answerVersions);
    versionCounts.set(translationVersion, (versionCounts.get(translationVersion) || 0) + 1);
    return { questionId: q.id, selectedValue: answers[q.id], translationVersion,
      translationFingerprint: fingerprintOfAnswer(q, answerFingerprints) };
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

/**
 * User-controlled local backup. There is intentionally no network or browser
 * storage here. The receipt is private answer data, NOT an official score.
 */
export function createPrivateProgressReceipt(pack, season, answers, index, answerVersions = undefined, answerFingerprints = undefined) {
  const questions = pack?.seasons?.[season];
  if (pack?.status !== PILOT_STATUS || pack?.scoringVersion !== 'UNKNOWN' ||
      !Array.isArray(questions) || ![1, 2].includes(Number(season)) ||
      !Number.isInteger(index) || index < 0 || index >= questions.length ||
      !answers || typeof answers !== 'object' || Array.isArray(answers) ||
      ![Object.prototype, null].includes(Object.getPrototypeOf(answers))) {
    throw new Error('无法导出：试填状态、季别或当前位置不符合要求');
  }
  const byId = new Map(questions.map(q => [q.id, q]));
  for (const id of Reflect.ownKeys(answers)) {
    const q = typeof id === 'string' ? byId.get(id) : undefined;
    if (!q || !q.options.some(o => o.value === answers[id])) {
      throw new Error('无法导出：答案含无效题号或选项');
    }
  }
  return {
    format: PRIVATE_PROGRESS_FORMAT,
    status: PRIVATE_PROGRESS_STATUS,
    season: Number(season),
    questionCount: questions.length,
    sourceSha256: pack.sourceSha256,
    translationVersion: seasonTranslationVersion(questions),
    scoringVersion: 'UNKNOWN',
    currentQuestionId: questions[index].id,
    selections: questions.filter(q => Object.hasOwn(answers, q.id)).map(q => ({
      questionId: q.id,
      selectedValue: answers[q.id],
      translationVersion: versionOfAnswer(q, answerVersions),
      translationFingerprint: fingerprintOfAnswer(q, answerFingerprints),
    })),
  };
}

/**
 * An import must not silently discard answers from an ongoing local session.
 * Adding new answers while preserving every existing selection is safe.
 */
export function wouldDiscardLocalAnswers(existingAnswers, restoredAnswers) {
  if (!existingAnswers || !restoredAnswers ||
      typeof existingAnswers !== 'object' || typeof restoredAnswers !== 'object' ||
      Array.isArray(existingAnswers) || Array.isArray(restoredAnswers)) {
    throw new Error('无法比较本机答题记录');
  }
  return Object.keys(existingAnswers).some(id =>
    !Object.hasOwn(restoredAnswers, id) || restoredAnswers[id] !== existingAnswers[id]);
}

/**
 * Import only the same questionnaire and per-question translation versions.
 * Also accepts our original completed-only download format for compatibility.
 * Does not treat either file as official, authenticated or server-sourced.
 */
export function restorePrivateProgressReceipt(pack, record) {
  const progress = record?.format === PRIVATE_PROGRESS_FORMAT && record.status === PRIVATE_PROGRESS_STATUS;
  const olderComplete = record?.format === undefined &&
    record?.status === 'COMPLETED_ANSWERS_ONLY_NO_OFFICIAL_SCORING';
  const season = record?.season;
  const questions = pack?.seasons?.[season];
  if (!(progress || olderComplete) || pack?.status !== PILOT_STATUS ||
      pack?.scoringVersion !== 'UNKNOWN' || ![1, 2].includes(season) ||
      !Array.isArray(questions) || record.questionCount !== questions.length ||
      record.sourceSha256 !== pack.sourceSha256 ||
      !validSeasonVersion(record.translationVersion) ||
      record.scoringVersion !== 'UNKNOWN' ||
      !Array.isArray(record.selections) || record.selections.length > questions.length) {
    throw new Error('文件类型、题库来源或版本不匹配，无法恢复');
  }
  const byId = new Map(questions.map(q => [q.id, q]));
  const answers = Object.create(null);
  const answerVersions = Object.create(null);
  const answerFingerprints = Object.create(null);
  const changedQuestionIds = [];
  for (const selection of record.selections) {
    const q = byId.get(selection?.questionId);
    if (!q || Object.hasOwn(answers, q.id) ||
        !isDraftVersion(selection.translationVersion) ||
        (selection.translationFingerprint !== undefined &&
         selection.translationFingerprint !== null &&
          (typeof selection.translationFingerprint !== 'string' ||
           !/^[a-f0-9]{64}$/.test(selection.translationFingerprint))) ||
        !q.options.some(o => o.value === selection.selectedValue)) {
      throw new Error('文件包含重复、无效或不同版本的答案，无法恢复');
    }
    answers[q.id] = selection.selectedValue;
    answerVersions[q.id] = selection.translationVersion;
    // Legacy @1 receipts without this optional field remain importable.
    // They can only compare editorial version labels, not historic wording.
    // Missing/null historic fingerprints remain unverified across re-exports.
    // Never silently mark an unknown old wording as confirmed merely because
    // its editorial version label matches the current page. Restore the
    // choice, but require the respondent to explicitly reselect it.
    // A fresh user click is the only way to assign the current wording hash.
    answerFingerprints[q.id] = selection.translationFingerprint ?? null;
    if (selection.translationFingerprint == null ||
        selection.translationVersion !== q.translationVersion ||
        selection.translationFingerprint !== q.translationFingerprint) {
      changedQuestionIds.push(q.id);
    }
  }
  if (olderComplete && record.selections.length !== questions.length) {
    throw new Error('旧版完成记录缺少答案，无法恢复');
  }
  const index = progress
    ? questions.findIndex(q => q.id === record.currentQuestionId)
    : questions.length - 1;
  if (index < 0) throw new Error('文件中的当前位置不属于本季题库');
  return {
    season,
    index,
    answers,
    answerVersions,
    answerFingerprints,
    changedQuestionIds,
    answeredCount: record.selections.length,
    complete: record.selections.length === questions.length,
  };
}
