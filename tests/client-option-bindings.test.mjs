import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { verifyPinnedClientOptionBindings } from '../scripts/verify-client-option-bindings.mjs';

// Entirely fabricated JS fixture; no copyrighted source statements or results.
const SAMPLE = [
  'function Xm({season:l}){const f=[],k=f[g];',
  '[A,H]=j.useState(()=>JSON.parse(localStorage.getItem(c)??"{}"));',
  'j.useEffect(()=>localStorage.setItem(c,JSON.stringify(A)),[A,c]);',
  'const Re=async ue=>{const se={...A,[k.id]:ue};',
  'if(g<f.length-1){D(g+1)}ni.submit({season:l,answers:se,',
  '...S.trim()?{displayName:S.trim()}:{}',
  ',...s.get("ref")?{referredBy:s.get("ref")}:{}',
  ',...s.get("utm_source")?{campaignSource:s.get("utm_source")}:{}',
  ',consentVersion:"result-storage-v1"},crypto.randomUUID())};',
  'se.key==="ArrowLeft"&&g>0&&D(g-1);',
  'onClick:()=>{fe(null),ge(null),D(Math.max(0,g-1))};',
  'const ze=l==="season-2"?[{value:"O",label:"SYNTHETIC_YES"},',
  '{value:"X",label:"SYNTHETIC_NO"}]:k.allowedAnswers.map((ue,se)=>({value:ue,label:"SYNTHETIC"}));',
  'return ze.map((ue,se)=>d.jsx("button",{onClick:()=>Re(ue.value)}))}',
].join('');

function proof(code) {
  const bytes = Buffer.from(code);
  return verifyPinnedClientOptionBindings(bytes, {
    sha256: createHash('sha256').update(bytes).digest('hex'),
    bytes: bytes.length,
  });
}

test('pinned client structural audit only proves source ID/raw value binding, never official scoring', () => {
  const result = proof(SAMPLE);
  assert.equal(result.status, 'PINNED_CLIENT_OPTION_BINDING_OBSERVED');
  assert.deepEqual(result.season2OptionValues, ['O', 'X']);
  assert.equal(result.buttonSendsSourceValueNotDisplayPosition, true);
  assert.equal(result.answerMapUsesSourceQuestionId, true);
  assert.equal(result.sameRawAnswerMapSentAtFinalSubmission, true);
  assert.equal(result.season1OptionsFromQuestionAllowedAnswers, true);
  assert.equal(result.browserRestoresPerSeasonAnswersFromLocalStorage, true);
  assert.equal(result.browserWritesPerSeasonAnswersToLocalStorage, true);
  assert.equal(result.keyboardAndButtonBackNavigationObserved, true);
  assert.equal(result.submissionMayIncludeDisplayNameReferralAndCampaign, true);
  assert.equal(result.submissionIncludesConsentVersion, true);
  assert.equal(result.submissionUsesFreshRequestId, true);
  assert.equal(result.theseSubmissionFieldsAffectScore, 'UNKNOWN');
  assert.equal(result.scoringAlgorithmKnown, false);
  assert.equal(result.realDomSourceIdExposed, false);
  assert.ok(!JSON.stringify(result).includes('SYNTHETIC_'));
  assert.ok(Object.isFrozen(result));
});

test('observed code cannot be substituted with an unpinned asset', () => {
  const bytes = Buffer.from(SAMPLE);
  assert.throws(() => verifyPinnedClientOptionBindings(bytes), /指纹不匹配/);
  assert.throws(() => verifyPinnedClientOptionBindings(SAMPLE), TypeError);
});

test('reject button-position substitution, source-ID drift, score-submit rewiring and answer-dependent navigation', () => {
  for (const [changed, reason] of [
    [SAMPLE.replace('Re(ue.value)', 'Re(se+1)'), 'button index'],
    [SAMPLE.replace('[k.id]:ue', '[g]:ue'), 'question index'],
    [SAMPLE.replace('answers:se,', 'answers:{},'), 'missing answers'],
    [SAMPLE.replace('D(g+1)', 'D(g+2)'), 'wrong next position'],
    [SAMPLE.replace('g<f.length-1', 'g<f.length-2'), 'wrong last question'],
    [SAMPLE.replace('k.allowedAnswers.map', 'k.allowedAnswers.reverse().map'), 'reversed scale'],
    [SAMPLE.replace('value:"X"', 'value:"O"'), 'duplicate O option'],
    [SAMPLE.replace('value:"O",label:"SYNTHETIC_YES"', 'value:"X",label:"SYNTHETIC_YES"'), 'wrong first value'],
    [SAMPLE.replace('JSON.parse(localStorage.getItem(c)??"{}")', '{}'), 'lost restore provenance'],
    [SAMPLE.replace('localStorage.setItem(c,JSON.stringify(A))', 'void A'), 'lost state persistence'],
    [SAMPLE.replace('g>0&&D(g-1)', 'g>0&&D(g-2)'), 'wrong keyboard back'],
    [SAMPLE.replace('D(Math.max(0,g-1))', 'D(Math.max(0,g-2))'), 'wrong button back'],
    [SAMPLE.replace('campaignSource:s.get("utm_source")', 'campaignSource:null'), 'missing campaign evidence'],
    [SAMPLE.replace('referredBy:s.get("ref")', 'referredBy:null'), 'missing referral evidence'],
    [SAMPLE.replace('displayName:S.trim()', 'displayName:null'), 'missing optional displayName evidence'],
    [SAMPLE.replace('consentVersion:"result-storage-v1"', 'consentVersion:"changed"'), 'changed consent version'],
    [SAMPLE.replace('crypto.randomUUID()', '"fixed"'), 'missing request ID freshness'],
  ]) {
    assert.throws(() => proof(changed), /绑定|答题|选项|按钮|链路|客户端|提交|导航|状态/, reason);
  }
});

test('external read-only probe requires an explicit opt-in flag', () => {
  const script = new URL('../scripts/verify-client-option-bindings.mjs', import.meta.url);
  const run = spawnSync(process.execPath, [script.pathname], {
    encoding: 'utf8', timeout: 5000,
  });
  assert.equal(run.status, 2);
  assert.match(run.stderr, /--live-readonly/);
});
