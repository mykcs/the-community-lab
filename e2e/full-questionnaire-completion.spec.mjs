import { readFileSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { expect, test } from '@playwright/test';
import { loadFullQuestionnaire } from '../scripts/load-full-questionnaire.mjs';
import { createPrivateProgressReceipt } from '../lib/full-questionnaire.mjs';

const sourceIndex = JSON.parse(readFileSync(new URL('../data/original-question-index.json', import.meta.url), 'utf8'));

test('finished local answer audit shows original values and edits one selected question without a score or upload', async ({ page }) => {
  const pack = loadFullQuestionnaire();
  const questions = pack.seasons[2];
  const answers = Object.fromEntries(questions.map(q => [q.id, q.options[0].value]));
  const receipt = createPrivateProgressReceipt(pack, 2, answers, questions.length - 1);
  const outboundWrites = [];
  page.on('request', request => {
    if (request.method() !== 'GET') outboundWrites.push(request.url());
  });
  await page.goto('/the-community-lab/questionnaire/');
  await page.locator('#full-import-file').setInputFiles({
    name: 'synthetic-finished-private-record.json', mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify(receipt)),
  });
  await expect(page.locator('#full-done')).toBeVisible();
  const audit = page.locator('#full-answer-audit');
  await expect(audit).not.toHaveAttribute('open', '');
  await audit.locator('summary').click();
  await expect(audit.locator('li')).toHaveCount(37);
  const target = audit.locator('li').nth(10);
  await expect(target).toContainText(questions[10].sourceKo);
  await expect(target).toContainText(questions[10].draftZh);
  await expect(target).toContainText(`原始选项值：${questions[10].options[0].value}`);
  expect(await page.evaluate(() => document.documentElement.scrollWidth))
    .toBeLessThanOrEqual(page.viewportSize().width);
  await target.getByRole('button', { name: '修改第 11 题' }).click();
  await expect(page.locator('#full-quiz')).toBeVisible();
  await expect(page.locator('#full-group')).toContainText(`原题编号 ${questions[10].id}`);
  await page.locator('.full-choice').nth(1).click();
  await page.locator('#full-finish-review').click();
  await expect(page.locator('#full-done')).toBeVisible();
  const [download] = await Promise.all([
    page.waitForEvent('download'), page.locator('#full-download').click(),
  ]);
  const revised = JSON.parse(await readFile(await download.path(), 'utf8'));
  expect(revised.selections.map(s => s.selectedValue)).toEqual(
    questions.map((q, i) => q.options[i === 10 ? 1 : 0].value),
  );
  expect(outboundWrites).toEqual([]);
});

test('completed S1 audit retains reader notes and source-blank scale explanations', async ({ page }) => {
  // One synthetic private backup; never submit or record a person's viewpoints.
  // Previous audit rows dropped the same caveats shown when choosing answers.
  const pack = loadFullQuestionnaire();
  const questions = pack.seasons[1];
  const annotated = questions.find(q => q.id === 's1-openness-11');
  const blankScale = questions.find(q => q.options.length === 6 &&
    q.options.some(o => o.value === 2 && o.ko === ''));
  expect(annotated?.readerNote).toMatch(/^AI 译注（待独立人工核对）/);
  expect(blankScale).toBeTruthy();
  const choices = Object.fromEntries(questions.map(q => [
    q.id, q.options.some(o => o.value === 2 && o.ko === '') ? 2 : q.options[0].value,
  ]));
  const backup = createPrivateProgressReceipt(pack, 1, choices, questions.length - 1);
  const writes = [];
  page.on('request', request => {
    if (request.method() !== 'GET') writes.push(request.url());
  });
  await page.goto('/the-community-lab/questionnaire/');
  await page.locator('#full-import-file').setInputFiles({
    name: 'synthetic-s1-complete.json', mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify(backup)),
  });
  await expect(page.locator('#full-done')).toBeVisible();
  await page.locator('#full-answer-audit summary').click();
  const audit = page.locator('#full-answer-audit-list');
  await expect(audit.locator('li')).toHaveCount(87);
  const annotatedRow = audit.locator('li').filter({ hasText: `源题编号 ${annotated.id}` });
  await expect(annotatedRow.locator('.full-answer-audit-note')).toHaveText(annotated.readerNote);
  const scaleRow = audit.locator('li').filter({ hasText: `源题编号 ${blankScale.id}` });
  await expect(scaleRow).toContainText('当前客户端此档无韩文文字标签');
  await expect(scaleRow.locator('.full-answer-audit-hint'))
    .toContainText('不是官网原文');
  await expect(scaleRow.locator('.full-answer-audit-hint'))
    .toContainText('方向是本站根据六级顺序的辅助说明');
  expect(await page.evaluate(() => document.documentElement.scrollWidth))
    .toBeLessThanOrEqual(page.viewportSize().width);
  expect(writes).toEqual([]);
});

