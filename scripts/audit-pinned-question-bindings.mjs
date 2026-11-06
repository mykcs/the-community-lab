/**
 * Offline, byte-pinned audit of the *question-to-source-ID/answer-option*
 * binding in the public client. Unlike string membership alone, this checks
 * the original array position, original Korean prompt, reverse flag (S1),
 * group and agree side (S2), and source option values.
 *
 * No client bundle, question prose or response is committed or logged.
 * IMPORTANT: S1 source IDs are derived by the client's Cu() factory; S2 IDs
 * are explicit. This does NOT prove real-DOM behavior, scoring or permission.
 */
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { loadFullQuestionnaire } from './load-full-questionnaire.mjs';
import { KOREAN_SOURCE_SNAPSHOT } from './verify-korean-source-snapshot.mjs';

const GROUPS = Object.freeze([
  ['politics', 'a1', 6],
  ['gender', 'n1', 6],
  ['openness', 'l1', 6],
  ['class', 'i1', 4],
]);
const EXPECTED = Object.freeze({
  sha256: KOREAN_SOURCE_SNAPSHOT.sourceAssetSha256,
  bytes: 331_501,
  s1Counts: [21, 21, 22, 23],
  s2Count: 37,
});

// Read one JS array literal without evaluating executable third-party code.
// JSON.parse is safe here because the observed source arrays are JSON syntax.
function readArray(source, marker) {
  const start = source.indexOf(marker);
  if (start < 0 || source.indexOf(marker, start + marker.length) !== -1) {
    throw new Error('Pinned client array marker absent or ambiguous');
  }
  const at = start + marker.length;
  if (source[at] !== '[') throw new Error('Pinned client array shape changed');
  let depth = 0, quoted = false, escaped = false;
  for (let i = at; i < source.length; i++) {
    const ch = source[i];
    if (quoted) {
      if (escaped) escaped = false;
      else if (ch === '\\') escaped = true;
      else if (ch === '"') quoted = false;
    } else {
      if (ch === '"') quoted = true;
      else if (ch === '[') depth++;
      else if (ch === ']' && --depth === 0) return source.slice(at, i + 1);
    }
  }
  throw new Error('Unterminated pinned client array');
}

function assertSame(actual, expected, label) {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error('Pinned source binding mismatch: ' + label);
  }
}

const FACTORY = 'function Cu(l,r,s){return r.map(([c,f],m)=>({id:`s1-${l}-${String(m+1).padStart(2,"0")}`,group:l,prompt:c,reverse:!!f,scale:s,allowedAnswers:Array.from({length:s},(p,S)=>S+1)}))}';
const S1_COMPOSITION = 'const ks=[...Cu("politics",a1,6),...Cu("gender",n1,6),...Cu("openness",l1,6),...Cu("class",i1,4)];';
const S2_MARKER = 'const ie=["O","X"],$s=';
const S2_ENTRY = /\{id:("(?:\\.|[^"\\])*"),group:("(?:\\.|[^"\\])*"),agreeValue:("(?:\\.|[^"\\])*"),prompt:("(?:\\.|[^"\\])*"),allowedAnswers:ie\}/g;

