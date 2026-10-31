import test from 'node:test';
import assert from 'node:assert/strict';
import { loadFullQuestionnaire, attachTranslationFingerprints } from '../scripts/load-full-questionnaire.mjs';
import {
  extractDraftPack, buildFullQuestionnaire, summarizeUnscoredAnswers,
  PRIVATE_PROGRESS_FORMAT, createPrivateProgressReceipt, restorePrivateProgressReceipt,
  wouldDiscardLocalAnswers,
} from '../lib/full-questionnaire.mjs';
import { readFileSync } from 'node:fs';

const pack = loadFullQuestionnaire();
const raw = extractDraftPack(readFileSync(new URL('../docs/translation-review/index.html', import.meta.url), 'utf8'));
const index = JSON.parse(readFileSync(new URL('../data/original-question-index.json', import.meta.url), 'utf8'));

test('124 source IDs, 550 bilingual choices and indexed client positions survive integration', () => {
  assert.equal(pack.status, 'SOURCE_QUESTION_PILOT_UNREVIEWED_NOT_OFFICIAL');
  assert.equal(pack.rightsEvidence, 'USER_REPORTED_NOT_INDEPENDENTLY_VERIFIED');
  assert.equal(pack.scoringVersion, 'UNKNOWN');
  assert.equal(pack.seasons[1].length, 87);
  assert.equal(pack.seasons[2].length, 37);
  assert.equal([...pack.seasons[1], ...pack.seasons[2]].reduce((n, q) => n + q.options.length, 0), 550);
  for (const season of [1, 2]) {
    assert.deepEqual(pack.seasons[season].map(q => q.order),
      Array.from({ length: season === 1 ? 87 : 37 }, (_, i) => i + 1));
    assert.ok(pack.seasons[season].every(q => q.sourceKo.trim() && q.draftZh.trim() && q.options.every(o => o.ko.trim() && o.zh.trim())));
  }
  assert.equal(pack.seasons[1][0].id, index.questions.find(q => q.season === 1 && q.displayPositionDerivedFromClient === 1).sourceQuestionId);
  assert.equal(pack.seasons[2][0].id, index.questions.find(q => q.season === 2 && q.displayPositionDerivedFromClient === 1).sourceQuestionId);
});

test('source provenance, reported permission, unreviewed status and question count are hard gates', () => {
  const mutate = change => {
    const draft = structuredClone(raw);
    const metadata = structuredClone(index);
    change(draft, metadata);
    assert.throws(() => buildFullQuestionnaire(draft, metadata));
  };
  mutate(d => { d.reported_permission.status = 'UNKNOWN'; });
  mutate(d => { d.questions[0].review_status = 'bilingual_reviewed'; });
  mutate(d => { d.questions[0].scoring_version = 'official'; });
  mutate(d => { d.questions[0].source_text_ko = ''; });
  mutate(d => { d.questions[0].options[1].value = d.questions[0].options[0].value; });
  mutate(d => { d.questions.pop(); });
  mutate((_d, m) => { m.sourceAssetSha256 = 'a'.repeat(64); });
  mutate((_d, m) => { m.questions[0].displayPositionDerivedFromClient = 2; });
});

test('all answers can be completed as a receipt, but never produce invented official axes or matches', () => {
  for (const season of [1, 2]) {
    const answer = Object.fromEntries(pack.seasons[season].map(q => [q.id, q.options[0].value]));
    const result = summarizeUnscoredAnswers(pack, season, answer);
    assert.equal(result.questionCount, season === 1 ? 87 : 37);
    assert.equal(result.selections.length, result.questionCount);
    assert.equal(result.groups.reduce((n, g) => n + g.answered, 0), result.questionCount);
    assert.equal(result.scoringVersion, 'UNKNOWN');
    assert.equal(result.status, 'COMPLETED_ANSWERS_ONLY_NO_OFFICIAL_SCORING');
    assert.ok(!('dimensions' in result) && !('matches' in result));
    assert.throws(() => summarizeUnscoredAnswers(pack, season, { ...answer, 's9-wrong': 'X' }));
    const incomplete = structuredClone(answer); delete incomplete[pack.seasons[season][0].id];
    assert.throws(() => summarizeUnscoredAnswers(pack, season, incomplete));
  }
});

