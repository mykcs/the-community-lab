import { expect, test } from '@playwright/test';
import { fileURLToPath } from 'node:url';

// This intentionally uses ONLY invented Korean/Chinese strings and an
// independent fake host; it does not visit the actual program's site.
const scriptPath = fileURLToPath(new URL('../prototypes/official-overlay/overlay.js', import.meta.url));
const entries = [{
  sourceId: 'synthetic-s2-001',
  ko: '이것은 테스트용 질문입니다.',
  zh: '这是一道专为测试编写的合成题。',
  options: [
    { value: 'O', ko: '동의', zh: '赞同' },
    { value: 'X', ko: '반대', zh: '反对' },
  ],
}];

async function fixture(page) {
  await page.setContent([
    '<!doctype html><html lang="ko"><head>',
    '<meta name="viewport" content="width=device-width,initial-scale=1">',
    '<style>body{margin:0;padding:16px;font:16px sans-serif}main{max-width:760px;margin:auto}',
    'button{display:block;width:100%;text-align:left;margin:12px 0;padding:15px;box-sizing:border-box}',
    '</style></head><body><main id="fixture"><section data-source-question-id="synthetic-s2-001">',
    '<p data-source-ko-question>이것은 테스트용 질문입니다.</p>',
    '<button type="button" data-source-option-value="O"><span data-source-ko-option>동의</span></button>',
    '<button type="button" data-source-option-value="X"><span data-source-ko-option>반대</span></button>',
    '</section><output id="host-output"></output></main></body></html>',
  ].join(''));
  await page.evaluate(() => {
    window.hostChoices = [];
    for (const button of document.querySelectorAll('[data-source-option-value]')) {
      button.addEventListener('click', () => {
        window.hostChoices.push(button.getAttribute('data-source-option-value'));
        document.getElementById('host-output').textContent = window.hostChoices.at(-1);
      });
    }
  });
  await page.addScriptTag({ path: scriptPath });
}

test('bilingual overlay preserves original O/X values, host clicks, and DOM order without network calls', async ({ page }) => {
  const requests = [];
  page.on('request', request => requests.push(request.url()));
  await fixture(page);
  await page.evaluate(data => {
    window.activeOverlayProbe = window.CommunityOfficialOverlayProbe.install({
      root: document.querySelector('#fixture'), entries: data,
    });
  }, entries);
  const section = page.locator('[data-source-question-id="synthetic-s2-001"]');
  await expect(section.locator('[data-translation-overlay-probe]')).toHaveCount(3);
  await expect(section.locator('[data-translation-overlay-probe]').first())
    .toHaveText('这是一道专为测试编写的合成题。');
  const question = section.locator('[data-source-ko-question]');
  await expect(question).toHaveText(entries[0].ko);
  await expect(question.locator('[data-translation-overlay-probe]')).toHaveCount(0);
  for (const [index, option] of entries[0].options.entries()) {
    const button = section.locator('button').nth(index);
    await expect(button).toHaveAttribute('data-source-option-value', option.value);
    await expect(button.locator('[data-source-ko-option]')).toHaveText(option.ko);
    await expect(button.locator('[data-translation-overlay-probe]')).toHaveText(option.zh);
  }
  await section.locator('button').nth(1).click();
  await expect(page.locator('#host-output')).toHaveText('X');
  expect(await page.evaluate(() => window.hostChoices)).toEqual(['X']);
  expect(requests).toEqual([]);
  expect(await page.evaluate(() => document.documentElement.scrollWidth))
    .toBeLessThanOrEqual(page.viewportSize().width);
});

test('source text, identity and value drift remove translations, never fabricate parity', async ({ page }) => {
  await fixture(page);
  await page.evaluate(data => {
    window.activeOverlayProbe = window.CommunityOfficialOverlayProbe.install({
      root: document.querySelector('#fixture'), entries: data,
    });
  }, entries);
  const section = page.locator('[data-source-question-id]');
  const injected = section.locator('[data-translation-overlay-probe]');
  await expect(injected).toHaveCount(3);
  await section.locator('[data-source-ko-question]').evaluate(el => { el.textContent = '다른 질문'; });
  await expect(injected).toHaveCount(0);
  await section.locator('[data-source-ko-question]').evaluate(el => {
    el.textContent = '이것은 테스트용 질문입니다.';
  });
  await expect(injected).toHaveCount(3);
  await section.locator('button').nth(0).evaluate(el => { el.setAttribute('data-source-option-value', 'X'); });
  await expect(injected).toHaveCount(0);
  await section.locator('button').nth(0).evaluate(el => { el.setAttribute('data-source-option-value', 'O'); });
  await expect(injected).toHaveCount(3);
  await section.evaluate(el => el.setAttribute('data-source-question-id', 'unknown-version'));
  await expect(injected).toHaveCount(0);
  await page.evaluate(() => window.activeOverlayProbe.stop());
  await section.evaluate(el => el.setAttribute('data-source-question-id', 'synthetic-s2-001'));
  await expect(injected).toHaveCount(0);
});