export function auditPinnedQuestionBindings(bytes, pack, index, expected = EXPECTED) {
  if (!Buffer.isBuffer(bytes)) throw new TypeError('Expected raw client bytes');
  const sha256 = createHash('sha256').update(bytes).digest('hex');
  if (bytes.length !== expected.bytes || sha256 !== expected.sha256 ||
      pack?.sourceSha256 !== sha256 || index?.sourceAssetSha256 !== sha256) {
    throw new Error('Pinned client/source provenance mismatch');
  }
  const source = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  if (!source.includes(FACTORY) || !source.includes(S1_COMPOSITION)) {
    throw new Error('Pinned client S1 source-ID/value factory has changed');
  }

  const questions = [...(pack.seasons?.[1] || []), ...(pack.seasons?.[2] || [])];
  const rows = index?.questions;
  if (!Array.isArray(rows) || questions.length !== rows.length ||
      new Set(questions.map(q => q.id)).size !== questions.length ||
      new Set(rows.map(q => q.sourceQuestionId)).size !== rows.length) {
    throw new Error('Source question pack/index coverage mismatch');
  }
  const byId = new Map(questions.map(q => [q.id, q]));
  const indexed = new Map(rows.map(q => [q.sourceQuestionId, q]));
  let s1Count = 0, optionCount = 0;
  for (const [gi, [group, varName, scale]] of GROUPS.entries()) {
    const marker = gi === 0 ? 'const a1=' : ',' + varName + '=';
    const sourceRows = JSON.parse(readArray(source, marker));
    if (sourceRows.length !== expected.s1Counts[gi]) {
      throw new Error('Pinned client S1 group length changed');
    }
    for (const [position, entry] of sourceRows.entries()) {
      if (!Array.isArray(entry) || entry.length !== 2 ||
          typeof entry[0] !== 'string' || !entry[0].trim() ||
          ![0, 1].includes(entry[1])) {
        throw new Error('Pinned client S1 entry format changed');
      }
      const id = `s1-${group}-${String(position + 1).padStart(2, '0')}`;
      const draft = byId.get(id), meta = indexed.get(id);
      if (!draft || !meta || meta.season !== 1 || draft.season !== 1 ||
          meta.sourceGroup !== group ||
          meta.sourceArrayPosition !== expected.s1Counts.slice(0, gi).reduce((a, b) => a + b, 0) + position + 1) {
        throw new Error('Pinned S1 derived source ID/group/position mismatch');
      }
      assertSame(draft.sourceKo, entry[0], 'S1 text/source ID');
      assertSame(meta.reverseFlagInPublicClient, !!entry[1], 'S1 reverse flag');
      assertSame(meta.optionValues, Array.from({ length: scale }, (_, i) => i + 1), 'S1 option values');
      assertSame(draft.options.map(o => o.value), meta.optionValues, 'S1 draft option values');
      optionCount += scale;
      s1Count++;
    }
  }
  // S2 uses literal source IDs and per-question group/agree side in the bundle.
  // Never execute the minified JS; parse only the four quoted fields and the
  // expected shared O/X option-list binding.
  const s2Body = readArray(source, S2_MARKER).slice(1, -1);
  const matches = [...s2Body.matchAll(S2_ENTRY)];
  const remainder = s2Body.replace(S2_ENTRY, '').replace(/[,\s]/g, '');
  if (matches.length !== expected.s2Count || remainder !== '') {
    throw new Error('Pinned client S2 entry format/coverage changed');
  }
  for (const [position, match] of matches.entries()) {
    const [id, group, side, prompt] = match.slice(1).map(JSON.parse);
    const draft = byId.get(id), meta = indexed.get(id);
    if (!draft || !meta || meta.season !== 2 || draft.season !== 2 ||
        meta.sourceArrayPosition !== position + 1) {
      throw new Error('Pinned S2 literal source ID/position mismatch');
    }
    assertSame(meta.sourceGroup, group, 'S2 group');
    assertSame(meta.agreeSideInPublicClient, side, 'S2 agree side');
    assertSame(draft.sourceKo, prompt, 'S2 text/source ID');
    assertSame(meta.optionValues, ['O', 'X'], 'S2 raw answer values');
    assertSame(draft.options.map(o => o.value), ['O', 'X'], 'S2 draft option values');
    optionCount += 2;
  }
  if (s1Count + matches.length !== questions.length ||
      optionCount !== questions.reduce((n, q) => n + q.options.length, 0)) {
    throw new Error('Pinned client question/option coverage incomplete');
  }
  return Object.freeze({
    status: 'PINNED_STATIC_SOURCE_BINDINGS_ONLY',
    sourceAssetSha256: sha256,
    season1DerivedSourceIdsReverseFlagsAndOptionValues: s1Count,
    season2LiteralSourceIdsGroupsAgreeSidesAndOptionValues: matches.length,
    sourceOptionsCovered: optionCount,
    claimsNotProven: 'LIVE_DOM_PATHS_SCORING_PERMISSIONS_TRANSLATION_HUMAN_REVIEW',
  });
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  if (process.argv.length !== 4 || process.argv[2] !== '--client-file') {
    console.error('Usage: node scripts/audit-pinned-question-bindings.mjs --client-file /path/to/pinned.js');
    process.exitCode = 2;
  } else {
    try {
      const index = JSON.parse(readFileSync('data/original-question-index.json', 'utf8'));
      console.log(JSON.stringify(auditPinnedQuestionBindings(
        readFileSync(process.argv[3]), loadFullQuestionnaire(), index,
      ), null, 2));
    } catch {
      // Avoid echoing third-party question prose, paths or participant data.
      console.error('Pinned source question-binding audit failed');
      process.exitCode = 1;
    }
  }
}