test('pilot refuses source metadata drift that would mislabel question origin or group', () => {
  const cases = [
    ['source position', d => { d.questions[0].source_position += 1; }],
    ['season one source group', d => { d.questions[0].source_group = 'unverified'; }],
    ['season one reverse direction', d => { d.questions[0].reverse_flag_in_public_client = !d.questions[0].reverse_flag_in_public_client; }],
    ['season two source group', d => { d.questions.find(q => q.season === 2).source_group_ko = 'unverified'; }],
    ['season two agreement side', d => { d.questions.find(q => q.season === 2).agree_value_ko = 'unverified'; }],
    ['wrong-season link', d => { d.questions.find(q => q.season === 2).source_url = 'https://thecommunity.co.kr/season/1/test'; }],
  ];
  for (const [label, change] of cases) {
    const draft = structuredClone(raw);
    change(draft);
    assert.throws(() => buildFullQuestionnaire(draft, index), undefined, label);
  }
});

test('mixed per-question draft versions are preserved honestly in both season receipts', () => {
  assert.equal(pack.translationVersion, 'MIXED_PER_QUESTION');
  // Translation editors may legitimately publish another AI draft in this
  // canonical source. Do not freeze an incidental version count: the previous
  // hard-coded count broke main CI/Pages on every such revision.
  const sourceVersions = new Map(raw.questions
    .filter(q => q.season === 2)
    .map(q => [q.id, q.translation_version]));
  assert.equal(sourceVersions.size, pack.seasons[2].length);
  for (const question of pack.seasons[2]) {
    assert.equal(question.translationVersion, sourceVersions.get(question.id));
  }
  // Keep the specific sa06 regression without pinning unrelated items.
  assert.equal(pack.seasons[2].find(q => q.id === 'sa06')?.translationVersion, 'draft-0.1.1');
  for (const season of [1, 2]) {
    const questions = pack.seasons[season];
    const answers = Object.fromEntries(questions.map(q => [q.id, q.options[0].value]));
    const receipt = summarizeUnscoredAnswers(pack, season, answers);
    const versions = new Map();
    for (const q of questions) versions.set(q.translationVersion, (versions.get(q.translationVersion) || 0) + 1);
    assert.equal(receipt.translationVersion,
      versions.size === 1 ? versions.keys().next().value : 'MIXED_PER_QUESTION');
    assert.deepEqual(new Map(receipt.translationVersions.map(v => [v.version, v.questionCount])), versions);
    assert.equal(receipt.translationVersions.reduce((n, v) => n + v.questionCount, 0), questions.length);
    assert.deepEqual(receipt.selections.map(s => s.translationVersion), questions.map(q => q.translationVersion));
  }
  // Simulate the next legitimate translation-only revision. The produced
  // receipt must follow per-question source versions without a test edit.
  const nextDraft = structuredClone(raw);
  const revised = nextDraft.questions.find(q => q.id === 'sa06');
  const versionParts = revised.translation_version.match(/^draft-(\d+)\.(\d+)\.(\d+)$/);
  assert.ok(versionParts);
  revised.translation_version = `draft-${versionParts[1]}.${versionParts[2]}.${Number(versionParts[3]) + 1}`;
  const nextPack = attachTranslationFingerprints(buildFullQuestionnaire(nextDraft, index));
  const nextQuestions = nextPack.seasons[2];
  const nextAnswers = Object.fromEntries(nextQuestions.map(q => [q.id, q.options[0].value]));
  const nextReceipt = summarizeUnscoredAnswers(nextPack, 2, nextAnswers);
  assert.equal(nextQuestions.find(q => q.id === 'sa06').translationVersion, revised.translation_version);
  assert.equal(nextReceipt.selections.find(s => s.questionId === 'sa06').translationVersion, revised.translation_version);
  assert.deepEqual(
    new Map(nextReceipt.translationVersions.map(v => [v.version, v.questionCount])),
    nextQuestions.reduce((counts, q) => counts.set(q.translationVersion, (counts.get(q.translationVersion) || 0) + 1), new Map()),
  );
  const draft = structuredClone(raw);
  draft.questions.at(-1).translation_version = 'official-1.0.0';
  assert.throws(() => buildFullQuestionnaire(draft, index));
});