test('S2 title displays pinned Korean source group before its unreviewed Chinese translation', async ({ page }) => {
  const question = loadFullQuestionnaire().seasons[2][0];
  const source = sourceIndex.questions.find(q => q.sourceQuestionId === question.id);
  await page.goto('/the-community-lab/questionnaire/?season=2');
  const heading = page.locator('#full-group');
  await expect(heading.locator('[lang="ko"]')).toHaveText(source.sourceGroup);
  await expect(heading).toContainText(` / ${question.group} · 原题编号 ${question.id}`);
  const label = await heading.textContent();
  expect(label.indexOf(source.sourceGroup)).toBeLessThan(label.indexOf(question.group));
  await expect(page.locator('#full-ko')).toHaveAttribute('lang', 'ko');
});

test('latest selected import wins when an older local JSON file finishes reading later', async ({ page }) => {
  // Synthetic private backups only; no official endpoint is contacted.
  const questions = loadFullQuestionnaire().seasons[2];
  const first = questions[0];
  const second = questions[1];
  const oneAnswer = { [first.id]: first.options[0].value };
  const twoAnswers = { ...oneAnswer, [second.id]: second.options[1].value };
  const pack = loadFullQuestionnaire();
  const slow = createPrivateProgressReceipt(pack, 2, oneAnswer, 0);
  const newest = createPrivateProgressReceipt(pack, 2, twoAnswers, 1);

  // Hold the first File.text() promise until the second file has imported.
  // A stale completion formerly presented an overwrite prompt and could
  // erase the newer file's answer if the visitor accepted that prompt.
  await page.addInitScript(() => {
    const original = File.prototype.text;
    File.prototype.text = function () {
      if (this.name !== 'delayed-first.json') return original.call(this);
      return new Promise((resolve, reject) => {
        window.releaseDelayedImport = () => original.call(this).then(resolve, reject);
      });
    };
  });
  await page.goto('/the-community-lab/questionnaire/?season=2');
  const unexpectedPrompts = [];
  page.on('dialog', async dialog => {
    unexpectedPrompts.push(dialog.message());
    await dialog.accept(); // Expose destructive behavior in the old implementation.
  });

  const importInput = page.locator('#full-import-file');
  await importInput.setInputFiles({
    name: 'delayed-first.json',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify(slow)),
  });
  await expect.poll(() => page.evaluate(() => typeof window.releaseDelayedImport)).toBe('function');

  await importInput.setInputFiles({
    name: 'newest.json',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify(newest)),
  });
  await expect(page.locator('#full-count')).toContainText('已答 2 / 37');
  await expect(page.locator('#full-position')).toContainText('02 / 37');

  await page.evaluate(async () => {
    await window.releaseDelayedImport();
    await new Promise(resolve => setTimeout(resolve, 0));
  });
  await expect(page.locator('#full-count')).toContainText('已答 2 / 37');
  await expect(page.locator('#full-position')).toContainText('02 / 37');
  expect(unexpectedPrompts).toEqual([]);

  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.locator('#full-save').click(),
  ]);
  const exported = JSON.parse(await readFile(await download.path(), 'utf8'));
  expect(exported.selections.map(({ questionId, selectedValue }) => ({ questionId, selectedValue })))
    .toEqual([
      { questionId: first.id, selectedValue: first.options[0].value },
      { questionId: second.id, selectedValue: second.options[1].value },
    ]);
});

