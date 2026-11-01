import { readFileSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { expect, test } from '@playwright/test';

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
  }

  expect(officialSubmissions).toEqual([]);
});