test('both seasons can export sparse private progress and restore exact answers, order and position', () => {
  for (const season of [1, 2]) {
    const questions = pack.seasons[season];
    const answers = Object.create(null);
    answers[questions[0].id] = questions[0].options[0].value;
    answers[questions[3].id] = questions[3].options.at(-1).value;
    const record = createPrivateProgressReceipt(pack, season, answers, 3);
    const restored = restorePrivateProgressReceipt(pack, JSON.parse(JSON.stringify(record)));
    assert.equal(record.format, PRIVATE_PROGRESS_FORMAT);
    assert.equal(record.scoringVersion, 'UNKNOWN');
    assert.equal(record.sourceSha256, pack.sourceSha256);
    assert.equal(record.questionCount, questions.length);
    assert.equal(record.currentQuestionId, questions[3].id);
    assert.equal(restored.season, season);
    assert.equal(restored.index, 3);
    assert.equal(restored.answeredCount, 2);
    assert.equal(restored.complete, false);
    assert.deepEqual({ ...restored.answers }, { ...answers });
    assert.equal(Object.getPrototypeOf(restored.answers), null);
    assert.ok(!('dimensions' in record) && !('matches' in record));
  }
});

test('import conflict gate distinguishes a safe superset from lost or changed local choices', () => {
  const existing = Object.assign(Object.create(null), { first: 'O', second: 'X' });
  assert.equal(wouldDiscardLocalAnswers(existing, { first: 'O', second: 'X', third: 'O' }), false);
  assert.equal(wouldDiscardLocalAnswers(existing, { first: 'O', second: 'X' }), false);
  assert.equal(wouldDiscardLocalAnswers(existing, { first: 'O' }), true);
  assert.equal(wouldDiscardLocalAnswers(existing, { first: 'X', second: 'X' }), true);
  assert.equal(wouldDiscardLocalAnswers(Object.create(null), Object.create(null)), false);
  assert.throws(() => wouldDiscardLocalAnswers(existing, null));
});

test('existing completed-only local downloads remain importable without inventing official scores', () => {
  for (const season of [1, 2]) {
    const questions = pack.seasons[season];
    const answers = Object.fromEntries(questions.map(q => [q.id, q.options[0].value]));
    const oldReceipt = summarizeUnscoredAnswers(pack, season, answers);
    const restoredOld = restorePrivateProgressReceipt(pack, oldReceipt);
    const newReceipt = createPrivateProgressReceipt(pack, season, answers, questions.length - 1);
    const restoredNew = restorePrivateProgressReceipt(pack, newReceipt);
    for (const restored of [restoredOld, restoredNew]) {
      assert.equal(restored.answeredCount, questions.length);
      assert.equal(restored.index, questions.length - 1);
      assert.equal(restored.complete, true);
      assert.deepEqual({ ...restored.answers }, answers);
    }
  }
});

