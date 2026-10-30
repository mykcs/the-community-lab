import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { extractDraftPack, buildFullQuestionnaire } from '../lib/full-questionnaire.mjs';
import { loadFullQuestionnaire } from '../scripts/load-full-questionnaire.mjs';
import { verifyKoreanSourceSnapshot, KOREAN_SOURCE_SNAPSHOT } from '../scripts/verify-korean-source-snapshot.mjs';

const draft = extractDraftPack(readFileSync(
  new URL('../docs/translation-review/index.html', import.meta.url), 'utf8'));
const index = JSON.parse(readFileSync(
  new URL('../data/original-question-index.json', import.meta.url), 'utf8'));

test('build-time snapshot pins 124 Korean question statements and 550 Korean choice captions', () => {
  const pack = loadFullQuestionnaire();
  assert.equal(pack.sourceSha256, KOREAN_SOURCE_SNAPSHOT.sourceAssetSha256);
  assert.equal(verifyKoreanSourceSnapshot(pack), true);
});

test('nonempty Korean source or Korean option drift is rejected despite unchanged client asset hash', () => {
  for (const change of [
    q => { q.source_text_ko += ' 변조'; },
    q => { q.options[0].ko += ' 변조'; },
  ]) {
    const copy = structuredClone(draft);
    change(copy.questions[0]);
    const structurallyValid = buildFullQuestionnaire(copy, index);
    assert.throws(() => verifyKoreanSourceSnapshot(structurallyValid), /韩文来源快照/);
  }
});

test('Chinese AI draft revisions remain possible without changing Korean source fingerprint', () => {
  const copy = structuredClone(draft);
  copy.questions[0].translation_zh_cn += '（待双语审校的草稿修订）';
  copy.questions[0].options[0].zh_cn += '（草稿）';
  assert.equal(verifyKoreanSourceSnapshot(buildFullQuestionnaire(copy, index)), true);
});
