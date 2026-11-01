import { readFileSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { expect, test } from '@playwright/test';
import { loadFullQuestionnaire } from '../scripts/load-full-questionnaire.mjs';
import { createPrivateProgressReceipt } from '../lib/full-questionnaire.mjs';

const sourceIndex = JSON.parse(readFileSync(new URL('../data/original-question-index.json', import.meta.url), 'utf8'));

test('both complete seasons preserve every official source ID and raw option value through export and restore', async ({ page }) => {
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
      await expect(choices.nth(choiceIndex)).toHaveAttribute('aria-pressed', 'true');
      expectedSelections.push({
        questionId: question.sourceQuestionId,
        selectedValue: question.optionValues[choiceIndex],
      });
      await page.locator('#full-next').click();
    }

    await expect(page.locator('#full-done')).toBeVisible();
    await expect(page.locator('#full-done-description')).toContainText(`第 ${season} 季 ${questionCount} 道题已全部作答`);
    await expect(page.locator('#full-done')).toContainText('这里不显示官方分数或嘉宾匹配');

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
    await expect(page.locator('.full-choice').nth(oldChoiceIndex)).toHaveAttribute('aria-pressed', 'true');
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
    await expect(page.locator('.full-choice').first()).toHaveAttribute('aria-pressed', 'true');
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