test('private resume refuses version drift, unknown/duplicate answers, falsified scoring and malformed position', () => {
  const questions = pack.seasons[2];
  const answers = Object.fromEntries(questions.slice(0, 2).map(q => [q.id, q.options[0].value]));
  const receipt = createPrivateProgressReceipt(pack, 2, answers, 1);
  const reject = change => {
    const copy = structuredClone(receipt);
    change(copy);
    assert.throws(() => restorePrivateProgressReceipt(pack, copy));
  };
  reject(r => { r.season = 1; });
  reject(r => { r.questionCount = 36; });
  reject(r => { r.sourceSha256 = 'a'.repeat(64); });
  reject(r => { r.translationVersion = 'official-99.99.99'; });
  reject(r => { r.scoringVersion = 'season-2-score@2'; });
  reject(r => { r.status = 'OFFICIAL_RESULT'; });
  reject(r => { r.format = 'unknown'; });
  reject(r => { r.currentQuestionId = '__proto__'; });
  reject(r => { r.selections.push(structuredClone(r.selections[0])); });
  reject(r => { r.selections[0].questionId = '__proto__'; });
  reject(r => { r.selections[0].selectedValue = 'NO_SUCH_OPTION'; });
  reject(r => { r.selections[0].translationVersion = 'official-99.99.99'; });
  reject(r => { r.selections = Array.from({ length: 38 }, () => r.selections[0]); });
  assert.throws(() => restorePrivateProgressReceipt(pack, null));
  assert.throws(() => createPrivateProgressReceipt(pack, 2, { __proto__: null, bad: 'x' }, 1));
  assert.throws(() => createPrivateProgressReceipt(pack, 2, answers, 99));
  const legacyIncomplete = summarizeUnscoredAnswers(pack, 2, Object.fromEntries(questions.map(q => [q.id, q.options[0].value])));
  legacyIncomplete.selections.pop();
  assert.throws(() => restorePrivateProgressReceipt(pack, legacyIncomplete));
});
test('translation-only draft updates allow safe opt-in resume while retaining each answer’s original version until reconfirmed', () => {
  for (const season of [1, 2]) {
    const questions = pack.seasons[season];
    const answers = Object.fromEntries(questions.map(q => [q.id, q.options[0].value]));
    const receipt = createPrivateProgressReceipt(pack, season, answers, questions.length - 1);
    const oldVersion = 'draft-0.0.1';
    receipt.translationVersion = oldVersion;
    receipt.selections[0].translationVersion = oldVersion;
    const restored = restorePrivateProgressReceipt(pack, receipt);
    assert.deepEqual(restored.changedQuestionIds, [questions[0].id]);
    assert.equal(restored.complete, true);
    assert.equal(restored.answerVersions[questions[0].id], oldVersion);
    assert.equal(restored.answers[questions[0].id], questions[0].options[0].value);
    const reexported = createPrivateProgressReceipt(
      pack, season, restored.answers, restored.index, restored.answerVersions,
    );
    assert.equal(reexported.selections[0].translationVersion, oldVersion);
    const summary = summarizeUnscoredAnswers(pack, season, restored.answers, restored.answerVersions);
    assert.equal(summary.selections[0].translationVersion, oldVersion);
    // Actually reselecting that answer under the current wording updates provenance.
    restored.answerVersions[questions[0].id] = questions[0].translationVersion;
    assert.equal(createPrivateProgressReceipt(pack, season, restored.answers, 0, restored.answerVersions)
      .selections[0].translationVersion, questions[0].translationVersion);
    assert.throws(() => restorePrivateProgressReceipt(pack, {
      ...receipt, sourceSha256: 'x'.repeat(64),
    }), /来源或版本不匹配/);
    assert.throws(() => restorePrivateProgressReceipt(pack, {
      ...receipt, selections: [{ ...receipt.selections[0], translationVersion: 'official-1.0' }],
    }), /不同版本的答案/);
  }
});

test('browser restoration asks permission on translation drift, preserves old provenance and requires reconfirmation before completion', () => {
  const app = readFileSync(new URL('../full-questionnaire-app.mjs', import.meta.url), 'utf8');
  assert.match(app, /const changed = session\.changedQuestionIds\.length/);
  assert.match(app, /if \(discardsLocal \|\| changed\)/);
  assert.match(app, /window\.confirm/);
  assert.match(app, /needsReview: new Set\(session\.changedQuestionIds\)/);
  assert.match(app, /active\.answerVersions\[q\.id\] = q\.translationVersion/);
  assert.match(app, /active\.needsReview\?\.delete\(q\.id\)/);
  assert.match(app, /active\.needsReview\?\.has\(q\.id\)/);
  assert.match(app, /if \(session\.complete && !changed\) finish\(\)/);
  assert.match(app, /summarizeUnscoredAnswers\(pack, active\.season, active\.answers, active\.answerVersions, active\.answerFingerprints\)/);
  assert.match(app, /createPrivateProgressReceipt\(pack, active\.season, active\.answers, active\.index, active\.answerVersions, active\.answerFingerprints\)/);
});