test('both complete seasons preserve every official source ID and raw option value through export and restore', async ({ page }) => {
  // 124 questions plus two export/import/edit cycles exceed Playwright's
  // 30-second unit-style default on real desktop/mobile CI browsers. Keep the
  // exhaustive privacy and source-value assertion instead of truncating it.
  test.setTimeout(180_000);
  // Synthetic option choices only; this browser never submits to the official website.
  const officialSubmissions = [];
  page.on('request', request => {
    if (request.method() === 'POST' && /thecommunity\.co\.kr|the-community-survey\.web\.app/.test(request.url())) {
      officialSubmissions.push(request.url());
    }
  });

  for (const season of [2, 1]) {
    const questions = sourceIndex.questions
      .filter(question => question.season === season)
      .sort((a, b) => a.displayPositionDerivedFromClient - b.displayPositionDerivedFromClient);
    const questionCount = season === 2 ? 37 : 87;
    expect(questions).toHaveLength(questionCount);

    await page.goto(`/the-community-lab/questionnaire/?season=${season}`);
    await expect(page.locator('#full-quiz')).toBeVisible();
    await expect(page.locator('#full-review-tools')).toBeHidden();
    const expectedSelections = [];

    for (const [position, question] of questions.entries()) {
      await expect(page.locator('#full-position')).toContainText(
        `第 ${String(position + 1).padStart(2, '0')} / ${questionCount} 题`,
      );
      await expect(page.locator('#full-group')).toContainText(`原题编号 ${question.sourceQuestionId}`);
      const choices = page.locator('.full-choice');
      await expect(choices).toHaveCount(question.optionCount);

      const choiceIndex = position % question.optionCount;
      await choices.nth(choiceIndex).click();
      await expect(choices.nth(choiceIndex)).toHaveAttribute('aria-checked', 'true');
      expectedSelections.push({
        questionId: question.sourceQuestionId,
        selectedValue: question.optionValues[choiceIndex],
      });
      await page.locator('#full-next').click();
    }

    await expect(page.locator('#full-done')).toBeVisible();
    await expect(page.locator('#full-done-description')).toContainText(`第 ${season} 季 ${questionCount} 道题已全部作答`);
    await expect(page.locator('#full-done')).toContainText('这里不显示官方分数或嘉宾匹配');

    // Every completed source value is directly auditable without exporting a
    // private JSON or inventing a score. This list remains local and collapsed.
    const audit = page.locator('#full-answer-audit');
    await expect(audit).not.toHaveAttribute('open', '');
    await audit.locator('summary').click();
    await expect(audit.locator('li')).toHaveCount(questionCount);
    await expect(audit.locator('li').first()).toContainText(`源题编号 ${questions[0].sourceQuestionId}`);
    await expect(audit.locator('li').first()).toContainText(`原始选项值：${String(expectedSelections[0].selectedValue)}`);
    await expect(audit.locator('li').last()).toContainText(`原始选项值：${String(expectedSelections.at(-1).selectedValue)}`);
    expect(await page.evaluate(() => document.documentElement.scrollWidth))
      .toBeLessThanOrEqual(page.viewportSize().width);
    await audit.locator('summary').click();

    const [download] = await Promise.all([
      page.waitForEvent('download'),
      page.locator('#full-download').click(),
    ]);
    expect(download.suggestedFilename()).toBe(`community-source-draft-season-${season}-answers.json`);
    const filePath = await download.path();
    expect(filePath).toBeTruthy();
    const receipt = JSON.parse(await readFile(filePath, 'utf8'));
    expect(receipt).toMatchObject({
      status: 'COMPLETED_ANSWERS_ONLY_NO_OFFICIAL_SCORING',
      season,
      questionCount,
      sourceSha256: sourceIndex.sourceAssetSha256,
      scoringVersion: 'UNKNOWN',
    });
    expect(receipt.selections.map(({ questionId, selectedValue }) => ({ questionId, selectedValue })))
      .toEqual(expectedSelections);
    expect(new Set(receipt.selections.map(x => x.questionId)).size).toBe(questionCount);
    expect(receipt.groups.reduce((sum, group) => sum + group.answered, 0)).toBe(questionCount);

    // A download event does not tell us whether the user kept the file.
    // The private-answer unload guard remains until they explicitly confirm.
    await expect(page.locator('#full-confirm-complete-backup')).toBeVisible();
    await expect(page.locator('#full-complete-backup-status')).toContainText('请检查文件确实存在');
    await page.locator('#full-confirm-complete-backup').click();
    await expect(page.locator('#full-complete-backup-status')).toContainText('已按你的确认标记为已备份');

    // A local download is never auto-persisted; importing the exact completed
    // receipt is the only way to restore the full session after a refresh.
    await page.reload();
    await expect(page.locator('#full-count')).toContainText(`已答 0 / ${questionCount}`);
    await page.locator('#full-import-file').setInputFiles(filePath);
    await expect(page.locator('#full-done')).toBeVisible();
    await expect(page.locator('#full-done-description')).toContainText(`第 ${season} 季 ${questionCount} 道题已全部作答`);

    // A finished private receipt must not trap users in an immutable summary.
    // Re-open without losing any earlier choices, edit the final source value,
    // and ensure the next export is recomputed rather than the stale receipt.
    await page.locator('#full-edit').click();
    await expect(page.locator('#full-quiz')).toBeVisible();
    await expect(page.locator('#full-review-tools')).toBeVisible();
    await expect(page.locator('#full-position')).toContainText(
      `第 ${questionCount} / ${questionCount} 题`,
    );
    await expect(page.locator('#full-count')).toContainText(`已答 ${questionCount} / ${questionCount}`);
    const lastQuestion = questions.at(-1);
    const oldChoiceIndex = (questionCount - 1) % lastQuestion.optionCount;
    const revisedChoiceIndex = (oldChoiceIndex + 1) % lastQuestion.optionCount;
    await expect(page.locator('.full-choice').nth(oldChoiceIndex)).toHaveAttribute('aria-checked', 'true');
    await page.locator('.full-choice').nth(revisedChoiceIndex).click();
    await page.locator('#full-next').click();
    await expect(page.locator('#full-done')).toBeVisible();
    const [revisedDownload] = await Promise.all([
      page.waitForEvent('download'),
      page.locator('#full-download').click(),
    ]);
    const revised = JSON.parse(await readFile(await revisedDownload.path(), 'utf8'));
    expect(revised.selections).toHaveLength(questionCount);
    expect(revised.selections.slice(0, -1).map(({ questionId, selectedValue }) => ({ questionId, selectedValue })))
      .toEqual(expectedSelections.slice(0, -1));
    expect(revised.selections.at(-1)).toMatchObject({
      questionId: lastQuestion.sourceQuestionId,
      selectedValue: lastQuestion.optionValues[revisedChoiceIndex],
    });

    // A completed 87-question receipt must also permit editing the FIRST
    // source question without 86 previous-clicks or walking forward again.
    await page.locator('#full-edit').click();
    await expect(page.locator('#full-review-tools')).toBeVisible();
    await page.locator('#full-jump-position').fill('0');
    await page.locator('#full-jump').click();
    await expect(page.locator('#full-jump-status')).toContainText(`1 至 ${questionCount}`);
    await expect(page.locator('#full-position')).toContainText(`第 ${questionCount} / ${questionCount} 题`);

    await page.locator('#full-jump-position').fill('1');
    await page.locator('#full-jump').click();
    const firstQuestion = questions[0];
    await expect(page.locator('#full-group')).toContainText(`原题编号 ${firstQuestion.sourceQuestionId}`);
    await expect(page.locator('.full-choice').first()).toHaveAttribute('aria-checked', 'true');
    await page.locator('.full-choice').nth(1).click();
    await expect(page.locator('#full-finish-review')).toBeEnabled();
    await page.locator('#full-finish-review').click();
    await expect(page.locator('#full-done')).toBeVisible();
    const [firstRevisedDownload] = await Promise.all([
      page.waitForEvent('download'),
      page.locator('#full-download').click(),
    ]);
    const firstRevised = JSON.parse(await readFile(await firstRevisedDownload.path(), 'utf8'));
    expect(firstRevised.selections.map(({ questionId, selectedValue }) => ({ questionId, selectedValue })))
      .toEqual([
        { questionId: firstQuestion.sourceQuestionId, selectedValue: firstQuestion.optionValues[1] },
        ...expectedSelections.slice(1, -1),
        { questionId: lastQuestion.sourceQuestionId, selectedValue: lastQuestion.optionValues[revisedChoiceIndex] },
      ]);
  }

  expect(officialSubmissions).toEqual([]);
});

