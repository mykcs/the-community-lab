import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createHash } from 'node:crypto';
import { extractDraftPack, buildFullQuestionnaire } from '../lib/full-questionnaire.mjs';
import { verifyKoreanSourceSnapshot, verifySourceMetadataSnapshot } from './verify-korean-source-snapshot.mjs';

// SHA-256 of the exact Chinese wording shown to a respondent, including each
// option's stable source value. Built into the static pack; no browser hashing,
// server call, or answer upload is needed for safe local progress restoration.
export function attachTranslationFingerprints(pack) {
  for (const q of [...pack.seasons[1], ...pack.seasons[2]]) {
    q.translationFingerprint = createHash('sha256')
      .update(JSON.stringify([q.draftZh, q.options.map(o => [o.value, o.zh])]))
      .digest('hex');
  }
  return pack;
}

/** Build-time only: the 124 drafts have one writable source, the review page. */
export function loadFullQuestionnaire() {
  // Astro bundles server modules into dist/.prerender, so import.meta.url is
  // not the source location during static generation. npm/Actions run at repo root.
  const html = readFileSync(resolve('docs/translation-review/index.html'), 'utf8');
  const index = JSON.parse(readFileSync(resolve('data/original-question-index.json'), 'utf8'));
  verifySourceMetadataSnapshot(index);
  const pack = buildFullQuestionnaire(extractDraftPack(html), index);
  verifyKoreanSourceSnapshot(pack);
  return attachTranslationFingerprints(pack);
}
