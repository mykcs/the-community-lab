/**
 * Offline, exact-text membership audit for the already-public Korean question
 * draft against a byte-for-byte pinned public client artifact.
 *
 * This does NOT validate question-to-ID binding, option values, permission,
 * translation quality, branching, or official scoring. Never log question
 * prose or participant answers. No network request is made here.
 */
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { loadFullQuestionnaire } from './load-full-questionnaire.mjs';
import { KOREAN_SOURCE_SNAPSHOT } from './verify-korean-source-snapshot.mjs';

const PINNED_CLIENT = Object.freeze({
  sha256: KOREAN_SOURCE_SNAPSHOT.sourceAssetSha256,
  bytes: 331_501,
  counts: { 1: 87, 2: 37 },
});

export function auditPinnedKoreanQuestionText(bytes, pack, expected = PINNED_CLIENT) {
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
  return Object.freeze({
    status: 'PINNED_KOREAN_TEXT_MEMBERSHIP_ONLY_NOT_OFFICIAL_EQUIVALENCE',
    sourceAssetSha256: digest,
    season1UniqueExactTextMatches: expected.counts[1],
    season2UniqueExactTextMatches: expected.counts[2],
    totalUniqueExactTextMatches: rows.length,
    permissionsHumanReviewSourceIdMappingAndScoring: 'NOT_VALIDATED_BY_THIS_AUDIT',
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