test('rejects altered or duplicated original values and does not inject on a mismatched source', async ({ page }) => {
  await fixture(page);
  const invalid = structuredClone(entries);
  invalid[0].options[1].value = 'O';
  const message = await page.evaluate(data => {
    try {
      window.CommunityOfficialOverlayProbe.install({
        root: document.querySelector('#fixture'), entries: data,
      });
      return null;
    } catch (error) {
      return String(error.message);
    }
  }, invalid);
  expect(message).toMatch(/duplicate source option value/);
  await expect(page.locator('[data-translation-overlay-probe]')).toHaveCount(0);
  await page.locator('button').nth(0).evaluate(el => {
    el.querySelector('[data-source-ko-option]').textContent = '원문 업데이트';
  });
  await page.evaluate(data => {
    window.activeOverlayProbe = window.CommunityOfficialOverlayProbe.install({
      root: document.querySelector('#fixture'), entries: data,
    });
  }, entries);
  await expect(page.locator('[data-translation-overlay-probe]')).toHaveCount(0);
});

test('removing a source question identity or unmounting a section clears stale Chinese labels', async ({ page }) => {
  await fixture(page);
  await page.evaluate(data => {
    window.activeOverlayProbe = window.CommunityOfficialOverlayProbe.install({
      root: document.querySelector('#fixture'), entries: data,
    });
  }, entries);
  const section = page.locator('section');
  const labels = section.locator('[data-translation-overlay-probe]');
  await expect(labels).toHaveCount(3);

  // A host re-render may temporarily remove, not merely change, the source ID.
  // The overlay must not leave verified-looking Chinese text on an unknown item.
  await section.evaluate(el => el.removeAttribute('data-source-question-id'));
  await expect(labels).toHaveCount(0);

  await section.evaluate(el => el.setAttribute('data-source-question-id', 'synthetic-s2-001'));
  await expect(labels).toHaveCount(3);

  // Host routing can move an already-translated section outside the observed root.
  // Cleanup must cover that previously translated element as well.
  await section.evaluate(el => document.body.append(el));
  await expect(labels).toHaveCount(0);
  await page.evaluate(() => window.activeOverlayProbe.stop());
  await expect(labels).toHaveCount(0);
});

test('research overlay never changes or deletes host-owned nodes sharing its marker', async ({ page }) => {
  await fixture(page);
  const section = page.locator('[data-source-question-id]');
  // A host component or another probe can legally use the same public attribute.
  await section.locator('[data-source-ko-question]').evaluate(source => {
    const host = document.createElement('span');
    host.setAttribute('data-translation-overlay-probe', '');
    host.id = 'host-owned-annotation';
    host.textContent = 'HOST MUST REMAIN';
    source.after(host);
  });
  await page.evaluate(data => {
    window.activeOverlayProbe = window.CommunityOfficialOverlayProbe.install({
      root: document.querySelector('#fixture'), entries: data,
    });
  }, entries);
  await expect(page.locator('#host-owned-annotation')).toHaveText('HOST MUST REMAIN');
  await expect(section.locator('[data-translation-overlay-probe]')).toHaveCount(4);
  await section.locator('[data-source-ko-question]').evaluate(source => { source.textContent = '변경'; });
  await expect(section.locator('[data-translation-overlay-probe]')).toHaveCount(1);
  await expect(page.locator('#host-owned-annotation')).toHaveText('HOST MUST REMAIN');
  await page.evaluate(() => window.activeOverlayProbe.stop());
  await expect(page.locator('#host-owned-annotation')).toHaveText('HOST MUST REMAIN');
});

test('host reparenting an overlay label does not strand or duplicate its translation', async ({ page }) => {
  await fixture(page);
  await page.evaluate(data => {
    window.activeOverlayProbe = window.CommunityOfficialOverlayProbe.install({
      root: document.querySelector('#fixture'), entries: data,
    });
  }, entries);
  const section = page.locator('[data-source-question-id]');
  await expect(section.locator('[data-translation-overlay-probe]')).toHaveCount(3);
  await section.locator('[data-source-ko-question]').evaluate(source => {
    document.getElementById('host-output').append(source.nextElementSibling);
  });
  await expect(section.locator('[data-translation-overlay-probe]')).toHaveCount(3);
  await expect(page.locator('#host-output [data-translation-overlay-probe]')).toHaveCount(0);
  await page.evaluate(() => window.activeOverlayProbe.stop());
  await expect(section.locator('[data-translation-overlay-probe]')).toHaveCount(0);
});