test('same-number draft wording edits cannot silently make a restored answer look reconfirmed', () => {
  const before = loadFullQuestionnaire();
  const question = before.seasons[2][0];
  const oldAnswers = { [question.id]: question.options[0].value };
  const receipt = createPrivateProgressReceipt(before, 2, oldAnswers, 0);
  assert.match(receipt.selections[0].translationFingerprint, /^[a-f0-9]{64}$/);
  const after = structuredClone(before);
  after.seasons[2][0].draftZh += '（仅用于模拟不小心忘记升级版本的改译）';
  attachTranslationFingerprints(after);
  // The version is unchanged on purpose; a content fingerprint must still detect this.
  const restored = restorePrivateProgressReceipt(after, receipt);
  assert.deepEqual(restored.changedQuestionIds, [question.id]);
  assert.equal(restored.answerFingerprints[question.id], receipt.selections[0].translationFingerprint);
});
test('option-only AI wording edits trigger the same restoration gate, without rewriting saved provenance', () => {
  const before = loadFullQuestionnaire();
  const first = before.seasons[1][0];
  const answers = { [first.id]: first.options[1].value };
  const receipt = createPrivateProgressReceipt(before, 1, answers, 0);
  const after = structuredClone(before);
  after.seasons[1][0].options[1].zh += '（选项译文修订模拟）';
  attachTranslationFingerprints(after);
  assert.equal(after.seasons[1][0].translationVersion, first.translationVersion);
  const restored = restorePrivateProgressReceipt(after, receipt);
  assert.deepEqual(restored.changedQuestionIds, [first.id]);
  assert.equal(restored.answerFingerprints[first.id], receipt.selections[0].translationFingerprint);
  const reexport = createPrivateProgressReceipt(after, 1, restored.answers, 0,
    restored.answerVersions, restored.answerFingerprints);
  assert.equal(reexport.selections[0].translationFingerprint, receipt.selections[0].translationFingerprint);
  restored.answerFingerprints[first.id] = after.seasons[1][0].translationFingerprint;
  assert.deepEqual(restorePrivateProgressReceipt(after, createPrivateProgressReceipt(
    after, 1, restored.answers, 0, restored.answerVersions, restored.answerFingerprints,
  )).changedQuestionIds, []);
});

test('legacy backup without wording fingerprint stays UNKNOWN across imports and reexports', () => {
  const current = loadFullQuestionnaire();
  const q = current.seasons[2][0];
  const answers = { [q.id]: q.options[0].value };
  const legacy = createPrivateProgressReceipt(current, 2, answers, 0);
  delete legacy.selections[0].translationFingerprint;
  const restored = restorePrivateProgressReceipt(current, legacy);
  assert.equal(restored.answerFingerprints[q.id], null, 'missing historic fingerprint must stay unknown');

  const next = createPrivateProgressReceipt(current, 2, restored.answers, 0,
    restored.answerVersions, restored.answerFingerprints);
  assert.equal(next.selections[0].translationFingerprint, null,
    're-export must not falsely claim that the user read the current Chinese wording');
  const again = restorePrivateProgressReceipt(current, next);
  assert.equal(again.answerFingerprints[q.id], null);

  const future = structuredClone(current);
  future.seasons[2][0].draftZh += '（同版本后续改译）';
  attachTranslationFingerprints(future);
  const stillUnknown = restorePrivateProgressReceipt(future, next);
  assert.equal(stillUnknown.answerFingerprints[q.id], null);
  assert.deepEqual(stillUnknown.changedQuestionIds, [],
    'without a historic fingerprint the comparison can only use version labels');

  stillUnknown.answerFingerprints[q.id] = future.seasons[2][0].translationFingerprint;
  const reconfirmed = createPrivateProgressReceipt(future, 2, stillUnknown.answers, 0,
    stillUnknown.answerVersions, stillUnknown.answerFingerprints);
  assert.equal(reconfirmed.selections[0].translationFingerprint,
    future.seasons[2][0].translationFingerprint, 'actual re-selection can establish the current wording');
});

test('legacy local backups stay importable, and a malformed new fingerprint is rejected', () => {
  const before = loadFullQuestionnaire();
  const first = before.seasons[2][0];
  const receipt = createPrivateProgressReceipt(before, 2,
    { [first.id]: first.options[0].value }, 0);
  const legacy = structuredClone(receipt);
  delete legacy.selections[0].translationFingerprint;
  assert.deepEqual(restorePrivateProgressReceipt(before, legacy).changedQuestionIds, []);
  const malformed = structuredClone(receipt);
  malformed.selections[0].translationFingerprint = 'not-a-sha';
  assert.throws(() => restorePrivateProgressReceipt(before, malformed), /非法|无效|不同版本/);
  const all = Object.fromEntries(before.seasons[1].map(q => [q.id, q.options[0].value]));
  const size = Buffer.byteLength(JSON.stringify(createPrivateProgressReceipt(before, 1, all, 86)));
  assert.ok(size < 128 * 1024, '87-question private backup must remain importable');
});