test('a complete older-translation backup cannot regenerate a receipt until revised text is reconfirmed', async ({ page }) => {
  const pack = loadFullQuestionnaire();
  const questions = pack.seasons[2];
  const answers = Object.fromEntries(questions.map(q => [q.id, q.options[0].value]));
  const synthetic = createPrivateProgressReceipt(pack, 2, answers, questions.length - 1);
  // Only synthetic values from the published test pack. Deliberately simulate
  // an older editorial version; do not invent a new official score or POST.
  synthetic.selections[0].translationVersion = 'draft-0.0.0';

  const postedToOfficial = [];
  page.on('request', request => {
    if (request.method() === 'POST' && /thecommunity\.co\.kr|the-community-survey\.web\.app/.test(request.url())) {
      postedToOfficial.push(request.url());
    }
  });
  page.on('dialog', dialog => { void dialog.accept(); });
  await page.goto('/the-community-lab/questionnaire/');
  await page.locator('#full-import-file').setInputFiles({
    name: 'synthetic-complete-old-translation.json',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify(synthetic)),
  });
  await expect(page.locator('#full-quiz')).toBeVisible();
  await expect(page.locator('#full-review-tools')).toBeVisible();
  await expect(page.locator('#full-finish-review')).toBeDisabled();
  await expect(page.locator('#full-save-status')).toContainText('重新确认 1 道');
  await expect(page.locator('#full-group')).toContainText(`原题编号 ${questions[0].id}`);
  await page.locator('.full-choice').first().click();
  await expect(page.locator('#full-finish-review')).toBeEnabled();
  await page.locator('#full-finish-review').click();
  await expect(page.locator('#full-done')).toBeVisible();

  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.locator('#full-download').click(),
  ]);
  const restored = JSON.parse(await readFile(await download.path(), 'utf8'));
  expect(restored.selections).toHaveLength(37);
  expect(restored.selections[0]).toMatchObject({
    questionId: questions[0].id,
    selectedValue: questions[0].options[0].value,
    translationVersion: questions[0].translationVersion,
    translationFingerprint: questions[0].translationFingerprint,
  });
  expect(restored.selections.slice(1).map(x => x.selectedValue))
    .toEqual(questions.slice(1).map(q => q.options[0].value));
  expect(postedToOfficial).toEqual([]);
});

