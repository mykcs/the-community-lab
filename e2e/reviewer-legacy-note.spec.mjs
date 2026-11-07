import { readFileSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { expect, test } from '@playwright/test';

const target='s1-politics-01'; // S1 six-choice question; source Korean levels 2/5 are blank.
const paths=['../docs/translation-review/index.html','../docs/original-question-translation-review/index.html'];
function fixture(path){
  const url=new URL(path,import.meta.url);
  const raw=readFileSync(url,'utf8');
  const pack=JSON.parse(raw.split('<script id="embedded-data" type="application/json">')[1].split('</script>')[0]);
  return {url:url.href,pack,key:'community-lab-question-review-v1:'+pack.source.asset_sha256};
}
async function exportedQuestion(page){
  const [download]=await Promise.all([page.waitForEvent('download'),page.locator('#export').click()]);
  const data=JSON.parse(await readFile(await download.path(),'utf8'));
  return data.questions.find(q=>q.id===target);
}
for(const path of paths){
  const {url,key}=fixture(path);
  test(path+' restores old changed-text PASS as pending without discarding edits',async({page})=>{
    const old={[target]:{translation:'合成旧版变更的中文题干',review:'pass',note:'合成旧备注：对应版本未知'}};
    await page.addInitScript(({k,v})=>localStorage.setItem(k,JSON.stringify(v)),{k:key,v:old});
    await page.goto(url);
    const status=page.getByLabel(target+' 复核状态'),note=page.getByLabel(target+' 审校备注');
    await expect(page.getByLabel(target+' 中文翻译')).toHaveValue(old[target].translation);
    await expect(note).toHaveValue(old[target].note);
    await expect(status).toHaveValue('pending');
    await status.selectOption('pass');
    await expect(status).toHaveValue('pending');
    const before=await exportedQuestion(page);
    expect(before.human_review_note_stale).toBe(true);
    await note.fill('合成新备注：已核查当前文字');
    await status.selectOption('pass');
    await expect(status).toHaveValue('pass');
    const after=await exportedQuestion(page);
    expect(after.human_review_note_stale).toBe(false);
  });
}

test('legacy imported changed-text PASS without freshness flag is downgraded',async({page})=>{
  const {url,pack}=fixture(paths[0]);
  const old=structuredClone(pack),q=old.questions.find(q=>q.id===target);
  q.translation_zh_cn='合成旧文件中的中文变更';
  q.human_review_status='pass';
  q.human_review_note='合成旧备注：无法证明已检查修改后的译文';
  delete q.human_review_note_stale;
  await page.goto(url);
  page.on('dialog',dialog=>dialog.accept());
  await page.locator('#import-file').setInputFiles({
    name:'synthetic-legacy-review.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(old)),
  });
  await expect(page.locator('.statusline')).toContainText('已从同一来源版本恢复');
  const status=page.getByLabel(target+' 复核状态'),note=page.getByLabel(target+' 审校备注');
  await expect(status).toHaveValue('pending');
  await expect(note).toHaveValue(q.human_review_note);
  await status.selectOption('pass');
  await expect(status).toHaveValue('pending');
  const saved=await exportedQuestion(page);
  expect(saved.human_review_status).toBe('pending');
  expect(saved.human_review_note_stale).toBe(true);
});

test('current imported changed-text PASS with explicit fresh marker remains self-reported PASS',async({page})=>{
  const {url,pack}=fixture(paths[0]);
  const current=structuredClone(pack),q=current.questions.find(q=>q.id===target);
  q.translation_zh_cn='合成已重新核对的中文译文';
  q.human_review_status='pass';
  q.human_review_note='合成新备注，仅代表自报';
  q.human_review_note_stale=false;
  // A fresh note alone does not prove the S1 blank Korean scale captions
  // were reviewed. Current exports also carry this exact source revision.
  q.human_review_source_caption_revision='s1-scale-empty-2-and-5@1';
  await page.goto(url);
  page.on('dialog',dialog=>dialog.accept());
  await page.locator('#import-file').setInputFiles({
    name:'synthetic-current-review.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(current)),
  });
  await expect(page.locator('.statusline')).toContainText('已从同一来源版本恢复');
  await expect(page.getByLabel(target+' 复核状态')).toHaveValue('pass');
});
