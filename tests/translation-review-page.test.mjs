import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const html = await readFile(new URL('../docs/translation-review/index.html', import.meta.url), 'utf8');
const embedded = html.match(/<script id="embedded-data" type="application\/json">([\s\S]*?)<\/script>/);
assert.ok(embedded, 'the page must contain its self-contained translation dataset');
const data = JSON.parse(embedded[1]);

test('published page is only an explicitly unreviewed draft', () => {
  assert.equal(data.status, 'PUBLIC_TRANSLATION_REVIEW_DRAFT_NOT_OFFICIAL');
  assert.equal(data.questions.length, 124);
  assert.equal(data.counts.total, 124);
  assert.equal(data.counts.season_1, 87);
  assert.equal(data.counts.season_2, 37);
  assert.equal(data.translation_review.independent_korean_chinese_human_review, 'NOT_DONE');
  assert.equal(data.translation_review.official_translation, 'NOT_CLAIMED');
  assert.equal(data.translation_review.publishable, false);
  assert.equal(data.translation_progress.independent_bilingual_review, 'NOT_DONE');
  assert.match(html, /公开复核草稿/);
  assert.match(html, /非官方/);
  assert.match(html, /不是可用于答题的正式译文或测试/);
  assert.match(html, /许可原件因隐私未公开/);
});

test('all source questions remain drafts and have Korean and Chinese text', () => {
  const ids = new Set();
  const perSeason = { 1: 0, 2: 0 };
  let optionCount = 0;
  for (const question of data.questions) {
    assert.ok(question.id && !ids.has(question.id), `question id must be unique: ${question.id}`);
    ids.add(question.id);
    perSeason[question.season]++;
    assert.equal(question.translation_status, 'AI_DRAFT_UNREVIEWED', question.id);
    assert.equal(question.review_status, 'draft', question.id);
    assert.ok(question.source_text_ko.trim(), `${question.id} Korean source is present`);
    assert.ok(question.translation_zh_cn.trim(), `${question.id} Chinese draft is present`);
    assert.match(question.source_url, /^https:\/\/thecommunity\.co\.kr\/season\/[12]\/test$/);
    assert.ok(question.options.length > 0, `${question.id} has source options`);
    optionCount += question.options.length;
    for (const option of question.options) {
      assert.ok(option.ko?.trim(), `${question.id} Korean option is present`);
      assert.ok(option.zh_cn?.trim(), `${question.id} Chinese option draft is present`);
    }
  }
  assert.deepEqual(perSeason, { 1: 87, 2: 37 });
  assert.equal(optionCount, 550);
});

test('a pass status requires a review note and remains self-reported', () => {
  assert.match(html, /if\(status\.value==='pass'&&!note\.value\.trim\(\)\)/);
  assert.match(html, /note\.reportValidity\(\)/);
  assert.match(html, /status\.value='pending'/);
  assert.match(html, /if\(status\.value==='pass'&&!note\.value\.trim\(\)\)\{status\.value='pending'/);
  assert.match(html, /此自述只作本地留痕，不证明审校者身份或能力/);
});

test('page keeps review edits in browser storage without network or HTML injection APIs', () => {
  assert.doesNotMatch(html, /<script\b[^>]*\bsrc\s*=|<link\b[^>]*\b(?:href|rel)\s*=/i);
  assert.match(html, /localStorage\.setItem/);
  assert.match(html, /localStorage\.getItem/);
  assert.match(html, /localStorage\.removeItem/);
  assert.match(html, /不会上传审校内容/);
  assert.doesNotMatch(html, /\bfetch\s*\(|\bXMLHttpRequest\b|\bWebSocket\b|\bsendBeacon\s*\(|\.innerHTML\s*=/);
});
