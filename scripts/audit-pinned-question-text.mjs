/**
 * Offline, exact-text membership audit for the already-public Korean question
 * draft against a byte-for-byte pinned public client artifact.
 *
 * This validates S1's indexed group/array-position-to-prompt/reverse-flag
 * bindings and S2's direct ID-to-prompt/group/option bindings against the
 * pinned client. It does NOT validate permission, translation quality,
 * branching, or official scoring. Never log question prose or participant
 * answers. No network request is made here.
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
  const s1Binding = verifyPinnedSeason1QuestionBindings(source, pack, index, expected.counts[1]);
  const s2Binding = verifyPinnedSeason2QuestionBindings(source, pack, index, expected.counts[2]);
  return Object.freeze({
    status: 'PINNED_SOURCE_TEXT_AND_SEASON_ID_BINDINGS_NOT_OFFICIAL_EQUIVALENCE',
    sourceAssetSha256: digest,
    season1UniqueExactTextMatches: expected.counts[1],
    season2UniqueExactTextMatches: expected.counts[2],
    totalUniqueExactTextMatches: rows.length,
    ...s1Binding,
    ...s2Binding,
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

function findArrayEnd(source, start) {
  let depth = 0;
  let quote = null;
  let escaped = false;
  for (let index = start; index < source.length; index += 1) {
    const char = source[index];
    if (quote) {
      if (escaped) escaped = false;
      else if (char === '\\') escaped = true;
      else if (char === quote) quote = null;
    } else if (char === '"' || char === "'") quote = char;
    else if (char === '[') depth += 1;
    else if (char === ']') {
      depth -= 1;
      if (depth === 0) return index + 1;
    }
  }
  throw new Error('Pinned S1 question array is incomplete');
}

/**
 * Bind each local S1 index ID, through its group and source-array position,
 * to the adjacent prompt and reverse flag in the pinned client. The official
 * S1 object list does not expose the local IDs directly; Korean prose remains
 * in memory only and is never returned.
 */
export function verifyPinnedSeason1QuestionBindings(code, pack, index, expectedCount = 87) {
  if (typeof code !== 'string') throw new TypeError('Expected decoded pinned client source');
  const groups = index?.groups?.filter(row => row?.season === 1);
  const metadataQuestions = index?.questions?.filter(row => row?.season === 1);
  const draftQuestions = pack?.seasons?.[1];
  if (!Array.isArray(groups) || !Array.isArray(metadataQuestions) ||
      !Array.isArray(draftQuestions) || metadataQuestions.length !== expectedCount ||
      draftQuestions.length !== expectedCount || groups.reduce((sum, row) => sum + row.count, 0) !== expectedCount) {
    throw new Error('S1 draft or source metadata count differs from pinned client');
  }
  const expectedByHash = new Map(groups.map(group => [group.sourceArraySha256, group]));
  if (expectedByHash.size !== groups.length) throw new Error('S1 source group fingerprints are not unique');
  const matches = new Map();
  for (const marker of code.matchAll(/(?<![\w$])([A-Za-z_$][\w$]*)=\[\[/g)) {
    const start = marker.index + marker[0].length - 2;
    let value;
    try {
      value = JSON.parse(code.slice(start, findArrayEnd(code, start)));
    } catch {
      continue;
    }
    const digest = createHash('sha256').update(JSON.stringify(value)).digest('hex');
    if (expectedByHash.has(digest)) {
      const previous = matches.get(digest) || [];
      previous.push(value);
      matches.set(digest, previous);
    }
  }
  const draftById = new Map(draftQuestions.map(row => [row?.id, row]));
  if (draftById.size !== expectedCount) throw new Error('S1 draft contains duplicate IDs');
  const failures = [];
  for (const group of groups) {
    const arrays = matches.get(group.sourceArraySha256) || [];
    if (arrays.length !== 1 || !Array.isArray(arrays[0]) || arrays[0].length !== group.count) {
      failures.push(...metadataQuestions.filter(row => row.sourceGroup === group.sourceGroup)
        .map(row => row.sourceQuestionId));
      continue;
    }
    const questions = metadataQuestions.filter(row => row.sourceGroup === group.sourceGroup)
      .sort((a, b) => a.sourceArrayPosition - b.sourceArrayPosition);
    if (questions.length !== group.count ||
        new Set(questions.map(row => row.sourceArrayPosition)).size !== group.count) {
      failures.push(...questions.map(row => row.sourceQuestionId));
      continue;
    }
    for (let position = 0; position < questions.length; position += 1) {
      const meta = questions[position];
      const [prompt, reverse] = arrays[0][position] || [];
      const draft = draftById.get(meta.sourceQuestionId);
      if (!Array.isArray(arrays[0][position]) || arrays[0][position].length !== 2 ||
          typeof prompt !== 'string' || ![0, 1].includes(reverse) || !draft ||
          draft.season !== 1 || draft.sourceKo !== prompt ||
          meta.reverseFlagInPublicClient !== (reverse === 1)) failures.push(meta.sourceQuestionId);
    }
  }
  if (failures.length) {
    throw new Error('Pinned S1 indexed ID-to-text/reverse binding mismatch for source IDs: ' +
      [...new Set(failures)].join(', '));
  }
  return Object.freeze({
    season1IndexIdToTextAndReverseBindings: metadataQuestions.length,
    season1SourceGroupArraysSha256: createHash('sha256')
      .update(JSON.stringify(groups.map(group => [group.sourceGroup, group.count, group.sourceArraySha256])))
      .digest('hex'),
  });
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
