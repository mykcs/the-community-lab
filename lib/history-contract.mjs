// Candidate consent version only. It grants no permission to activate capture.
export const HISTORY_CONSENT_VERSION = 'history-consent-v1';
export const HISTORY_SELECT_COLUMNS = 'id,season,question_version,scoring_version,translation_version,origin,dimensions,consent_version,client_request_id,created_at,consented_at';
// Append-only snapshots of existing SEASONS identities, not official scales.
// Keep released versions when a later quiz pack is introduced. Tests bind these
// snapshots both to current quiz metadata and to the canonical SQL catalog.
export const HISTORY_TEST_VERSIONS = Object.freeze([
  { season: 1, question_version: 'independent-s1-demo-0.1.0', scoring_version: 'independent-fourpoint-v1',
    translation_version: 'demo-0.1.0', origin: 'independent_demo', axis_ids: ['politics', 'gender', 'class', 'openness'] },
  { season: 1, question_version: 'independent-s1-demo-0.1.1', scoring_version: 'independent-fourpoint-v1',
    translation_version: 'demo-s1-0.1.1', origin: 'independent_demo', axis_ids: ['politics', 'gender', 'class', 'openness'] },
  { season: 2, question_version: 'independent-s2-demo-0.1.0', scoring_version: 'independent-binary-v1',
    translation_version: 'demo-0.1.0', origin: 'independent_demo', axis_ids: ['principle', 'structure', 'meaning'] },
].map(version => Object.freeze({ ...version, axis_ids: Object.freeze(version.axis_ids) })));

const RESULT_KEYS = ['season', 'question_version', 'scoring_version', 'translation_version', 'origin', 'dimensions'];
const PAYLOAD_KEYS = [...RESULT_KEYS, 'consent_version', 'client_request_id'];
const RESULT_DIMENSION_KEYS = ['id', 'score', 'name', 'ko', 'negative', 'positive', 'explanation', 'count'];
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function object(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value) &&
    [Object.prototype, null].includes(Object.getPrototypeOf(value));
}
function keysOnly(value, allowed, required = allowed) {
  return object(value) && Object.keys(value).every(key => allowed.includes(key)) &&
    required.every(key => Object.hasOwn(value, key));
}
function versionFor(result) {
  const version = HISTORY_TEST_VERSIONS.find(candidate =>
    candidate.season === result.season && candidate.question_version === result.question_version &&
    candidate.scoring_version === result.scoring_version && candidate.translation_version === result.translation_version &&
    candidate.origin === result.origin);
  if (!version) throw new Error('结果的季别或题库、评分、译文版本不受支持');
  return version;
}
function normalizedDimensions(result, rich = false) {
  const version = versionFor(result);
  if (!Array.isArray(result.dimensions) || result.dimensions.length !== version.axis_ids.length) {
    throw new Error('结果维度不完整');
  }
  const scores = new Map();
  for (const dimension of result.dimensions) {
    if (!keysOnly(dimension, rich ? RESULT_DIMENSION_KEYS : ['id', 'score'], ['id', 'score']) ||
        !version.axis_ids.includes(dimension.id) || scores.has(dimension.id) ||
        !Number.isInteger(dimension.score) || dimension.score < -100 || dimension.score > 100) {
      throw new Error('结果维度或分数无效');
    }
    scores.set(dimension.id, dimension.score);
  }
  return version.axis_ids.map(id => ({ id, score: scores.get(id) }));
}

/** Validate only the public insertion contract; never accept server-owned columns. */
export function validateHistoryPayload(payload) {
  if (!keysOnly(payload, PAYLOAD_KEYS) || payload.consent_version !== HISTORY_CONSENT_VERSION ||
      typeof payload.client_request_id !== 'string' || !UUID.test(payload.client_request_id)) {
    throw new Error('保存内容、同意版本或请求标识无效');
  }
  normalizedDimensions(payload);
  return true;
}

/** Called only after the visitor actively agrees; strips display-only axis metadata. */
export function toHistoryPayload(result, { consent, requestId } = {}) {
  if (consent !== true) throw new Error('请先明确同意保存这次结果');
  if (!keysOnly(result, RESULT_KEYS)) throw new Error('结果包含不允许保存的字段');
  const payload = {
    season: result.season,
    question_version: result.question_version,
    scoring_version: result.scoring_version,
    translation_version: result.translation_version,
    origin: result.origin,
    dimensions: normalizedDimensions(result, true),
    consent_version: HISTORY_CONSENT_VERSION,
    client_request_id: typeof requestId === 'string' ? requestId.toLowerCase() : requestId,
  };
  validateHistoryPayload(payload);
  return payload;
}

function serverDate(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}[T ]/.test(value)) throw new Error('服务器记录时间无效');
  const date = new Date(value);
  if (!Number.isFinite(date.valueOf())) throw new Error('服务器记录时间无效');
  return date.toISOString();
}

/** Export only portable result data, never Auth IDs, request IDs or raw answers. */
export function toExportRow(row) {
  if (!object(row)) throw new Error('历史记录无效');
  const result = Object.fromEntries(RESULT_KEYS.map(key => [key, row[key]]));
  // A later consent policy must not trap an owner's older exportable records.
  if (typeof row.consent_version !== 'string' || !row.consent_version.trim() || row.consent_version.length > 64) {
    throw new Error('历史同意版本无效');
  }
  return { ...result, dimensions: normalizedDimensions(result), consent_version: row.consent_version,
    created_at: serverDate(row.created_at), consented_at: serverDate(row.consented_at) };
}