test('completed answer review supports Enter-to-jump without discarding private choices', async ({ page }) => {
  const pack = loadFullQuestionnaire();
  const questions = pack.seasons[2];
  const answers = Object.fromEntries(questions.map(q => [q.id, q.options[0].value]));
  const synthetic = createPrivateProgressReceipt(pack, 2, answers, questions.length - 1);
  page.on('dialog', dialog => { void dialog.accept(); });
  await page.goto('/the-community-lab/questionnaire/');
  await page.locator('#full-import-file').setInputFiles({
    name: 'synthetic-complete-answers.json',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify(synthetic)),
  });
  await expect(page.locator('#full-done')).toBeVisible();
  await page.locator('#full-edit').click();
  await expect(page.locator('#full-review-tools')).toBeVisible();
  await expect(page.locator('#full-position')).toContainText(`第 ${questions.length} / ${questions.length} 题`);
  await page.locator('#full-jump-position').fill('1');
  await page.locator('#full-jump-position').press('Enter');
  await expect(page.locator('#full-group')).toContainText(`原题编号 ${questions[0].id}`);
  await expect(page.locator('#full-finish-review')).toBeEnabled();
  await page.locator('#full-finish-review').click();
  await expect(page.locator('#full-done')).toBeVisible();
  const [download] = await Promise.all([
    page.waitForEvent('download'), page.locator('#full-download').click(),
  ]);
  const restored = JSON.parse(await readFile(await download.path(), 'utf8'));
  expect(restored.selections.map(x => [x.questionId, x.selectedValue]))
    .toEqual(questions.map(q => [q.id, q.options[0].value]));
});


