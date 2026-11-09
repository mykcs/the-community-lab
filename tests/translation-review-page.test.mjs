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
  assert.match(standaloneHtml, /本页不会自动发送译文修改或审校标记/);
  assert.doesNotMatch(standaloneHtml, /此工具不联网/);
  assert.match(standaloneHtml, /<link rel="icon" type="image\/svg\+xml" href="data:image\/svg\+xml,/);
  assert.doesNotMatch(standaloneHtml, /<script\b[^>]*\bsrc\s*=|<link\b[^>]*\bhref\s*=\s*"https?:/i);
  assert.doesNotMatch(standaloneHtml, /LOCAL_RESEARCH_CANDIDATE_NOT_FOR_PUBLICATION/);
});

test('standalone reviewer supports offline JSON handoff and comparison without upgrading review status', () => {
  assert.match(standaloneHtml, /id=\"import-file\" type=\"file\"/);
  assert.match(standaloneHtml, /id=\"compare-files\" type=\"file\"[^>]*multiple/);
  assert.match(standaloneHtml, /本页不会自动发送译文修改或审校标记/);
  const validation = standaloneHtml.match(/function validateReviewImport\([^]*?\n\}/)?.[0];
  const comparison = standaloneHtml.match(/function compareReviewExports\([^]*?\n\}/)?.[0];
  assert.ok(validation && comparison, 'standalone page must validate and compare same-source exports');
  const compare = new Function(validation + '\n' + comparison + '; return compareReviewExports;')();
  const left = structuredClone(standaloneData), right = structuredClone(standaloneData);
  left.questions[0].translation_zh_cn = '译文甲';
  right.questions[0].translation_zh_cn = '译文乙';
  const report = compare(left, right, standaloneData);
  assert.equal(report.counts.different, 1);
  assert.equal(report.rows[0].status, 'different');
  assert.equal(standaloneData.questions[0].human_review_status, undefined);
  assert.match(standaloneHtml, /不验证审校者身份、韩语能力或审校独立性/);
  assert.doesNotMatch(standaloneHtml, /\bfetch\s*\(|\bXMLHttpRequest\b|\bWebSocket\b|\bsendBeacon\s*\(|\.innerHTML\s*=/);
});

test('standalone review JSON accepts object key reordering but still rejects source changes', () => {
  const validation = standaloneHtml.match(/function validateReviewImport\([^]*?\n\}/)?.[0];
  assert.ok(validation);
  const restore = new Function(validation + '; return validateReviewImport;')();
  const reverseKeys = value => Array.isArray(value) ? value.map(reverseKeys) :
    value && typeof value === 'object'
      ? Object.fromEntries(Object.entries(value).reverse().map(([key, item]) => [key, reverseKeys(item)]))
      : value;
  const reordered = reverseKeys(structuredClone(standaloneData));
  reordered.questions[0].translation_zh_cn = '仅供本地回归测试的合成译文';
  const edits = restore(reordered, standaloneData);
  assert.equal(edits[reordered.questions[0].id].translation, '仅供本地回归测试的合成译文');

  // A changed Korean source or changed source-option ordering remains forbidden.
  const alteredText = structuredClone(reordered);
  alteredText.questions[0].source_text_ko += 'X';
  assert.throws(() => restore(alteredText, standaloneData), /韩文原文/);
  const reorderedOptions = structuredClone(reordered);
  reorderedOptions.questions[0].options.reverse();
  assert.throws(() => restore(reorderedOptions, standaloneData), /韩文原文/);
});

test('primary reviewer accepts reordered JSON object fields without accepting altered Korean source', () => {
  const validation = html.match(/function validateReviewImport\([^]*?\n\}/)?.[0];
  assert.ok(validation);
  const restore = new Function(validation + '; return validateReviewImport;')();
  const reverseKeys = value => Array.isArray(value) ? value.map(reverseKeys) :
    value && typeof value === 'object'
      ? Object.fromEntries(Object.entries(value).reverse().map(([key, item]) => [key, reverseKeys(item)]))
      : value;
  const reordered = reverseKeys(structuredClone(data));
  reordered.questions[0].translation_zh_cn = '合成测试译文';
  const edits = restore(reordered, data);
  assert.equal(edits[reordered.questions[0].id].translation, '合成测试译文');
  const changedKorean = structuredClone(reordered);
  changedKorean.questions[0].source_text_ko += 'X';
  assert.throws(() => restore(changedKorean, data), /韩文原文/);
  const swappedOptions = structuredClone(reordered);
  swappedOptions.questions[0].options.reverse();
  assert.throws(() => restore(swappedOptions, data), /韩文原文/);
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

test('rp05 draft says failure to catch a criminal, while preserving its unreviewed status', () => {
  for (const source of [data, standaloneData]) {
    const question = source.questions.find(item => item.id === 'rp05');
    assert.ok(question);
    assert.equal(question.source_text_ko, '흉악범을 놓칠 수 있더라도 불법적인 수사 방식이 동원되어서는 안 된다.');
    assert.equal(question.translation_zh_cn, '即使可能抓不到凶恶罪犯，也不应动用非法侦查手段。');
    assert.equal(question.translation_version, 'draft-0.1.1');
    assert.equal(question.review_status, 'draft');
    assert.equal(question.translation_status, 'AI_DRAFT_UNREVIEWED');
    assert.match(question.translator_note, /韩国语基础词典/);
    assert.match(question.translator_note, /独立韩中人工复核/);
  }
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
    assert.equal(question.rights_status, 'user_reported_permission_unverified', question.id);
    assert.ok(question.source_text_ko.trim(), `${question.id} Korean source is present`);
    assert.ok(question.translation_zh_cn.trim(), `${question.id} Chinese draft is present`);
    assert.match(question.source_url, /^https:\/\/thecommunity\.co\.kr\/season\/[12]\/test$/);
    assert.ok(question.options.length > 0, `${question.id} has source options`);
    optionCount += question.options.length;
    for (const option of question.options) {
      if (question.season === 1 && question.options.length === 6 && [2, 5].includes(option.value)) {
        assert.equal(option.ko, '', `${question.id} has no source caption at level ${option.value}`);
      } else {
        assert.ok(option.ko?.trim(), `${question.id} Korean option is present`);
      }
      assert.ok(option.zh_cn?.trim(), `${question.id} Chinese option draft is present`);
    }
  }
  assert.deepEqual(perSeason, { 1: 87, 2: 37 });
  assert.equal(optionCount, 550);
});

test('both reviewer packs preserve genuine empty Korean scale captions only at S1 six-choice levels 2/5', () => {
  assert.deepEqual(standaloneData.questions, data.questions);
  const six = data.questions.filter(q => q.season === 1 && q.options.length === 6);
  assert.equal(six.length, 64);
  let blanks = 0;
  for (const q of data.questions) {
    for (const option of q.options) {
      const missing = q.season === 1 && q.options.length === 6 && [2, 5].includes(option.value);
      if (missing) {
        assert.equal(option.ko, '', `${q.id} value ${option.value} must be unlabeled`);
        blanks++;
      } else {
        assert.ok(option.ko.trim(), `${q.id} unexpected blank Korean source`);
      }
    }
  }
  assert.equal(blanks, 128);
});

test('legacy reviewer export corrects only known placeholders and reopens old self-reported PASS', () => {
  const source = html.match(/function validateReviewImport\([^]*?\n\}/)?.[0];
  const restore = new Function(source + '; return validateReviewImport;')();
  const old = structuredClone(data);
  for (const q of old.questions.filter(q => q.season === 1 && q.options.length === 6)) {
    for (const o of q.options.filter(o => [2, 5].includes(o.value))) o.ko = o.value + '점';
  }
  const first = old.questions.find(q => q.season === 1 && q.options.length === 6);
  first.human_review_status = 'pass';
  first.human_review_note = '历史自报审核备忘，不代表独立复核';
  first.translation_zh_cn += '（本机未上传的编辑）';
  const edits = restore(old, data);
  assert.equal(edits[first.id].translation, first.translation_zh_cn);
  assert.equal(edits[first.id].review, 'pending');
  assert.equal(edits[first.id].reviewNoteStale, true);
  assert.equal(edits[first.id].note, first.human_review_note);
  assert.equal(data.questions.find(q => q.id === first.id).options[1].ko, '', 'baseline is immutable');

  const modified = structuredClone(old);
  modified.questions.find(q => q.id === first.id).options[1].ko = '가짜 원문';
  assert.throws(() => restore(modified, data), /韩文原文/);
  const alteredSource = structuredClone(old);
  alteredSource.source.asset_sha256 = '0'.repeat(64);
  assert.throws(() => restore(alteredSource, data), /来源指纹/);
});

test('identical Korean answer labels keep a consistent Chinese draft', () => {
  const translations = new Map();
  for (const question of data.questions) {
    for (const option of question.options) {
      // Two distinct numeric steps in the S1 six-point scale have EMPTY labels.
      // A blank caption alone does not identify the choice: use the source value.
      const source = JSON.stringify([question.season,question.options.length,option.value,option.ko.normalize('NFC').trim()]);
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
    ['ms05', '如果对方是我非常讨厌的那类人，即使对我的工作成果很有帮助，我也不会在私下与其深交。'],
    ['ms11', '选择职业时，比起银行账户上显示的金额，更应把是否适合自己、能否获得成就感放在首位。'],
  ]);
  for (const [id, translation] of expected) {
    const question = data.questions.find(item => item.id === id);
    assert.ok(question, `${id} must remain in the source dataset`);
    assert.equal(question.translation_zh_cn, translation, id);
    assert.equal(question.translation_version, id === 'ms11' || id === 'ms05' ? 'draft-0.1.2' : 'draft-0.1.1', id);
    assert.equal(question.review_status, 'draft', id);
    assert.equal(question.translation_status, 'AI_DRAFT_UNREVIEWED', id);
  }
  assert.match(data.translation_review.editorial_pass, /rp08、rp10、ms05、ms11/);
  assert.equal(data.translation_review.independent_korean_chinese_human_review, 'NOT_DONE');
  assert.equal(data.translation_review.publishable, false);
});

test('S2 sa10 preserves Korean comparative 보다 without inventing categorical exclusion', () => {
  const q = data.questions.find(item => item.id === 'sa10');
  assert.ok(q);
  assert.match(q.source_text_ko, /개인의 도덕적 결함보다.*처했던 환경과 사회 구조/);
  assert.equal(q.translation_zh_cn,
    '犯罪的成因，与其归结为个人道德缺陷，更应从当事人当时所处的环境与社会结构中寻找。');
  assert.equal(q.translation_version, 'draft-0.1.1');
  assert.match(q.translator_note, /보다.*而不是.*独立韩中人工复核/);
  assert.equal(q.review_status, 'draft');
  assert.equal(q.translation_status, 'AI_DRAFT_UNREVIEWED');
  assert.equal(data.translation_review.independent_korean_chinese_human_review, 'NOT_DONE');
  assert.equal(data.translation_review.publishable, false);
  assert.match(data.translation_review.editorial_pass, /sa10.*보다/);
  assert.deepEqual(standaloneData.questions.find(item => item.id === 'sa10'), q);
});

test('Korean-speaker references name Korea for Chinese readers and remain unreviewed', () => {
  const expected = new Map([
    ['s1-openness-08', ['우리 사회에서는', '韩国社会需要执行死刑。']],
    ['s1-openness-17', ['한국 사회에 온 이주민은 우리 문화에', '让来到韩国的移民同化于韩国文化比较好。']],
    ['s1-openness-18', ['우리나라로 들어오는 이민자는', '应将进入韩国的移民人数降到最低。']],
  ]);
  for (const [id, [sourceFragment, zh]] of expected) {
    const question = data.questions.find(item => item.id === id);
    assert.ok(question, `${id} must remain in the Korean source dataset`);
    assert.match(question.source_text_ko, new RegExp(sourceFragment));
    assert.equal(question.translation_zh_cn, zh, id);
    assert.equal(question.translation_version, 'draft-0.1.1', id);
    assert.match(question.translator_note, /AI 语境预审.*(?:待|未获).*人工复核/);
    assert.equal(question.review_status, 'draft', id);
    assert.equal(question.translation_status, 'AI_DRAFT_UNREVIEWED', id);
    assert.deepEqual(standaloneData.questions.find(item => item.id === id), question);
    assert.match(data.translation_review.editorial_pass, new RegExp(id));
  }
  const lexicalReference = data.questions.find(item => item.id === 's1-openness-18');
  assert.match(lexicalReference.reader_note_zh_cn, /우리나라.*韩国.*中国/);
  assert.equal(data.translation_review.independent_korean_chinese_human_review, 'NOT_DONE');
  assert.equal(data.translation_review.publishable, false);
  assert.deepEqual(standaloneData.questions, data.questions);
});

test('rp06 preserves torture severity and sa03 does not add an unspoken threshold', () => {
  const expected = new Map([
    ['rp06', '一座聚集数万人的综合体育场收到炸弹袭击预告。若查明炸弹确切位置的唯一办法是对恐怖袭击嫌疑人无辜的年幼子女施以酷刑，那就应该施以酷刑。'],
    ['sa03', '即使企业或组织按能力选人，如果人员构成偏向特定出身地、学校或性别，也有必要作出调整。'],
  ]);
  for (const [id, translation] of expected) {
    const question = data.questions.find(item => item.id === id);
    assert.ok(question, `${id} must remain in the source dataset`);
    assert.equal(question.translation_zh_cn, translation, id);
    assert.equal(question.translation_version, id === 'rp06' ? 'draft-0.1.2' : 'draft-0.1.1', id);
    if (id === 'rp06') {
      assert.match(question.source_text_ko, /폭탄 테러가 예고되었다/);
      assert.match(question.translator_note, /자녀/);
      assert.match(question.translator_note, /独立韩中人工复核/);
      assert.doesNotMatch(question.translation_zh_cn, /他们/);
    }
    assert.equal(question.translation_status, 'AI_DRAFT_UNREVIEWED', id);
    assert.equal(question.review_status, 'draft', id);
  }
  assert.match(data.translation_review.editorial_pass, /rp06.*sa03/);
  assert.deepEqual(standaloneData.questions, data.questions, 'both review pages must stay in sync');
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

test('rp01 preserves the source goal of resolving the power shortage in both unreviewed drafts', () => {
  const question = data.questions.find(item => item.id === 'rp01');
  assert.ok(question, 'rp01 must remain in the source dataset');
  assert.match(question.source_text_ko, /전력 부족 사태를 해결하기 위해/);
  assert.equal(question.translation_zh_cn, '如果为解决国家电力短缺而必须修建水坝，即使部分淹没区居民强烈反对，也有必要强行推进。');
  assert.equal(question.translation_version, 'draft-0.1.1');
  assert.match(question.translator_note, /한국어기초사전|韩国国立国语院/);
  assert.match(question.translator_note, /仍待独立韩中人工复核/);
  assert.equal(question.translation_status, 'AI_DRAFT_UNREVIEWED');
  assert.equal(question.review_status, 'draft');
  assert.match(data.translation_review.editorial_pass, /rp01.*draft-0\.1\.1/);
  assert.deepEqual(standaloneData.questions, data.questions, 'both reviewer pages must stay in sync');
  assert.equal(data.translation_review.independent_korean_chinese_human_review, 'NOT_DONE');
  assert.equal(data.translation_review.publishable, false);
});

test('rp12 uses natural comparative wording without changing its unreviewed draft status', () => {
  const question = data.questions.find(item => item.id === 'rp12');
  assert.ok(question, 'rp12 must remain in the source dataset');
  assert.match(question.source_text_ko, /보다.*유능한 인재다/);
  assert.equal(question.translation_zh_cn, '比起因严格遵守规则而把事情办砸的人，稍微违反规则却能取得成果的人更有能力。');
  assert.equal(question.translation_version, 'draft-0.1.1');
  assert.equal(question.translation_status, 'AI_DRAFT_UNREVIEWED');
  assert.equal(question.review_status, 'draft');
  assert.match(data.translation_review.editorial_pass, /rp12.*draft-0\.1\.1/);
  assert.deepEqual(standaloneData.questions, data.questions, 'the standalone review page must stay in sync');
});

test('rp11 avoids overstating 반인륜적인 as “反人类” and stays an unreviewed AI draft', () => {
  const question = data.questions.find(item => item.id === 'rp11');
  assert.ok(question, 'rp11 must remain in the source dataset');
  assert.match(question.source_text_ko, /반인륜적인 행위/);
  assert.match(question.translation_zh_cn, /酷刑、屠杀等不人道行为/);
  assert.doesNotMatch(question.translation_zh_cn, /反人类/);
  assert.equal(question.translation_version, 'draft-0.1.3');
  assert.match(question.translator_note, /待独立韩中人工复核/);
  assert.equal(question.translation_status, 'AI_DRAFT_UNREVIEWED');
  assert.equal(question.review_status, 'draft');
  assert.deepEqual(question.options.map(option => option.value), ['O', 'X']);
  assert.deepEqual(standaloneData.questions, data.questions, 'both review pages must carry the same draft');
  assert.equal(data.translation_review.independent_korean_chinese_human_review, 'NOT_DONE');
  assert.equal(data.translation_review.publishable, false);
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

test('s1-class-23 preserves the source’s strict count threshold as an unreviewed draft', () => {
  const question = data.questions.find(item => item.id === 's1-class-23');
  assert.ok(question, 's1-class-23 must remain in the source dataset');
  assert.equal(question.source_text_ko, '어릴 적 부모님이 읽는 책이 책꽂이에 적어도 스무 권 넘게 있었다');
  assert.equal(question.translation_zh_cn, '我小时候，书架上至少有二十一本父母读的书。');
  assert.equal(question.translation_version, 'draft-0.1.2');
  assert.match(question.translator_note, /超过二十本.*二十一本/);
  assert.equal(question.translation_status, 'AI_DRAFT_UNREVIEWED');
  assert.equal(question.review_status, 'draft');
  assert.match(data.translation_review.editorial_pass, /s1-class-23.*draft-0\.1\.2/);
  assert.deepEqual(standaloneData.questions, data.questions, 'both published review pages must stay in sync');
  assert.equal(data.translation_review.independent_korean_chinese_human_review, 'NOT_DONE');
  assert.equal(data.translation_review.publishable, false);
});

test('ms07 keeps the Korean comparison and teaching priority without implying exclusion', () => {
  const question = data.questions.find(item => item.id === 'ms07');
  assert.ok(question, 'ms07 must remain in the source dataset');
  assert.equal(question.source_text_ko, '내 자식에게는 영리하게 돈 버는 법보다 양심에 따라 사는 법을 먼저 가르치겠다.');
  assert.equal(question.translation_zh_cn, '比起教我的孩子如何精明地赚钱，我会先教孩子如何凭良心生活。');
  assert.equal(question.translation_version, 'draft-0.1.3');
  assert.match(question.translator_note, /比较助词「보다」.*先后副词「먼저」/);
  assert.match(question.translator_note, /korean\.go\.kr/);
  assert.match(question.translator_note, /补回韩文「내 자식에게는」所指的“我的孩子”/);
  assert.doesNotMatch(question.translation_zh_cn, /他们/);
  assert.match(question.translator_note, /未明言子女人数|不限定孩子的数量/);
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

test('s1-gender-02 keeps both comparison subjects explicit as an unreviewed draft', () => {
  const question = data.questions.find(item => item.id === 's1-gender-02');
  assert.ok(question, 's1-gender-02 must remain in the source dataset');
  assert.equal(question.source_text_ko, '자본주의 시장에서 일반적으로 남성의 능력은 여성의 능력보다 더 높게 평가된다.');
  assert.equal(question.translation_zh_cn, '在资本主义市场中，男性的能力通常比女性的能力受到更高评价。');
  assert.equal(question.translation_version, 'draft-0.1.1');
  assert.equal(question.translation_status, 'AI_DRAFT_UNREVIEWED');
  assert.equal(question.review_status, 'draft');
  assert.deepEqual(standaloneData.questions, data.questions, 'both reviewer pages must stay in sync');
  assert.equal(data.translation_review.independent_korean_chinese_human_review, 'NOT_DONE');
  assert.equal(data.translation_review.publishable, false);
});

test('s1-gender-21 keeps 엄살 as exaggerated suffering in the unreviewed draft', () => {
  const question = data.questions.find(item => item.id === 's1-gender-21');
  assert.ok(question, 's1-gender-21 must remain in the source dataset');
  assert.equal(question.source_text_ko, '여성이 우울증과 같은 정신질환을 호소할 때는 엄살인 경우가 많다.');
  assert.equal(question.translation_zh_cn, '女性诉说自己受抑郁症等精神疾病困扰时，很多时候是在夸大自己的痛苦。');
  assert.equal(question.translation_version, 'draft-0.1.2');
  assert.match(question.translator_note, /엄살.*虚构或夸大疼痛、痛苦/);
  assert.match(question.translator_note, /krdict\.korean\.go\.kr\/kor\/dicSearch\/SearchView\?ParaWordNo=67230/);
  assert.equal(question.translation_status, 'AI_DRAFT_UNREVIEWED');
  assert.equal(question.review_status, 'draft');
  assert.match(data.translation_review.editorial_pass, /s1-gender-21.*draft-0\.1\.2/);
  assert.deepEqual(standaloneData.questions, data.questions, 'both review pages must stay in sync');
  assert.equal(data.translation_review.independent_korean_chinese_human_review, 'NOT_DONE');
  assert.equal(data.translation_review.publishable, false);
});

test('s1-openness-09 makes all-participant team dining explicit in the unreviewed draft', () => {
  const question = data.questions.find(item => item.id === 's1-openness-09');
  assert.ok(question, 's1-openness-09 must remain in the source dataset');
  assert.equal(question.source_text_ko, '팀워크를 위해서는 내키지 않더라도 회식에 다같이 참여해야한다.');
  assert.equal(question.translation_zh_cn, '为了团队协作，即使不情愿，大家也应该一起参加团队聚餐。');
  assert.equal(question.translation_version, 'draft-0.1.1');
  assert.match(question.translator_note, /다같이.*大家/);
  assert.match(question.translator_note, /krdict\.korean\.go\.kr\/chn\/dicSearch\/SearchView\?ParaWordNo=88144/);
  assert.equal(question.translation_status, 'AI_DRAFT_UNREVIEWED');
  assert.equal(question.review_status, 'draft');
  assert.match(data.translation_review.editorial_pass, /s1-openness-09.*draft-0\.1\.1/);
  assert.deepEqual(standaloneData.questions, data.questions, 'both review pages must stay in sync');
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
    q4: { review: 'pending' },
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
  assert.equal(edits.q3.reviewNoteStale, true, 'pre-edit notes are stale even before a PASS');
  assert.equal(q3Select.value, 'revise');
  const q4Select = { value: 'pending' };
  update('q4', { translation: '新翻译' }, q4Select);
  assert.equal(edits.q4.reviewNoteStale, false, 'no previous note to invalidate');
  assert.equal(saves, 4);
  assert.match(html, /recordTranslationEdit\(q\.id,\{translation:edit\.value\},status\)/);
  assert.match(html, /recordTranslationEdit\(q\.id,\{options:arr\},status\)/);
  assert.match(html, /再次修改题干译文或选项.*自动退回待复核/);
  assert.match(html, /curr\.reviewNoteStale===true/);
  assert.match(html, /reviewNoteStaleOriginal:staleBasis/);
  assert.match(html, /note\.value\.trim\(\)===String\(staleBasis\)\.trim\(\)/);
  assert.doesNotMatch(html, /note:note\.value,reviewNoteStale:false/);
  assert.equal(edits.q1.reviewNoteStaleOriginal, 'reviewer A · bilingual evidence · 2026-10-30');
  assert.equal(edits.q3.reviewNoteStaleOriginal, 'needs changes');
  assert.equal(edits.q4.reviewNoteStaleOriginal, undefined);
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
  q.human_review_source_caption_revision = 's1-scale-empty-2-and-5@1';
  q.human_review_note = '复核者甲 · 双语能力说明 · 2026-10-30';
  q.human_review_note_stale = false;
  const edits = restore(exported, data);
  assert.equal(Object.keys(edits).length, 1);
  assert.deepEqual(edits[q.id], {
    translation: '重新编辑的中文草稿',
    options: q.options.map(o => o.zh_cn),
    review: 'pass',
    note: q.human_review_note,
    reviewNoteStale: false,
    sourceCaptionRevision: 's1-scale-empty-2-and-5@1'
  });
  assert.match(html, /const serialized=JSON\.stringify\(imported\);\s*localStorage\.setItem\(key,serialized\);\s*lastPersistedDraftRaw=serialized/);
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
  invalid(json => { json.questions[0].human_review_status = 'pass'; json.questions[0].human_review_source_caption_revision = 's1-scale-empty-2-and-5@1'; });
  invalid(json => { json.questions[0].human_review_status = 'pass'; json.questions[0].human_review_source_caption_revision = 's1-scale-empty-2-and-5@1'; json.questions[0].human_review_note = 'note'; json.questions[0].human_review_note_stale = true; });
  const oldExport = structuredClone(data);
  oldExport.questions[0].translation_zh_cn = '改动后等待复核';
  oldExport.questions[0].human_review_status = 'pending';
  oldExport.questions[0].human_review_note = '之前的备注';
  assert.equal(restore(oldExport,data)[oldExport.questions[0].id].reviewNoteStale,true);
  assert.match(html, /const MAX_REVIEW_JSON_BYTES=8\*1024\*1024/);
  assert.match(html, /if\(file\.size>MAX_REVIEW_JSON_BYTES\)throw new Error\('文件超过 8 MiB 上限'\)/);
  assert.match(html, /if\(files\.some\(file=>file\.size>MAX_REVIEW_JSON_BYTES\)\)throw new Error\('每份文件不得超过 8 MiB'\)/);
  assert.match(html, /原有草稿未被覆盖/);
});

test('legacy offline review exports keep edits without promoting unverified permission', () => {
  const source = html.match(/function validateReviewImport\([^]*?\n\}/)?.[0];
  const restore = new Function(source + '; return validateReviewImport;')();
  const oldExport = structuredClone(data);
  oldExport.questions.forEach(question => { question.rights_status = 'licensed'; });
  oldExport.questions[0].translation_zh_cn = '本机合成修改，仍待独立人工审校';
  const edits = restore(oldExport, data);
  assert.equal(edits[oldExport.questions[0].id].translation, '本机合成修改，仍待独立人工审校');
  assert.equal(data.questions[0].rights_status, 'user_reported_permission_unverified');
  const forged = structuredClone(oldExport);
  forged.reported_permission.status = 'INDEPENDENTLY_VERIFIED'; // No such evidence was supplied.
  assert.throws(() => restore(forged, data), /许可记录/);
  const altered = structuredClone(oldExport);
  altered.questions[1].rights_status = 'independently_licensed';
  assert.throws(() => restore(altered, data), /许可记录/);
});

test('two independently exported local reviews can be compared without promoting them to human verification', () => {
  const validation = html.match(/function validateReviewImport\([^]*?\n\}/)?.[0];
  const comparison = html.match(/function compareReviewExports\([^]*?\n\}/)?.[0];
  assert.ok(validation && comparison, 'safe import and comparison logic must be explicit');
  const compare = new Function(validation + '\n' + comparison + '; return compareReviewExports;')();
  const left = structuredClone(data), right = structuredClone(data);
  const agreed = left.questions[0], disagreed = left.questions[1], revision = left.questions[2];
  agreed.human_review_status = 'pass';
  agreed.human_review_source_caption_revision = 's1-scale-empty-2-and-5@1';
  agreed.human_review_note = '审校者 A · 双语依据 · 日期';
  right.questions[0].human_review_status = 'pass';
  right.questions[0].human_review_source_caption_revision = 's1-scale-empty-2-and-5@1';
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
  stalePass.questions[0].human_review_source_caption_revision = 's1-scale-empty-2-and-5@1';
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

test('both reviewer pages expose the same separately marked, unreviewed idiom note', () => {
  const idiom = data.questions.find(q => q.id === 's1-openness-11');
  assert.ok(idiom);
  assert.equal(idiom.translation_zh_cn, '“如果不喜欢寺庙，和尚就该离开”这句话在大多数情况下是对的。');
  assert.equal(idiom.translation_version, 'draft-0.1.4');
  assert.equal(idiom.source_checked_at, '2026-11-05');
  assert.equal(idiom.review_status, 'draft');
  assert.equal(idiom.translation_status, 'AI_DRAFT_UNREVIEWED');
  assert.match(idiom.translator_note, /显式补出条件关系.*如果/);
  assert.match(idiom.translator_note, /仍待独立韩中人工复核/);
  assert.match(idiom.reader_note_zh_cn, /《戏赠沈后》/);
  assert.match(idiom.reader_note_zh_cn, /尚未查到可核验的最早文学出处/);
  assert.match(idiom.reader_note_zh_cn, /《警世通言/);
  assert.match(idiom.reader_note_zh_cn, /不完全等义/);
  assert.match(idiom.reader_note_zh_cn, /AI 译注（待独立人工核对）/);
  assert.match(data.translation_review.editorial_pass, /2026-11-05 AI 预审修订 s1-openness-11/);
  assert.deepEqual(standaloneData.questions, data.questions);
  assert.match(html, /if\(q.reader_note_zh_cn\)zp.append/);
  assert.match(standaloneHtml, /if\(q.reader_note_zh_cn\)zp.append/);
});

test('S1 politics 12 preserves the Korean causative meaning in both unreviewed drafts', () => {
  const question = data.questions.find(q => q.id === 's1-politics-12');
  assert.ok(question);
  assert.match(question.source_text_ko, /모든 사람들이 비슷한 월급을 받게 하는 나라/);
  assert.equal(question.translation_zh_cn, '我不想生活在一个让所有人都拿相近工资的国家。');
  assert.equal(question.translation_version, 'draft-0.1.1');
  assert.equal(question.source_checked_at, '2026-11-05');
  assert.match(question.translator_note, /使役结构.*받게 하다/);
  assert.match(question.translator_note, /未进行独立韩中人工复核/);
  assert.equal(question.review_status, 'draft');
  assert.equal(question.translation_status, 'AI_DRAFT_UNREVIEWED');
  assert.equal(data.translation_review.independent_korean_chinese_human_review, 'NOT_DONE');
  assert.equal(data.translation_review.publishable, false);
  assert.match(data.translation_review.editorial_pass, /s1-politics-12.*받게 하다/);
  assert.deepEqual(standaloneData.questions.find(q => q.id === question.id), question);
  assert.deepEqual(standaloneData.translation_review, data.translation_review);
});

test('S1 gender 18 does not narrow the broad Korean result term to business-only performance', () => {
  const question = data.questions.find(q => q.id === 's1-gender-18');
  assert.ok(question);
  assert.equal(question.translation_zh_cn, '如果男性的平均工资高于女性，那是因为男性的工作表现更好。');
  assert.equal(question.translation_version, 'draft-0.1.1');
  assert.match(question.translator_note, /성과.*取得的结果/);
  assert.match(question.translator_note, /仍待独立韩中人工复核/);
  assert.equal(question.review_status, 'draft');
  assert.equal(question.translation_status, 'AI_DRAFT_UNREVIEWED');
  assert.deepEqual(standaloneData.questions.find(q => q.id === question.id), question);
  assert.deepEqual(standaloneData.questions, data.questions);
});


test('export and import preserve the pre-edit note baseline across offline reviewer devices', () => {
  const source = html.match(/function validateReviewImport\([^]*?\n\}/)?.[0];
  assert.ok(source);
  const restore = new Function(source + '; return validateReviewImport;')();
  const exported = structuredClone(data);
  const row = exported.questions[0];
  row.translation_zh_cn += '（合成中文编辑，仅用于测试）';
  row.human_review_status = 'pending';
  row.human_review_note = '新备注：已检查修改后的译文';
  row.human_review_note_stale = false;
  row.human_review_note_stale_original = '旧备注：仅检查原译文';
  const restored = restore(exported, data);
  assert.equal(restored[row.id].reviewNoteStaleOriginal, '旧备注：仅检查原译文');
  assert.equal(restored[row.id].reviewNoteStale, false);
  row.human_review_note = '旧备注：仅检查原译文  ';
  row.human_review_status = 'pass';
  row.human_review_source_caption_revision = 's1-scale-empty-2-and-5@1';
  assert.throws(() => restore(exported, data), /通过状态缺少有效备注/,
    'undoing the old note after import must not restore a PASS');
  row.human_review_status = 'pending';
  row.human_review_note = '新备注：已检查修改后的译文';
  const legacy = structuredClone(exported);
  delete legacy.questions[0].human_review_note_stale_original;
  assert.equal(restore(legacy, data)[row.id].reviewNoteStaleOriginal, undefined,
    'previous export format remains accepted without fabricating a historical baseline');
  assert.match(html, /q\.human_review_note_stale_original=e\.reviewNoteStaleOriginal/);
  assert.match(standaloneHtml, /q\.human_review_note_stale_original=e\.reviewNoteStaleOriginal/);
});

test('S1 gender 01 names menstrual leave clearly and remains an unreviewed draft', () => {
  const question = data.questions.find(q => q.id === 's1-gender-01');
  assert.ok(question);
  assert.equal(question.source_text_ko, '여성들이 보건휴가(생리휴가)를 주말에 붙여 쓰는 것은 정당한 권리행사이므로 비난할 수 없다.');
  assert.equal(question.translation_zh_cn, '女性把经期假（生理假）连着周末一起休，是正当行使权利，不应受到指责。');
  assert.equal(question.translation_version, 'draft-0.1.1');
  assert.match(question.translator_note, /劳动基准法/);
  assert.match(question.translator_note, /law\.go\.kr/);
  assert.match(question.translator_note, /仍待独立韩中人工复核/);
  assert.equal(question.review_status, 'draft');
  assert.equal(question.translation_status, 'AI_DRAFT_UNREVIEWED');
  assert.deepEqual(standaloneData.questions.find(q => q.id === question.id), question);
  assert.deepEqual(standaloneData.questions, data.questions);
});
test('S2 sa12 preserves the limiting force of 만으로 and remains an unreviewed draft', () => {
  const question = data.questions.find(q => q.id === 'sa12');
  assert.ok(question);
  assert.equal(question.source_text_ko, '모두에게 동일한 시험 기회를 주는 것만으로 공정한 경쟁 조건은 충분히 갖춰진 것이다.');
  assert.equal(question.translation_zh_cn, '仅仅给每个人同等的考试机会，公平竞争的条件就已经充分具备了。');
  assert.equal(question.translation_version, 'draft-0.1.1');
  assert.match(question.translator_note, /국립국어원|韩国国立国语院/);
  assert.match(question.translator_note, /onlineQna/);
  assert.match(question.translator_note, /仍待独立韩中人工复核/);
  assert.equal(question.review_status, 'draft');
  assert.equal(question.translation_status, 'AI_DRAFT_UNREVIEWED');
  assert.deepEqual(standaloneData.questions.find(q => q.id === question.id), question);
});

test('S2 ms02 preserves salary as a purpose condition and remains an unreviewed draft', () => {
  const question = data.questions.find(q => q.id === 'ms02');
  assert.ok(question);
  assert.equal(question.source_text_ko, '더 높은 연봉을 위해서라면 가족·친구와의 시간을 포기할 수 있다.');
  assert.equal(question.translation_zh_cn, '如果是为了更高的年薪，我可以放弃与家人和朋友相处的时间。');
  assert.equal(question.translation_version, 'draft-0.1.1');
  assert.match(question.translator_note, /연봉/);
  assert.match(question.translator_note, /krdict\.korean\.go\.kr/);
  assert.match(question.translator_note, /仍待独立韩中人工复核/);
  assert.equal(question.review_status, 'draft');
  assert.equal(question.translation_status, 'AI_DRAFT_UNREVIEWED');
  assert.deepEqual(standaloneData.questions.find(q => q.id === question.id), question);
});

test('S1 gender 08 retains annual-salary scope and remains an unreviewed draft', () => {
  const question = data.questions.find(q => q.id === 's1-gender-08');
  assert.ok(question);
  assert.equal(question.source_text_ko, '남자와 여자가 같은 직업에 같은 연봉을 받고 있다면 실은 여자가 더 유능할 것이다.');
  assert.equal(question.translation_zh_cn, '如果男性和女性从事同一职业、领取相同年薪，实际上女性会更有能力。');
  assert.equal(question.translation_version, 'draft-0.1.1');
  assert.match(question.translator_note, /연봉/);
  assert.match(question.translator_note, /ParaWordNo=67549/);
  assert.match(question.translator_note, /仍待独立韩中人工复核/);
  assert.equal(question.review_status, 'draft');
  assert.equal(question.translation_status, 'AI_DRAFT_UNREVIEWED');
  assert.deepEqual(standaloneData.questions.find(q => q.id === question.id), question);
});
