import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createHash } from 'node:crypto';
import { extractDraftPack, buildFullQuestionnaire } from '../lib/full-questionnaire.mjs';
import { displayedOptionCopy } from '../lib/option-display.mjs';
import { verifyKoreanSourceSnapshot, verifySourceMetadataSnapshot } from './verify-korean-source-snapshot.mjs';

// SHA-256 of the Chinese wording actually shown to a respondent, including
// each option's stable source value, on-screen guidance, and S2 AI-draft
// group heading. This must use the same presentation helper as the browser.
// Existing S2 receipts must be reconfirmed after this stricter fingerprint
// because earlier hashes cannot establish the historical group heading.
// Built into the static pack; no browser hashing or answer upload is needed.
export function attachTranslationFingerprints(pack) {
  for (const q of [...pack.seasons[1], ...pack.seasons[2]]) {
    q.translationFingerprint = createHash('sha256')
      .update(JSON.stringify([q.draftZh, q.options.map(o => {
        const display = displayedOptionCopy(q, o);
        // Keep the old canonical shape for unaffected options, preventing
        // unrelated S1/S2 local answers from being invalidated.
        return [o.value, display.zh, ...(display.hint ? [display.hint] : [])];
      }),
        ...(q.readerNote ? [q.readerNote] : []),
        ...(q.season === 2 ? [q.group] : [])]))
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