test('legacy complete backup warns that Chinese wording is UNKNOWN until the answer is clicked again', async ({ page }) => {
  const pack = loadFullQuestionnaire();
  const questions = pack.seasons[2];
  const answers = Object.fromEntries(questions.map(q => [q.id, q.options[0].value]));
  const synthetic = createPrivateProgressReceipt(pack, 2, answers, questions.length - 1);
  delete synthetic.selections[0].translationFingerprint; // Older format did not capture text SHA.
  const warnings = [];
  page.on('dialog', dialog => {
    warnings.push(dialog.message());
    void dialog.accept();
  });
  const officialPosts = [];
  page.on('request', request => {
    if (request.method() === 'POST' && /thecommunity\.co\.kr/.test(request.url())) {
      officialPosts.push(request.url());
    }
  });
  await page.goto('/the-community-lab/questionnaire/');
  await page.locator('#full-import-file').setInputFiles({
    name: 'synthetic-legacy-with-unknown-wording.json',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify(synthetic)),
  });
  await expect(page.locator('#full-done')).toBeVisible();
  expect(warnings).toHaveLength(1);
  expect(warnings[0]).toContain('1 道答案没有历史中文文字指纹');
  await expect(page.locator('#full-done-description')).toContainText('1 道旧答案缺少历史中文文字指纹');

  const [legacyDownload] = await Promise.all([
    page.waitForEvent('download'), page.locator('#full-download').click(),
  ]);
  const legacyReceipt = JSON.parse(await readFile(await legacyDownload.path(), 'utf8'));
  expect(legacyReceipt.selections[0].translationFingerprint).toBeNull();
  expect(legacyReceipt.selections.map(s => s.selectedValue))
    .toEqual(questions.map(q => q.options[0].value));

  await page.locator('#full-edit').click();
  await page.locator('#full-jump-position').fill('1');
  await page.locator('#full-jump').click();
  await expect(page.locator('#full-save-status')).toContainText('缺少历史中文文字指纹');
  await page.locator('.full-choice').first().click(); // Genuine reconfirmation, not synthetic backfill.
  await expect(page.locator('#full-count')).not.toContainText('历史译文未知');
  await page.locator('#full-finish-review').click();
  await expect(page.locator('#full-done')).toBeVisible();
  await expect(page.locator('#full-done-description')).not.toContainText('缺少历史中文文字指纹');
  const [updatedDownload] = await Promise.all([
    page.waitForEvent('download'), page.locator('#full-download').click(),
  ]);
  const updated = JSON.parse(await readFile(await updatedDownload.path(), 'utf8'));
  expect(updated.selections[0].translationFingerprint).toBe(questions[0].translationFingerprint);
  expect(updated.selections.map(s => s.selectedValue))
    .toEqual(questions.map(q => q.options[0].value));
  expect(officialPosts).toEqual([]);
});

