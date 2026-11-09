import { test, expect } from '@playwright/test';
import {
  makeTemporaryBilingualCandidate, inspectTemporaryBilingualVisual,
} from '../scripts/probe-bilingual-visual-readonly.mjs';

const synthetic = [{
  id: 'synthetic-s2-1',
  sourceKo: '합성 질문입니다.',
  draftZh: '这是合成问题。',
  options: [
    { value: 'O', ko: '동의', zh: '赞同' },
    { value: 'X', ko: '반대', zh: '反对' },
  ],
}];

async function createHost(page) {
  await page.setContent([
    '<!doctype html><html lang="ko"><head>',
    '<meta name="viewport" content="width=device-width,initial-scale=1">',
    '<style>body{margin:0;padding:12px}.question{max-width:600px;margin:auto}',
    'button{display:block;width:100%;min-height:44px}</style></head><body>',
    '<section class="question"><h1>Q.합성 질문입니다.</h1>',
    '<button data-secret-raw="O"><span>동의</span></button>',
    '<button data-secret-raw="X"><span>반대</span></button>',
    '</section><output id="out"></output></body></html>',
  ].join(''));
  await page.evaluate(() => {
    document.querySelectorAll('.question button').forEach(button => {
      button.addEventListener('click', () => {
        document.querySelector('#out').textContent = button.dataset.secretRaw;
      });
    });
  });
}

test('synthetic Korean-first Chinese-after preview is inert and fully removed', async ({ page }) => {
  const requests = [];
  page.on('request', request => requests.push(request.url()));
  await createHost(page);
  const before = await page.locator('.question').evaluate(section => section.innerHTML);
  const candidate = makeTemporaryBilingualCandidate({
    headingText: 'Q.합성 질문입니다.', optionLabels: ['동의', '반대'],
  }, synthetic);
  expect(candidate).not.toBeNull();
  const result = await page.evaluate(inspectTemporaryBilingualVisual, candidate);
  expect(result).toMatchObject({
    passed: true, labelsRendered: 3, koreanFirstChineseAfter: true,
    originalControlsUnchanged: true, cleanupComplete: true, overflowPx: 0,
  });
  expect(await page.locator('.question').evaluate(section => section.innerHTML)).toBe(before);
  await expect(page.locator('[data-temporary-bilingual-visual-probe]')).toHaveCount(0);
  await page.locator('.question button').last().click();
  await expect(page.locator('#out')).toHaveText('X');
  expect(requests).toEqual([]);
});

test('missing source identity, changed Korean wording and reordered options fail closed', async ({ page }) => {
  await createHost(page);
  expect(makeTemporaryBilingualCandidate({
    headingText: 'Q.다른 질문입니다.', optionLabels: ['동의', '반대'],
  }, synthetic)).toBeNull();
  expect(makeTemporaryBilingualCandidate({
    headingText: 'Q.합성 질문입니다.', optionLabels: ['반대', '동의'],
  }, synthetic)).toBeNull();
  const candidate = makeTemporaryBilingualCandidate({
    headingText: 'Q.합성 질문입니다.', optionLabels: ['동의', '반대'],
  }, synthetic);
  await page.locator('.question button').last().locator('span').evaluate(node => {
    node.textContent = '바뀐';
  });
  const before = await page.locator('.question').evaluate(section => section.innerHTML);
  expect(await page.evaluate(inspectTemporaryBilingualVisual, candidate))
    .toMatchObject({ passed: false, reason: 'BLOCKED_DOM_DRIFT', labelsRendered: 0 });
  expect(await page.locator('.question').evaluate(section => section.innerHTML)).toBe(before);
  await expect(page.locator('[data-temporary-bilingual-visual-probe]')).toHaveCount(0);
});

