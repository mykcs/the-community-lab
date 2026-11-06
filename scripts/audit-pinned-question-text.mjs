/**
 * Offline, exact-text membership audit for the already-public Korean question
 * draft against a byte-for-byte pinned public client artifact.
 *
 * This validates S2's direct ID-to-prompt/group/option bindings against the
 * pinned client; S1 remains exact-text membership only. It does NOT validate
 * permission, translation quality, branching, or official scoring. Never log
 * question prose or participant answers. No network request is made here.
 */
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import INDEX from '../data/original-question-index.json' with { type: 'json' };
import { loadFullQuestionnaire } from './load-full-questionnaire.mjs';
import { KOREAN_SOURCE_SNAPSHOT } from './verify-korean-source-snapshot.mjs';

const PINNED_CLIENT = Object.freeze({
  sha256: KOREAN_SOURCE_SNAPSHOT.sourceAssetSha256,
  bytes: 331_501,
  counts: { 1: 87, 2: 37 },
});

export function auditPinnedKoreanQuestionText(bytes, pack, expected = PINNED_CLIENT, index = INDEX) {
  if (!Buffer.isBuffer(bytes)) throw new TypeError('Expected raw public client bytes');
  const digest = createHash('sha256').update(bytes).digest('hex');
  if (bytes.length !== expected.bytes || digest !== expected.sha256 ||
      pack?.sourceSha256 !== expected.sha256) {
    throw new Error('Client bytes or pack provenance differ from pinned source');
  }

  const rows = [];
  for (const season of [1, 2]) {
    const questions = pack?.seasons?.[season];
    if (!Array.isArray(questions) || questions.length !== expected.counts[season]) {
      throw new Error('Unexpected source question count');
    }
    for (const question of questions) {
      if (question?.season !== season || typeof question.id !== 'string' ||
          !question.id.trim() || typeof question.sourceKo !== 'string' ||
          !question.sourceKo.trim()) {
        throw new Error('Invalid source question identity or Korean text');
      }
      rows.push(question);
    }
  }
  if (new Set(rows.map(q => q.id)).size !== rows.length ||
      new Set(rows.map(q => q.sourceKo)).size !== rows.length) {
    throw new Error('Duplicate source ID or Korean question text');
  }

  const source = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  const failures = [];
  for (const question of rows) {
    // This is a string-membership check, not a JS parser. Exact uniqueness
    // excludes obvious ambiguous/missing matches but cannot prove the string
    // belongs to the claimed question ID or answer value.
    const first = source.indexOf(question.sourceKo);
    const second = first < 0 ? -1 : source.indexOf(question.sourceKo, first + question.sourceKo.length);
    if (first < 0 || second >= 0) failures.push(question.id);
  }
  if (failures.length) {
    throw new Error('Pinned client does not uniquely contain each Korean text; source IDs: ' +
      failures.join(', '));
  }
  const s2Binding = verifyPinnedSeason2QuestionBindings(source, pack, index, expected.counts[2]);
  return Object.freeze({
    status: 'PINNED_SOURCE_TEXT_MEMBERSHIP_AND_S2_ID_BINDINGS_NOT_OFFICIAL_EQUIVALENCE',
    sourceAssetSha256: digest,
    season1UniqueExactTextMatches: expected.counts[1],
    season2UniqueExactTextMatches: expected.counts[2],
    totalUniqueExactTextMatches: rows.length,
    ...s2Binding,
    season1IdToTextBinding: 'NOT_PROVEN_BY_THIS_AUDIT',
    permissionsHumanReviewSourceIdMappingAndScoring: 'NOT_VALIDATED_BY_THIS_AUDIT',
  });
}

function decodeClientString(value) {
  try {
    return JSON.parse(`"${value}"`);
  } catch {
    throw new Error('Pinned client contains an unsupported string encoding');
  }
}

/**
 * Bind each S2 stable ID to its adjacent prompt, group, agree-side and raw
 * option values in the pinned public client object list. Korean strings are
 * compared in memory only and are never returned.
 */
export function verifyPinnedSeason2QuestionBindings(code, pack, index, expectedCount = 37) {
  if (typeof code !== 'string') throw new TypeError('Expected decoded pinned client source');
  const markers = [...code.matchAll(/const ie=\["O","X"\],\$s=\[/g)];
  if (markers.length !== 1) throw new Error('Pinned S2 question object list is not unique');
  const start = markers[0].index + markers[0][0].length;
  const end = code.indexOf('];', start);
  if (end < start) throw new Error('Pinned S2 question object list is incomplete');
  const list = code.slice(start, end);
  const objectPattern = /\{id:"((?:\\.|[^"\\])*)",group:"((?:\\.|[^"\\])*)",agreeValue:"((?:\\.|[^"\\])*)",prompt:"((?:\\.|[^"\\])*)",allowedAnswers:ie\}/g;
  const records = [...list.matchAll(objectPattern)].map(match => ({
    id: decodeClientString(match[1]),
    group: decodeClientString(match[2]),
    agreeValue: decodeClientString(match[3]),
    prompt: decodeClientString(match[4]),
    optionValues: ['O', 'X'],
  }));
  if (records.length !== expectedCount || new Set(records.map(row => row.id)).size !== expectedCount) {
    throw new Error('Pinned S2 question object count or IDs are incomplete');
  }

  const draftQuestions = pack?.seasons?.[2];
  const metadataQuestions = index?.questions?.filter(row => row?.season === 2);
  if (!Array.isArray(draftQuestions) || draftQuestions.length !== expectedCount ||
      !Array.isArray(metadataQuestions) || metadataQuestions.length !== expectedCount) {
    throw new Error('S2 draft or source metadata count differs from pinned client');
  }
  const draftById = new Map(draftQuestions.map(row => [row?.id, row]));
  const metadataById = new Map(metadataQuestions.map(row => [row?.sourceQuestionId, row]));
  if (draftById.size !== expectedCount || metadataById.size !== expectedCount) {
    throw new Error('S2 draft or metadata contains duplicate IDs');
  }
  const failures = [];
  for (const record of records) {
    const draft = draftById.get(record.id);
    const meta = metadataById.get(record.id);
    if (!draft || !meta || draft.season !== 2 || draft.sourceKo !== record.prompt ||
        draft.groupKo !== record.group || meta.sourceGroup !== record.group ||
        meta.agreeSideInPublicClient !== record.agreeValue ||
        JSON.stringify(meta.optionValues) !== JSON.stringify(record.optionValues) ||
        JSON.stringify(draft.options?.map(option => option.value)) !== JSON.stringify(record.optionValues)) {
      failures.push(record.id);
    }
  }
  if (failures.length) {
    throw new Error('Pinned S2 ID-to-text/group/option binding mismatch for source IDs: ' +
      failures.join(', '));
  }
  return Object.freeze({
    season2DirectIdTextGroupAndOptionBindings: records.length,
    season2BindingMetadataSha256: createHash('sha256')
      .update(JSON.stringify(records.map(row => [row.id, row.group, row.agreeValue, row.optionValues])))
      .digest('hex'),
  });
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  if (process.argv.length !== 4 || process.argv[2] !== '--client-file') {
    console.error('Usage: node scripts/audit-pinned-question-text.mjs --client-file /path/to/pinned-public-client.js');
    process.exitCode = 2;
  } else {
    console.log(JSON.stringify(
      auditPinnedKoreanQuestionText(readFileSync(process.argv[3]), loadFullQuestionnaire()),
      null, 2,
    ));
  }
}
