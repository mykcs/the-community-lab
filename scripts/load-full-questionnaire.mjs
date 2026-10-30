import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { extractDraftPack, buildFullQuestionnaire } from '../lib/full-questionnaire.mjs';
import { verifyKoreanSourceSnapshot, verifySourceMetadataSnapshot } from './verify-korean-source-snapshot.mjs';

/** Build-time only: the 124 drafts have one writable source, the review page. */
export function loadFullQuestionnaire() {
  // Astro bundles server modules into dist/.prerender, so import.meta.url is
  // not the source location during static generation. npm/Actions run at repo root.
  const html = readFileSync(resolve('docs/translation-review/index.html'), 'utf8');
  const index = JSON.parse(readFileSync(resolve('data/original-question-index.json'), 'utf8'));
  verifySourceMetadataSnapshot(index);
  const pack = buildFullQuestionnaire(extractDraftPack(html), index);
  verifyKoreanSourceSnapshot(pack);
  return pack;
}
