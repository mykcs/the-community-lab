import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { extractDraftPack, buildFullQuestionnaire } from '../lib/full-questionnaire.mjs';
import { loadFullQuestionnaire } from '../scripts/load-full-questionnaire.mjs';
import { verifyKoreanSourceSnapshot, verifyLiveKoreanClientSnapshot, KOREAN_SOURCE_SNAPSHOT } from '../scripts/verify-korean-source-snapshot.mjs';

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
  // Repeated scale captions are a single translation unit: revise the
  // matching Korean response label in ALL same-season six-choice questions.
  const example = copy.questions[0];
  for (const q of copy.questions.filter(q => q.season === example.season &&
       q.options.length === example.options.length)) {
    const option = q.options.find(o => o.ko === example.options[0].ko);
    if (option) option.zh_cn += '（草稿）';
  }
  assert.equal(verifyKoreanSourceSnapshot(buildFullQuestionnaire(copy, index)), true);
});

test('opt-in live source probe checks BOTH public season entries and one JS fingerprint without answers', async () => {
  // Tiny synthetic bytes rather than copying the copyright-uncleared 331 KB
  // client into the repository. The CLI still uses the pinned real hash.
  const js = Buffer.from('public synthetic static client only');
  const expected = { bytes: js.length, sha256: createHash('sha256').update(js).digest('hex') };
  const asset = '/assets/index-TEST123.js';
  const html = `<!doctype html><script type="module" crossorigin src="${asset}"></script>`;
  const calls = [];
  const fakeFetch = async url => {
    calls.push(url);
    const script = url.endsWith('.js');
    return {
      ok: true, url,
      headers: new Headers({ 'content-type': script ? 'application/javascript' : 'text/html; charset=utf-8' }),
      text: async () => html,
      arrayBuffer: async () => js,
    };
  };
  const report = await verifyLiveKoreanClientSnapshot(fakeFetch, expected);
  assert.deepEqual(report, {
    status: 'MATCHED_PINNED_PUBLIC_CLIENT',
    observedSeasonEntryCount: 2,
    sourceAssetBytes: js.length,
    sourceAssetSha256: expected.sha256,
  });
  assert.deepEqual(calls, [
    'https://thecommunity.co.kr/season/1/test',
    'https://thecommunity.co.kr/season/2/test',
    'https://thecommunity.co.kr/assets/index-TEST123.js',
  ]);

  const replacedJs = async url => {
    const response = await fakeFetch(url);
    if (url.endsWith('.js')) response.arrayBuffer = async () => Buffer.from('modified client');
    return response;
  };
  await assert.rejects(verifyLiveKoreanClientSnapshot(replacedJs, expected), /冻结来源不同/);

  const splitSeasons = async url => {
    const response = await fakeFetch(url);
    if (url.endsWith('/season/1/test')) response.text = async () =>
      html.replace('index-TEST123.js', 'index-OTHER999.js');
    return response;
  };
  await assert.rejects(verifyLiveKoreanClientSnapshot(splitSeasons, expected), /不同客户端资源/);

  const htmlFallback = async url => {
    const response = await fakeFetch(url);
    if (url.endsWith('.js')) response.headers = new Headers({ 'content-type': 'text/html' });
    return response;
  };
  await assert.rejects(verifyLiveKoreanClientSnapshot(htmlFallback, expected), /JS 资源不可读/);

  const redirectElsewhere = async url => {
    const response = await fakeFetch(url);
    if (url.endsWith('/season/2/test')) response.url = 'https://example.org/season/2/test';
    return response;
  };
  await assert.rejects(verifyLiveKoreanClientSnapshot(redirectElsewhere, expected), /入口无法按预期读取/);
});
