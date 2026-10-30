import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const html = await readFile(new URL('../docs/translation-review/index.html', import.meta.url), 'utf8');
const embedded = html.match(/<script id="embedded-data" type="application\/json">([\s\S]*?)<\/script>/);
assert.ok(embedded, 'the page must contain its self-contained translation dataset');
const data = JSON.parse(embedded[1]);

const standaloneHtml = await readFile(new URL('../docs/original-question-translation-review/index.html', import.meta.url), 'utf8');
const standaloneEmbedded = standaloneHtml.match(/<script id="embedded-data" type="application\/json">([\s\S]*?)<\/script>/);
assert.ok(standaloneEmbedded, 'the standalone page must contain its self-contained translation dataset');
const standaloneData = JSON.parse(standaloneEmbedded[1]);

test('standalone original-question page is published only as an unreviewed draft', () => {
  assert.equal(standaloneData.status, 'PUBLIC_TRANSLATION_REVIEW_DRAFT_NOT_OFFICIAL');
  assert.equal(standaloneData.questions.length, 124);
  assert.equal(standaloneData.counts.season_1, 87);
  assert.equal(standaloneData.counts.season_2, 37);
  assert.equal(standaloneData.translation_review.independent_korean_chinese_human_review, 'NOT_DONE');
  assert.equal(standaloneData.translation_review.publishable, false);
  assert.match(standaloneHtml, /草稿，禁止作为正式译文发布/);
  assert.match(standaloneHtml, /授权原件因隐私未分享，本站未能独立核验/);
  assert.match(standaloneHtml, /审校者自报通过（待核验）/);
  assert.doesNotMatch(standaloneHtml, /独立人工复核通过/);
  assert.match(standaloneHtml, /项目核对来源版本、双语能力依据与独立性后才会计入正式复核/);
  assert.match(standaloneHtml, /github\.com\/mykcs\/the-community-lab\/issues\/new/);
  assert.match(standaloneHtml, /<link rel="icon" type="image\/svg\+xml" href="data:image\/svg\+xml,/);
  assert.doesNotMatch(standaloneHtml, /<script\b[^>]*\bsrc\s*=|<link\b[^>]*\bhref\s*=\s*"https?:/i);
  assert.doesNotMatch(standaloneHtml, /LOCAL_RESEARCH_CANDIDATE_NOT_FOR_PUBLICATION/);
});

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

test('identical Korean answer labels keep a consistent Chinese draft', () => {
  const translations = new Map();
  for (const question of data.questions) {
    for (const option of question.options) {
      const source = option.ko.normalize('NFC').trim();
      const translation = option.zh_cn.normalize('NFC').trim();
      const existing = translations.get(source);
      assert.ok(
        existing === undefined || existing === translation,
        `the same Korean answer label has conflicting Chinese drafts: ${source}`
      );
      translations.set(source, translation);
    }
  }
  assert.ok(translations.size > 0);
  assert.equal(data.translation_review.independent_korean_chinese_human_review, 'NOT_DONE');
  assert.equal(data.translation_review.publishable, false);
});

test('second-season AI wording revisions preserve degree, referent, and priority', () => {
  const expected = new Map([
    ['rp08', '自动驾驶汽车若面临撞上多名行人的局面，应以挽救多数人为方向进行设计，即使这意味着牺牲驾驶者。'],
    ['rp10', '如果指认一名无辜者为责任人并对其施以惩罚，就能平息暴徒的愤怒、保障市民安全，那么可以牺牲这一个人。'],
    ['ms05', '如果对方是我非常讨厌的那类人，即使对我的工作成果很有帮助，我也不会在私下与其建立亲密关系。'],
    ['ms11', '选择职业时，是否适合自己、是否有成就感应当是首要考虑，比工资到账的数额更重要。'],
  ]);
  for (const [id, translation] of expected) {
    const question = data.questions.find(item => item.id === id);
    assert.ok(question, `${id} must remain in the source dataset`);
    assert.equal(question.translation_zh_cn, translation, id);
    assert.equal(question.translation_version, 'draft-0.1.1', id);
    assert.equal(question.review_status, 'draft', id);
    assert.equal(question.translation_status, 'AI_DRAFT_UNREVIEWED', id);
  }
  assert.match(data.translation_review.editorial_pass, /rp08、rp10、ms05、ms11/);
  assert.equal(data.translation_review.independent_korean_chinese_human_review, 'NOT_DONE');
  assert.equal(data.translation_review.publishable, false);
});

test('rp03 preserves the source item’s absolute priority and both review pages stay in sync', () => {
  const question = data.questions.find(item => item.id === 'rp03');
  assert.ok(question, 'rp03 must remain in the source dataset');
  assert.match(question.source_text_ko, /항상/);
  assert.equal(question.translation_zh_cn, '“不得杀人”这一原则应始终优先于“即使牺牲少数人也要拯救更多生命”这一目标。');
  assert.equal(question.translation_version, 'draft-0.1.2');
  assert.equal(question.translation_status, 'AI_DRAFT_UNREVIEWED');
  assert.equal(question.review_status, 'draft');
  assert.match(data.translation_review.editorial_pass, /rp03.*draft-0\.1\.2/);
  assert.deepEqual(standaloneData.questions, data.questions, 'the published standalone review page must use the canonical draft questions');
  assert.equal(standaloneData.translation_review.independent_korean_chinese_human_review, 'NOT_DONE');
  assert.equal(standaloneData.translation_review.publishable, false);
});

test('s1-politics-14 does not add exclusive force absent from Korean', () => {
  const question = data.questions.find(item => item.id === 's1-politics-14');
  assert.ok(question, 's1-politics-14 must remain in the source dataset');
  assert.match(question.source_text_ko, /대부분 망친다고 봐야 한다/);
  assert.equal(question.translation_zh_cn, '政府一旦干预民营企业，大多会把事情搞砸。');
  assert.equal(question.translation_version, 'draft-0.1.1');
  assert.equal(question.translator_note, '2026-10-30 AI复核：原文「대부분 망친다고」未明确表达“只会”这一排他语气，已删去该词；仍待独立韩中人工复核。');
  assert.equal(question.translation_status, 'AI_DRAFT_UNREVIEWED');
  assert.equal(question.review_status, 'draft');
  assert.match(data.translation_review.editorial_pass, /s1-politics-14/);
  assert.deepEqual(standaloneData.questions, data.questions, 'both published review pages must stay in sync');
  assert.equal(data.translation_review.independent_korean_chinese_human_review, 'NOT_DONE');
  assert.equal(data.translation_review.publishable, false);
});

test('s1-class-15 says private tutoring rather than an after-school class', () => {
  const question = data.questions.find(item => item.id === 's1-class-15');
  assert.ok(question, 's1-class-15 must remain in the source dataset');
  assert.equal(question.source_text_ko, '어린 시절 과외를 받아본 적 있다');
  assert.equal(question.translation_zh_cn, '我小时候接受过私人辅导。');
  assert.equal(question.translation_version, 'draft-0.1.2');
  assert.match(question.translator_note, /韩国国立国语院.*private lesson/);
  assert.equal(question.translation_status, 'AI_DRAFT_UNREVIEWED');
  assert.equal(question.review_status, 'draft');
  assert.match(data.translation_review.editorial_pass, /s1-class-15/);
  assert.deepEqual(standaloneData.questions, data.questions, 'both published review pages must stay in sync');
  assert.equal(data.translation_review.independent_korean_chinese_human_review, 'NOT_DONE');
  assert.equal(data.translation_review.publishable, false);
});

test('ms07 keeps the Korean comparison and teaching priority without implying exclusion', () => {
  const question = data.questions.find(item => item.id === 'ms07');
  assert.ok(question, 'ms07 must remain in the source dataset');
  assert.equal(question.source_text_ko, '내 자식에게는 영리하게 돈 버는 법보다 양심에 따라 사는 법을 먼저 가르치겠다.');
  assert.equal(question.translation_zh_cn, '比起教孩子如何精明地赚钱，我会先教他们如何凭良心生活。');
  assert.equal(question.translation_version, 'draft-0.1.1');
  assert.match(question.translator_note, /比较助词「보다」.*先后副词「먼저」/);
  assert.match(question.translator_note, /korean\.go\.kr/);
  assert.equal(question.translation_status, 'AI_DRAFT_UNREVIEWED');
  assert.equal(question.review_status, 'draft');
  assert.match(data.translation_review.editorial_pass, /ms07/);
  assert.deepEqual(standaloneData.questions, data.questions, 'both published review pages must stay in sync');
  assert.equal(data.translation_review.independent_korean_chinese_human_review, 'NOT_DONE');
  assert.equal(data.translation_review.publishable, false);
});

test('s1-gender-17 translates 믿음 as belief while remaining an unreviewed draft', () => {
  const question = data.questions.find(item => item.id === 's1-gender-17');
  assert.ok(question, 's1-gender-17 must remain in the source dataset');
  assert.match(question.source_text_ko, /근거 없는 믿음이다/);
  assert.equal(question.translation_zh_cn, '性别薪酬差距是一种毫无根据的信念。女性已经因同等劳动获得与男性同等的报酬。');
  assert.equal(question.translation_version, 'draft-0.1.2');
  assert.match(question.translator_note, /믿음.*belief\/conviction/);
  assert.match(question.translator_note, /krdict\.korean\.go\.kr/);
  assert.equal(question.translation_status, 'AI_DRAFT_UNREVIEWED');
  assert.equal(question.review_status, 'draft');
  assert.match(data.translation_review.editorial_pass, /s1-gender-17.*draft-0\.1\.2/);
  assert.deepEqual(standaloneData.questions, data.questions, 'both published review pages must stay in sync');
  assert.equal(data.translation_review.independent_korean_chinese_human_review, 'NOT_DONE');
  assert.equal(data.translation_review.publishable, false);
});

test('a pass status requires a review note and remains self-reported', () => {
  assert.match(html, /if\(status\.value==='pass'&&!note\.value\.trim\(\)\)/);
  assert.match(html, /note\.reportValidity\(\)/);
  assert.match(html, /status\.value='pending'/);
  assert.match(html, /if\(status\.value==='pass'&&!note\.value\.trim\(\)\)\{status\.value='pending'/);
  assert.match(html, /此自述只作本地留痕，不证明审校者身份或能力/);
});

test('editing a reviewed translation or option withdraws its self-reported pass', () => {
  const body = html.match(/function recordTranslationEdit\([^]*?\n\}/)?.[0];
  assert.ok(body, 'the edit/review transition must be explicit and testable');
  const edits = {
    q1: { review: 'pass', note: 'reviewer A · bilingual evidence · 2026-10-30' },
    q2: { review: 'pass', note: 'reviewer B · 2026-10-30' },
    q3: { review: 'revise', note: 'needs changes' },
  };
  let saves = 0;
  const update = new Function('edits', 'save', body + '; return recordTranslationEdit;')(edits, () => saves++);
  const q1Select = { value: 'pass' };
  update('q1', { translation: '修改后的中文' }, q1Select);
  assert.equal(edits.q1.review, 'pending');
  assert.equal(edits.q1.reviewNoteStale, true);
  assert.equal(q1Select.value, 'pending');
  assert.equal(edits.q1.note, 'reviewer A · bilingual evidence · 2026-10-30');
  const q2Select = { value: 'pass' };
  update('q2', { options: ['甲', '乙'] }, q2Select);
  assert.equal(edits.q2.review, 'pending');
  assert.equal(edits.q2.reviewNoteStale, true);
  assert.equal(q2Select.value, 'pending');
  const q3Select = { value: 'revise' };
  update('q3', { translation: '修改' }, q3Select);
  assert.equal(edits.q3.review, 'revise');
  assert.equal(edits.q3.reviewNoteStale, false);
  assert.equal(q3Select.value, 'revise');
  assert.equal(saves, 3);
  assert.match(html, /recordTranslationEdit\(q\.id,\{translation:edit\.value\},status\)/);
  assert.match(html, /recordTranslationEdit\(q\.id,\{options:arr\},status\)/);
  assert.match(html, /再次修改题干译文或选项.*自动退回待复核/);
  assert.match(html, /curr\.reviewNoteStale===true/);
  assert.match(html, /note:note\.value,reviewNoteStale:false/);
});

test('page keeps review edits in browser storage without network or HTML injection APIs', () => {
  const htmlWithoutInlineFavicon = html.replace(
    /<link rel="icon" type="image\/svg\+xml" href="data:image\/svg\+xml,[^"]+">/,
    ''
  );
  assert.doesNotMatch(htmlWithoutInlineFavicon, /<script\b[^>]*\bsrc\s*=|<link\b[^>]*\b(?:href|rel)\s*=/i);
  assert.match(html, /<link rel="icon" type="image\/svg\+xml" href="data:image\/svg\+xml,/);
  assert.match(html, /localStorage\.setItem/);
  assert.match(html, /localStorage\.getItem/);
  assert.match(html, /localStorage\.removeItem/);
  assert.match(html, /不会上传审校内容/);
  assert.doesNotMatch(html, /\bfetch\s*\(|\bXMLHttpRequest\b|\bWebSocket\b|\bsendBeacon\s*\(|\.innerHTML\s*=/);
});

test('exported review JSON can be safely restored without changing source evidence', () => {
  const source = html.match(/function validateReviewImport\([^]*?\n\}/)?.[0];
  assert.ok(source, 'the full source/version guard must be testable');
  const restore = new Function(source + '; return validateReviewImport;')();
  const exported = structuredClone(data);
  const q = exported.questions[0];
  q.translation_zh_cn = '重新编辑的中文草稿';
  q.options[0].zh_cn = '重新编辑的中文选项';
  q.human_review_status = 'pass';
  q.human_review_note = '复核者甲 · 双语能力说明 · 2026-10-30';
  q.human_review_note_stale = false;
  const edits = restore(exported, data);
  assert.equal(Object.keys(edits).length, 1);
  assert.deepEqual(edits[q.id], {
    translation: '重新编辑的中文草稿',
    options: q.options.map(o => o.zh_cn),
    review: 'pass',
    note: q.human_review_note,
    reviewNoteStale: false
  });
  assert.match(html, /localStorage\.setItem\(key,JSON\.stringify\(imported\)\)/);
  assert.match(html, /id="import-file" type="file"/);
  assert.match(html, /human_review_note_stale=e\.reviewNoteStale===true/);
});

test('reject forged, incompatible or incomplete imported evidence without changing edits', () => {
  const source = html.match(/function validateReviewImport\([^]*?\n\}/)?.[0];
  const restore = new Function(source + '; return validateReviewImport;')();
  const invalid = (mutate) => {
    const json = structuredClone(data);
    mutate(json);
    assert.throws(() => restore(json, data));
  };
  invalid(json => { json.source.asset_sha256 = 'fake'; });
  invalid(json => { json.questions[0].source_text_ko = 'fake'; });
  invalid(json => { json.questions[0].options[0].ko = 'fake'; });
  invalid(json => { json.questions[0].rights_status = 'fake'; });
  invalid(json => { json.questions[0].review_status = 'bilingual_reviewed'; });
  invalid(json => { json.questions.reverse(); });
  invalid(json => { json.questions.pop(); });
  invalid(json => { json.questions[0].human_review_status = 'bilingual_reviewed'; });
  invalid(json => { json.questions[0].human_review_status = 'pass'; });
  invalid(json => { json.questions[0].human_review_status = 'pass'; json.questions[0].human_review_note = 'note'; json.questions[0].human_review_note_stale = true; });
  const oldExport = structuredClone(data);
  oldExport.questions[0].translation_zh_cn = '改动后等待复核';
  oldExport.questions[0].human_review_status = 'pending';
  oldExport.questions[0].human_review_note = '之前的备注';
  assert.equal(restore(oldExport,data)[oldExport.questions[0].id].reviewNoteStale,true);
  assert.match(html, /文件超过 1 MiB 上限/);
  assert.match(html, /原有草稿未被覆盖/);
});

test('two independently exported local reviews can be compared without promoting them to human verification', () => {
  const validation = html.match(/function validateReviewImport\([^]*?\n\}/)?.[0];
  const comparison = html.match(/function compareReviewExports\([^]*?\n\}/)?.[0];
  assert.ok(validation && comparison, 'safe import and comparison logic must be explicit');
  const compare = new Function(validation + '\n' + comparison + '; return compareReviewExports;')();
  const left = structuredClone(data), right = structuredClone(data);
  const agreed = left.questions[0], disagreed = left.questions[1], revision = left.questions[2];
  agreed.human_review_status = 'pass';
  agreed.human_review_note = '审校者 A · 双语依据 · 日期';
  right.questions[0].human_review_status = 'pass';
  right.questions[0].human_review_note = '审校者 B · 双语依据 · 日期';
  disagreed.translation_zh_cn = '译文版本甲';
  right.questions[1].translation_zh_cn = '译文版本乙';
  disagreed.options[0].zh_cn = '选项版本甲';
  right.questions[1].options[0].zh_cn = '选项版本乙';
  revision.human_review_status = 'revise';
  revision.human_review_note = '否定词可能遗漏';
  const initialEditor = { [agreed.id]: { translation: '本机未保存到文件的编辑' } };
  const copyOfEditor = structuredClone(initialEditor);
  const report = compare(left, right, data);
  assert.deepEqual(report.counts, { different: 1, revise: 1, bothReportedPass: 1, pending: 121 });
  assert.equal(report.rows[0].status, 'bothReportedPass');
  assert.deepEqual(report.rows[1].differences, ['题干中文', '选项 1']);
  assert.equal(report.rows[1].status, 'different');
  assert.equal(report.rows[2].status, 'revise');
  assert.deepEqual(initialEditor, copyOfEditor, 'comparison never modifies local editing state');
  assert.equal(data.questions[0].human_review_status, undefined);
  assert.match(html, /不验证审校者身份、韩语能力或审校独立性/);
  assert.match(html, /不会自动批准任何正式译文/);
  assert.match(html, /id="compare-files" type="file"[^>]*multiple/);
  const summarySource = html.match(/function buildReviewComparisonSummary\([^]*?\n\}/)?.[0];
  const summarize = new Function(summarySource + '; return buildReviewComparisonSummary;')();
  const safeReport = summarize(report, data);
  assert.equal(safeReport.status, 'LOCAL_TWO_EXPORT_COMPARISON_UNVERIFIED');
  assert.equal(safeReport.source_sha256, data.source.asset_sha256);
  assert.equal(safeReport.questions.length, 124);
  assert.ok(!JSON.stringify(safeReport).includes('审校者 A'));
  assert.ok(!JSON.stringify(safeReport).includes('审校者 B'));
  assert.ok(!JSON.stringify(safeReport).includes(agreed.source_text_ko), 'comparison omits Korean question text');
  assert.ok(!JSON.stringify(safeReport).includes(disagreed.translation_zh_cn), 'comparison omits draft translations');
  assert.match(html, /下载去备注的差异 JSON/);
});

test('local review comparison rejects changed source evidence and non-self-reported approvals', () => {
  const validation = html.match(/function validateReviewImport\([^]*?\n\}/)?.[0];
  const comparison = html.match(/function compareReviewExports\([^]*?\n\}/)?.[0];
  const compare = new Function(validation + '\n' + comparison + '; return compareReviewExports;')();
  const clean = structuredClone(data);
  const forgedSource = structuredClone(data);
  forgedSource.questions[0].source_text_ko = '替换的韩文';
  assert.throws(() => compare(clean, forgedSource, data), /韩文原文/);
  const forgedReview = structuredClone(data);
  forgedReview.questions[0].human_review_status = 'bilingual_reviewed';
  assert.throws(() => compare(forgedReview, clean, data), /不合法/);
  const stalePass = structuredClone(data);
  stalePass.questions[0].human_review_status = 'pass';
  stalePass.questions[0].human_review_note = '过时的备注';
  stalePass.questions[0].human_review_note_stale = true;
  assert.throws(() => compare(stalePass, clean, data), /缺少有效备注/);
  assert.doesNotMatch(html, /\bfetch\s*\(|\bXMLHttpRequest\b|\bWebSocket\b|\bsendBeacon\s*\(|\.innerHTML\s*=/);
});

test('review search finds Korean and Chinese option texts including local edits', () => {
  const source = html.match(/function matchesReviewSearch\([^]*?\n\}/)?.[0];
  assert.ok(source, 'option-aware review search must be independently testable');
  const matches = new Function('groupLabel', source + ';return matchesReviewSearch;')(q => q.source_group);
  const q = { id:'s1-search', season:1, source_group:'politics',
    source_text_ko:'질문 본문', translation_zh_cn:'题干中文',
    options:[{ ko:'한국어 옵션 고유어', zh_cn:'中文答案唯一词', mark:'1' }] };
  assert.equal(matches(q, {}, 's1-search'), true);
  assert.equal(matches(q, {}, '한국어 옵션 고유어'), true);
  assert.equal(matches(q, {}, '中文答案唯一词'), true);
  assert.equal(matches(q, { options:['修改后的答案'] }, '修改后的答案'), true);
  assert.equal(matches(q, { options:['修改后的答案'] }, '中文答案唯一词'), false);
  assert.equal(matches(q, {}, '根本不存在的字符串'), false);
});
