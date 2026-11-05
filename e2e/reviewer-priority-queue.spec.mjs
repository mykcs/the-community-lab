import { expect, test } from '@playwright/test';

const url=new URL('../docs/original-question-translation-review/index.html',import.meta.url).href;

test('priority filter exposes 27 reviewer candidates and composes with season and search',async ({page})=>{
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto(url);
  await expect(page.locator('#count')).toHaveText('显示 124 / 124 题');
  await expect(page.locator('#priorityFilter')).toBeEnabled();
  await page.locator('#priorityFilter').selectOption('priority');
  await expect(page.locator('#count')).toHaveText('显示 27 / 124 题');
  await expect(page.locator('#list .card')).toHaveCount(27);
  const ids=await page.locator('#list .card h2').allTextContents();
  expect(ids.some(x=>x.includes('rp03'))).toBeTruthy();
  await page.locator('#season').selectOption('2');
  const secondSeasonCount=await page.locator('#list .card').count();
  expect(secondSeasonCount).toBeGreaterThan(0);
  expect(secondSeasonCount).toBeLessThan(27);
  await page.locator('#search').fill('rp03');
  await expect(page.locator('#count')).toHaveText('显示 1 / 124 题');
  await page.locator('#search').fill('no-such-review-question');
  await expect(page.locator('#count')).toHaveText('显示 0 / 124 题');
  await expect(page.locator('#list')).toContainText('没有符合条件的题目');
  await page.locator('#search').fill('');
  await page.locator('#priorityFilter').selectOption('all');
  await page.locator('#season').selectOption('all');
  await expect(page.locator('#count')).toHaveText('显示 124 / 124 题');
  const dimensions=await page.evaluate(()=>({body:document.documentElement.scrollWidth,viewport:window.innerWidth}));
  expect(dimensions.body).toBeLessThanOrEqual(dimensions.viewport+1);
  expect(errors).toEqual([]);
});

test('priority filtering never discards a synthetic unsaved reviewer edit',async ({page})=>{
  await page.goto(url);
  await page.locator('#priorityFilter').selectOption('priority');
  const option=page.getByLabel('rp03 中文翻译');
  await option.fill('本地合成译审注记：仅验证过滤后的保留状态');
  await page.locator('#priorityFilter').selectOption('all');
  await page.locator('#priorityFilter').selectOption('priority');
  await expect(page.getByLabel('rp03 中文翻译')).toHaveValue('本地合成译审注记：仅验证过滤后的保留状态');
  const [download]=await Promise.all([page.waitForEvent('download'),page.locator('#export').click()]);
  expect(download.suggestedFilename()).toBe('original-question-translation-review.json');
});