test('blank Korean option captions still require original ordered identity', async ({ page }) => {
  await createHost(page);
  await page.locator('.question button').first().locator('span').evaluate(node => {
    node.textContent = '';
  });
  const entries = [{
    ...synthetic[0],
    options: [
      { value: 2, ko: '', zh: '略不同意' },
      { value: 5, ko: '반대', zh: '反对' },
    ],
  }];
  const candidate = makeTemporaryBilingualCandidate({
    headingText: 'Q.합성 질문입니다.', optionLabels: ['', '반대'],
  }, entries);
  expect(candidate).not.toBeNull();
  const result = await page.evaluate(inspectTemporaryBilingualVisual, candidate);
  expect(result.passed).toBe(true);
  expect(result.cleanupComplete).toBe(true);
});
test('synthetic labels remain visible through host click, return, changed choice and re-render', async ({ page }) => {
  const requests = [];
  page.on('request', req => requests.push(req.url()));
  await createHost(page);
  await page.evaluate(() => {
    const section = document.querySelector('.question');
    const installFirstQuestion = () => {
      section.innerHTML = [
        '<h1>Q.합성 질문입니다.</h1>',
        '<button data-secret-raw="O"><span>동의</span></button>',
        '<button data-secret-raw="X"><span>반대</span></button>',
      ].join('');
      section.querySelectorAll('button').forEach(button => {
        button.addEventListener('click', () => {
          const evidence = {
            value: button.dataset.secretRaw,
            visibleChineseSiblingLabels:
              section.querySelectorAll('[data-temporary-bilingual-visual-probe]').length,
            originalKoreanLabel: button.querySelector('span')?.textContent,
          };
          window.syntheticClicks = [...(window.syntheticClicks || []), evidence];
          section.innerHTML = '<button class="back">뒤로</button><h1>Q.다음 질문입니다.</h1>' +
            '<button data-secret-raw="O"><span>예</span></button>' +
            '<button data-secret-raw="X"><span>아니요</span></button>';
          section.querySelector('.back').addEventListener('click', installFirstQuestion);
        });
      });
    };
    installFirstQuestion();
  });
  const candidate = makeTemporaryBilingualCandidate({
    headingText: 'Q.합성 질문입니다.', optionLabels: ['동의', '반대'],
  }, synthetic);
  const first = await page.evaluate(inspectTemporaryBilingualVisual, {
    ...candidate, nonFinalSourcePositionVerified: true, clickWhileRenderedIndex: 0,
  });
  expect(first).toMatchObject({
    passed: true, clickTriggeredWithLabels: true, cleanupComplete: true,
    originalControlsUnchanged: true,
  });
  await expect(page.locator('.question h1')).toHaveText('Q.다음 질문입니다.');
  await expect(page.locator('[data-temporary-bilingual-visual-probe]')).toHaveCount(0);

  await page.locator('.question button.back').click();
  await expect(page.locator('.question h1')).toHaveText('Q.합성 질문입니다.');
  const second = await page.evaluate(inspectTemporaryBilingualVisual, {
    ...candidate, nonFinalSourcePositionVerified: true, clickWhileRenderedIndex: 1,
  });
  expect(second).toMatchObject({
    passed: true, clickTriggeredWithLabels: true, cleanupComplete: true,
  });
  await expect(page.locator('.question h1')).toHaveText('Q.다음 질문입니다.');
  const observations = await page.evaluate(() => window.syntheticClicks);
  expect(observations).toEqual([
    { value: 'O', visibleChineseSiblingLabels: 3, originalKoreanLabel: '동의' },
    { value: 'X', visibleChineseSiblingLabels: 3, originalKoreanLabel: '반대' },
  ]);
  await expect(page.locator('[data-temporary-bilingual-visual-probe]')).toHaveCount(0);
  expect(requests).toEqual([]);
});

test('research click rejects absent non-final proof, bad index, and altered option before host interaction', async ({ page }) => {
  await createHost(page);
  const candidate = makeTemporaryBilingualCandidate({
    headingText: 'Q.합성 질문입니다.', optionLabels: ['동의', '반대'],
  }, synthetic);
  for (const extra of [
    { clickWhileRenderedIndex: 0 },
    { nonFinalSourcePositionVerified: true, clickWhileRenderedIndex: 2 },
    { nonFinalSourcePositionVerified: true, clickWhileRenderedIndex: -1 },
  ]) {
    expect(await page.evaluate(inspectTemporaryBilingualVisual, { ...candidate, ...extra }))
      .toMatchObject({ passed: false, reason: 'BLOCKED_UNSAFE_INTERACTION', labelsRendered: 0 });
  }
  expect(await page.locator('#out').textContent()).toBe('');
  await page.locator('.question button').first().locator('span')
    .evaluate(node => { node.textContent = '변경됨'; });
  const drift = await page.evaluate(inspectTemporaryBilingualVisual, {
    ...candidate, nonFinalSourcePositionVerified: true, clickWhileRenderedIndex: 0,
  });
  expect(drift).toMatchObject({ passed: false, reason: 'BLOCKED_DOM_DRIFT', labelsRendered: 0 });
  expect(await page.locator('#out').textContent()).toBe('');
  await expect(page.locator('[data-temporary-bilingual-visual-probe]')).toHaveCount(0);
});
