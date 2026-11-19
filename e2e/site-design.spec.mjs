import { expect, test } from '@playwright/test';
import { readdirSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

function inventory(dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap(entry => {
    const file = path.join(dir, entry.name);
    return entry.isDirectory() ? inventory(file) : file.endsWith('.html') ? [file] : [];
  }).sort();
}
const routes = inventory('dist').map(file => ({ file, url: '/the-community-lab/' + file.slice(5).replace(/index\.html$/, '') }));
routes.push(...['translation-review', 'original-question-translation-review'].map(route => ({ file: `offline-${route}`, url: pathToFileURL(path.resolve(`docs/${route}/index.html`)).href })));

async function assertPresentation(page) {
  const result = await page.evaluate(() => {
    const style = getComputedStyle(document.body);
    const root = getComputedStyle(document.documentElement);
    return { version: root.getPropertyValue('--community-design-version').trim(), family: style.fontFamily, size: style.fontSize, leading: style.lineHeight,
      overflow: document.documentElement.scrollWidth - innerWidth,
      clipped: [...document.querySelectorAll('h1,h2,h3,p,button,summary')].filter(el => {
        const r=el.getBoundingClientRect(),s=getComputedStyle(el);
        return r.height>0 && ['hidden','clip'].includes(s.overflowX) && el.scrollWidth>el.clientWidth+2;
      }).map(el => ({tag:el.tagName,class:el.className})) };
  });
  expect(result.version).toBe('1');
  expect(result.family).toContain('Inter');
  expect(result.size).toBe('16px');
  expect(parseFloat(result.leading)).toBeCloseTo(26.4, 1);
  expect(result.overflow).toBeLessThanOrEqual(1);
  expect(result.clipped).toEqual([]);
  return result;
}

async function proveConsumers(page, reviewer, questionnaire) {
  const probes=await page.evaluate(async ({reviewer,questionnaire}) => {
    const root=document.documentElement;
    const spacing=document.querySelector(reviewer?'.cardbody':questionnaire?'.full-shell':'.hero-copy');
    const width=document.querySelector(reviewer?'.wrap':questionnaire?'.full-shell':'.page-shell');
    const targetTokens=[
      ['--font-ui','monospace',document.body,'fontFamily'],
      ['--type-body','18px',document.body,'fontSize'],
      ['--leading-body','2',document.body,'lineHeight'],
      ['--space-unit','.5rem',spacing,reviewer?'paddingLeft':'paddingTop'],
      [reviewer||questionnaire?'--width-content':'--width-site','20rem',width,'width'],
    ];
    const rows=[];
    for(const [token,value,element,property] of targetTokens){
      if(!element)throw new Error(`Missing real consumer ${token}`);
      const before=getComputedStyle(element)[property],old=root.style.getPropertyValue(token);
      root.style.setProperty(token,value);
      await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));
      const after=getComputedStyle(element)[property];
      if(old)root.style.setProperty(token,old);else root.style.removeProperty(token);
      await new Promise(resolve=>requestAnimationFrame(resolve));
      rows.push({token,property,before,after,changed:before!==after});
    }
    return rows;
  },{reviewer,questionnaire});
  expect(probes.every(probe=>probe.changed),JSON.stringify(probes)).toBe(true);
  return probes;
}

for (const route of routes) test(`shared site design ${route.file}`, async ({page},info)=>{
  const errors=[];page.on('pageerror',error=>errors.push(error.message));
  await page.goto(route.url);
  const reviewer=route.file.includes('translation-review');
  const questionnaire=route.file.includes('questionnaire');
  if(reviewer)await expect(page.locator('#list .card')).toHaveCount(124);
  const initial=await assertPresentation(page);
  const consumers=await proveConsumers(page,reviewer,questionnaire);
  await assertPresentation(page);
  if(questionnaire){
    await page.locator('[data-start-season="2"]').click();
    await expect(page.locator('#full-ko')).toBeVisible();
    await page.locator('.full-evidence summary').click();
    await assertPresentation(page);
    await expect(page.locator('#full-source-fingerprint')).toContainText('2026-10-30');
  }else if(reviewer){
    await page.getByLabel('筛选季别').selectOption('2');
    await expect(page.locator('#list .card')).toHaveCount(37);
    await assertPresentation(page);
  }
  await info.attach('actual-consumers',{body:JSON.stringify({route,initial,consumers}),contentType:'application/json'});
  await info.attach('rendered-page',{body:await page.screenshot({fullPage:!reviewer}),contentType:'image/png'});
  expect(errors).toEqual([]);
});