test('pending private import cannot undo a deliberate restart after file selection', async ({ page }) => {
  const pack = loadFullQuestionnaire();
  const q = pack.seasons[2][0];
  const previous = createPrivateProgressReceipt(
    pack, 2, { [q.id]: q.options[1].value }, 0,
    { [q.id]: q.translationVersion }, { [q.id]: q.translationFingerprint },
  );
  const completedAnswers = Object.fromEntries(pack.seasons[2].map(item => [item.id, item.options[0].value]));
  const completedVersions = Object.fromEntries(pack.seasons[2].map(item => [item.id, item.translationVersion]));
  const completedFingerprints = Object.fromEntries(pack.seasons[2].map(item => [item.id, item.translationFingerprint]));
  const completed = createPrivateProgressReceipt(
    pack, 2, completedAnswers, 36, completedVersions, completedFingerprints,
  );
  await page.addInitScript(() => {
    const originalText = File.prototype.text;
    File.prototype.text = function () {
      if (this.name !== 'delayed-local.json') return originalText.call(this);
      return new Promise((resolve, reject) => {
        window.releaseDelayedImport = () => originalText.call(this).then(resolve, reject);
      });
    };
  });
  await page.goto('/the-community-lab/questionnaire/?season=2');
  await page.locator('#full-import-file').setInputFiles({
    name: 'completed-local.json', mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify(completed)),
  });
  await expect(page.locator('#full-done')).toBeVisible();
  await page.locator('#full-import-file').setInputFiles({
    name: 'delayed-local.json', mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify(previous)),
  });
  await expect.poll(() => page.evaluate(() => typeof window.releaseDelayedImport)).toBe('function');

  const prompts = [];
  page.on('dialog', async dialog => {
    prompts.push(dialog.message());
    await dialog.accept();
  });
  await page.locator('#full-restart').click();
  await expect(page.locator('#full-count')).toContainText('已答 0 / 37');
  await page.evaluate(async () => {
    await window.releaseDelayedImport();
    await new Promise(resolve => setTimeout(resolve, 0));
  });
  await expect(page.locator('#full-count')).toContainText('已答 0 / 37');
  await expect(page.locator('#full-position')).toContainText('01 / 37');
  await expect(page.locator('#full-save')).toBeDisabled();
  expect(prompts).toHaveLength(1); // Only the deliberate restart, never a stale import.
});

test('pending private import cannot overwrite a newer clicked option', async ({ page }) => {
  const pack = loadFullQuestionnaire();
  const q = pack.seasons[2][0];
  const previous = createPrivateProgressReceipt(
    pack, 2, { [q.id]: q.options[1].value }, 0,
    { [q.id]: q.translationVersion }, { [q.id]: q.translationFingerprint },
  );
  await page.addInitScript(() => {
    const originalText = File.prototype.text;
    File.prototype.text = function () {
      if (this.name !== 'delayed-local.json') return originalText.call(this);
      return new Promise((resolve, reject) => {
        window.releaseDelayedImport = () => originalText.call(this).then(resolve, reject);
      });
    };
  });
  await page.goto('/the-community-lab/questionnaire/?season=2');
  const prompts = [];
  page.on('dialog', async dialog => {
    prompts.push(dialog.message());
    await dialog.accept(); // Would expose overwritten answers in the old code.
  });
  await page.locator('#full-import-file').setInputFiles({
    name: 'delayed-local.json', mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify(previous)),
  });
  await expect.poll(() => page.evaluate(() => typeof window.releaseDelayedImport)).toBe('function');
  await page.locator('.full-choice').first().click();
  await expect(page.locator('.full-choice').first()).toHaveAttribute('aria-checked', 'true');

  await page.evaluate(async () => {
    await window.releaseDelayedImport();
    await new Promise(resolve => setTimeout(resolve, 0));
  });
  await expect(page.locator('.full-choice').first()).toHaveAttribute('aria-checked', 'true');
  expect(prompts).toEqual([]);

  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.locator('#full-save').click(),
  ]);
  const exported = JSON.parse(await readFile(await download.path(), 'utf8'));
  expect(exported.selections.find(x => x.questionId === q.id)?.selectedValue).toBe(q.options[0].value);
});

