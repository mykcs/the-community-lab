import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { loadFullQuestionnaire } from '../scripts/load-full-questionnaire.mjs';
import { triageBilingualCues } from '../scripts/audit-bilingual-cues.mjs';

const html=readFileSync(new URL('../docs/original-question-translation-review/index.html',import.meta.url),'utf8');
function getJson(id){
  const match=html.match(new RegExp('<script id="'+id+'" type="application/json">([\\s\\S]*?)<\\/script>'));
  assert.ok(match,'Missing inert '+id+' metadata');
  return JSON.parse(match[1]);
}

test('reviewer priority filter exactly tracks the current source+option lexical audit',()=>{
  const source=getJson('embedded-data'),meta=getJson('embedded-triage');
  const expected=triageBilingualCues(loadFullQuestionnaire());
  const ids=expected.items.filter(q=>q.priority!=='STANDARD_BILINGUAL_CHECK').map(q=>q.sourceQuestionId);
  assert.equal(meta.schema,expected.schema);
  assert.equal(meta.sourceSha256,source.source.asset_sha256);
  assert.equal(meta.total,source.questions.length);
  assert.deepEqual(meta.priorityIds,ids);
  assert.equal(ids.length,expected.firstPassPriorityCount);
  assert.equal(ids.length,27);
  assert.equal(new Set(ids).size,ids.length);
  assert.ok(ids.every(id=>source.questions.some(q=>q.source_question_id===id)));
  assert.match(html,/只用于排序，不代表这 27 道存在翻译错误/);
  assert.doesNotMatch(JSON.stringify(meta),/source_text_ko|translation_zh_cn|answer/);
});
