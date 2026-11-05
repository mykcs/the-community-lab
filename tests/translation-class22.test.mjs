import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { extractDraftPack } from '../lib/full-questionnaire.mjs';
import { loadFullQuestionnaire, attachTranslationFingerprints } from '../scripts/load-full-questionnaire.mjs';

const pages = [
  new URL('../docs/translation-review/index.html', import.meta.url),
  new URL('../docs/original-question-translation-review/index.html', import.meta.url),
];

test('S1 class-22 distinguishes extensive study-abroad experience from repeated trips in both AI review drafts', () => {
  const [first, second] = pages.map(url => extractDraftPack(readFileSync(url, 'utf8')));
  const id = 's1-class-22';
  const source = '성인이 되기 이전에 해외유학 경험이 많은 편이다';
  const intended = '成年前，我的海外留学经历比较丰富。';
  const old = '成年前我有过多次出国留学经历。';

  for (const draft of [first, second]) {
    const q = draft.questions.find(item => item.id === id);
    assert.equal(q.source_text_ko, source);
    assert.equal(q.translation_zh_cn, intended);
    assert.equal(q.translation_version, 'draft-0.1.2');
    assert.match(q.translator_note, /多次出国留学/);
    assert.match(q.translator_note, /待独立韩中人工复核/);
    assert.equal(q.review_status, 'draft');
    assert.equal(q.translation_status, 'AI_DRAFT_UNREVIEWED');
    assert.equal(q.scoring_version, 'UNKNOWN');
  }

  const pack = loadFullQuestionnaire();
  const q = pack.seasons[1].find(item => item.id === id);
  assert.equal(q.draftZh, intended);
  assert.equal(q.translationVersion, 'draft-0.1.2');
  assert.equal(pack.seasons[1].length, 87);
  assert.equal(pack.seasons[2].length, 37);
  const previous = structuredClone(pack);
  previous.seasons[1].find(item => item.id === id).draftZh = old;
  attachTranslationFingerprints(previous);
  assert.notEqual(previous.seasons[1].find(item => item.id === id).translationFingerprint, q.translationFingerprint);
  assert.equal(previous.seasons[1][0].translationFingerprint, pack.seasons[1][0].translationFingerprint);
  assert.equal(previous.seasons[2][0].translationFingerprint, pack.seasons[2][0].translationFingerprint);
});