test('finished private seasons reopen on their completed answer record without changing source choices', async ({ page }) => {
  const pack = loadFullQuestionnaire();
  const requests = [];
  page.on('request', request => {
    if (request.method() !== 'GET' && /thecommunity\\.co\\.kr/.test(request.url())) {
      requests.push(request.url());
    }
  });
  await page.goto('/the-community-lab/questionnaire/');

  // Restore both seasons in the SAME tab to exercise the per-season memory map.
  // These are local synthetic choices, never real visitors or official results.
  for (const season of [2, 1]) {
    const questions = pack.seasons[season];
    const answers = Object.fromEntries(questions.map(q => [q.id, q.options[0].value]));
    const receipt = createPrivateProgressReceipt(pack, season, answers, questions.length - 1);
    await page.locator('#full-import-file').setInputFiles({
      name: `synthetic-season-${season}-completed.json`,
      mimeType: 'application/json',
      buffer: Buffer.from(JSON.stringify(receipt)),
    });
    await expect(page.locator('#full-done')).toBeVisible();
    await expect(page.locator('#full-done-description')).toContainText(
      `第 ${season} 季 ${questions.length} 道题已全部作答`,
    );
    await page.locator('#full-back').click();
    await expect(page.locator(`[data-season-progress="${season}"]`))
      .toContainText(`已完成 ${questions.length} / ${questions.length}`);
  }

  // An already completed session must not reopen at the final question.
  for (const season of [2, 1]) {
    await page.locator(`[data-start-season="${season}"]`).click();
    await expect(page.locator('#full-done')).toBeVisible();
    await expect(page.locator('#full-quiz')).toBeHidden();
    await expect(page.locator('#full-done-description')).toContainText(
      `第 ${season} 季 ${pack.seasons[season].length} 道题已全部作答`,
    );
    const [download] = await Promise.all([
      page.waitForEvent('download'), page.locator('#full-download').click(),
    ]);
    const restored = JSON.parse(await readFile(await download.path(), 'utf8'));
    expect(restored.selections.map(x => [x.questionId, x.selectedValue]))
      .toEqual(pack.seasons[season].map(q => [q.id, q.options[0].value]));
    await page.locator('#full-back').click();
  }

  // Editing the completed record must still open the actual source question.
  await page.locator('[data-start-season="2"]').click();
  await page.locator('#full-edit').click();
  await expect(page.locator('#full-quiz')).toBeVisible();
  await expect(page.locator('#full-review-tools')).toBeVisible();
  await page.locator('#full-exit').click();
  await expect(page.locator('[data-season-progress="2"]')).toContainText('继续');
  await page.locator('[data-start-season="2"]').click();
  await expect(page.locator('#full-quiz')).toBeVisible();
  expect(requests).toEqual([]);
});

test('legacy completed answer audit marks unknown historic Chinese wording per row until reconfirmed', async ({ page }) => {
  const pack = loadFullQuestionnaire();
  const questions = pack.seasons[2];
  const answers = Object.fromEntries(questions.map(q => [q.id, q.options[0].value]));
  const receipt = createPrivateProgressReceipt(pack, 2, answers, questions.length - 1);
  // Synthetic older backup: raw choice is known but the exact Chinese wording
  // visible when it was selected is not. Never fabricate a current hash.
  receipt.selections[10].translationFingerprint = null;
  const outboundWrites = [];
  page.on('request', request => {
    if (request.method() !== 'GET') outboundWrites.push(request.url());
  });
  const warnings = [];
  page.on('dialog', async dialog => {
    warnings.push(dialog.message());
    await dialog.accept();
  });
  await page.goto('/the-community-lab/questionnaire/');
  await page.locator('#full-import-file').setInputFiles({
    name: 'synthetic-legacy-missing-wording-hash.json',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify(receipt)),
  });
  await expect(page.locator('#full-done')).toBeVisible();
  expect(warnings).toHaveLength(1);
  expect(warnings[0]).toContain('没有历史中文文字指纹');
  await page.locator('#full-answer-audit summary').click();
  const rows = page.locator('#full-answer-audit-list li');
  await expect(rows).toHaveCount(37);
  await expect(rows.nth(10).locator('.full-answer-audit-provenance'))
    .toContainText('不能证明答题当时看到的中文与今天相同');
  await expect(rows.nth(9).locator('.full-answer-audit-provenance')).toHaveCount(0);
  await rows.nth(10).getByRole('button', { name: '修改第 11 题' }).click();
  await expect(page.locator('#full-quiz')).toBeVisible();
  // An intentional re-selection of this same option confirms the new wording.
  await page.locator('.full-choice').first().click();
  await page.locator('#full-finish-review').click();
  await expect(page.locator('#full-done')).toBeVisible();
  await page.locator('#full-answer-audit summary').click();
  await expect(page.locator('#full-answer-audit-list .full-answer-audit-provenance')).toHaveCount(0);
  expect(outboundWrites).toEqual([]);
});
