import {test, expect} from '@playwright/test';
import {loadFullQuestionnaire} from '../scripts/load-full-questionnaire.mjs';
test('S1 belief statement remains bilingual and source-value stable in both layouts',async({page})=>{
 const questions=loadFullQuestionnaire().seasons[1];
 const position=questions.findIndex(q=>q.id==='s1-gender-17');
 const expected=questions[position];
 const writes=[];
 page.on('request',req=>{if(!['GET','HEAD'].includes(req.method()))writes.push(req.url())});
 await page.goto('/the-community-lab/questionnaire/?season=1');
 for(let i=0;i<position;i++){
   await page.locator('#full-choices [role="radio"]').first().click();
   await page.locator('#full-next').click();
 }
 await expect(page.locator('#full-group')).toContainText('s1-gender-17');
 await expect(page.locator('#full-ko')).toHaveText(expected.sourceKo);
 await expect(page.locator('#full-zh')).toHaveText(expected.draftZh);
 await expect(page.locator('#full-zh')).toContainText('认为男女之间存在薪酬差距');
 await expect(page.locator('#full-choices .full-choice-mark')).toHaveText(['1','2','3','4','5','6']);
 expect(writes).toEqual([]);
});
