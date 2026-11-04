import test from 'node:test';
import assert from 'node:assert/strict';
import { loadFullQuestionnaire, attachTranslationFingerprints } from '../scripts/load-full-questionnaire.mjs';
import {
  extractDraftPack, buildFullQuestionnaire, summarizeUnscoredAnswers,
  PRIVATE_PROGRESS_FORMAT, createPrivateProgressReceipt, restorePrivateProgressReceipt,
  wouldDiscardLocalAnswers, countReplacedLocalAnswerProvenance,
  hasUnsavedPrivateChoices,
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
    assert.ok(pack.seasons[season].every(q => q.sourceKo.trim() && q.draftZh.trim() && q.options.every(o =>
      o.zh.trim() && (o.ko.trim() || (season === 1 && q.options.length === 6 && [2, 5].includes(o.value) && o.ko === '')))));
  }
  assert.equal(pack.seasons[1][0].id, index.questions.find(q => q.season === 1 && q.displayPositionDerivedFromClient === 1).sourceQuestionId);
  assert.equal(pack.seasons[2][0].id, index.questions.find(q => q.season === 2 && q.displayPositionDerivedFromClient === 1).sourceQuestionId);
});

test('idiom reader note is visibly separate from draft translation and affects only its own provenance hash', () => {
  const q = pack.seasons[1].find(item => item.id === 's1-openness-11');
  assert.ok(q);
  assert.equal(q.sourceKo, '“절이 싫으면 중이 떠나야지”라는 말은 대부분의 경우 옳다.');
  assert.match(q.readerNote, /^AI 译注（待独立人工核对）/);
  assert.match(q.readerNote, /不满环境的人自行离开/);
  assert.equal(q.translationVersion, 'draft-0.1.3');
  assert.match(q.readerNote, /《戏赠沈后》/);
  assert.match(q.readerNote, /尚未查到可核验的最早文学出处/);
  assert.match(q.readerNote, /此处不留人，自有留人处/);
  assert.match(q.readerNote, /《警世通言/);
  assert.match(q.readerNote, /不完全等义/);
  assert.equal(pack.status, 'SOURCE_QUESTION_PILOT_UNREVIEWED_NOT_OFFICIAL');

  const changedNote = structuredClone(pack);
  changedNote.seasons[1].find(item => item.id === q.id).readerNote += '（修改）';
  attachTranslationFingerprints(changedNote);
  assert.notEqual(changedNote.seasons[1].find(item => item.id === q.id).translationFingerprint, q.translationFingerprint);
  const other = pack.seasons[2][0];
  assert.equal(changedNote.seasons[2][0].translationFingerprint, other.translationFingerprint,
    'a note edit must not invalidate unrelated users’ receipts');

  const bad = structuredClone(raw);
  bad.questions.find(item => item.id === q.id).reader_note_zh_cn = '<script>'.repeat(100);
  assert.throws(() => buildFullQuestionnaire(bad, index), /题目来源、状态或选项不匹配/);
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
  mutate(d => { d.questions[0].rights_status = 'licensed'; }); // A user report is not independent licence proof.
  mutate(d => { d.questions[0].scoring_version = 'official'; });
  mutate(d => { d.questions[0].source_text_ko = ''; });
  mutate(d => { d.questions[0].options[1].value = d.questions[0].options[0].value; });
  mutate(d => { d.questions.pop(); });
  mutate((_d, m) => { m.sourceAssetSha256 = 'a'.repeat(64); });
  mutate((_d, m) => { m.questions[0].displayPositionDerivedFromClient = 2; });
});

test('S2 questionnaire retains the pinned Korean source group beside the unreviewed Chinese label', () => {
  const originalGroups = new Map(index.questions.filter(q => q.season === 2)
    .map(q => [q.sourceQuestionId, q.sourceGroup]));
  assert.equal(new Set(pack.seasons[2].map(q => q.groupKo)).size, 3);
  for (const q of pack.seasons[2]) {
    assert.equal(q.groupKo, originalGroups.get(q.id), `source group missing for ${q.id}`);
    assert.ok(q.group && q.group !== q.groupKo);
  }
});

test('S2 Chinese group headings participate in historical wording fingerprints', () => {
  const original = pack.seasons[2][0];
  const oldHash = original.translationFingerprint;
  const oldReceipt = createPrivateProgressReceipt(
    pack, 2, { [original.id]: original.options[0].value }, 0,
  );
  const changed = structuredClone(pack);
  const revised = changed.seasons[2][0];
  revised.group += '（供回归测试的合成修订）';
  attachTranslationFingerprints(changed);
  assert.notEqual(revised.translationFingerprint, oldHash,
    'editing visible S2 Chinese group copy must change the receipt wording hash');
  const restored = restorePrivateProgressReceipt(changed, oldReceipt);
  assert.deepEqual(restored.changedQuestionIds, [original.id],
    'a prior selection must be re-confirmed after the displayed group is edited');
  assert.equal(changed.seasons[2][1].translationFingerprint,
    pack.seasons[2][1].translationFingerprint,
    'unrelated group choices must keep their wording hashes');
  assert.equal(changed.seasons[1][0].translationFingerprint,
    pack.seasons[1][0].translationFingerprint,
    'S1 historical receipt hashes must not change due to the S2-only fix');
});

test('S2 draft group labels cannot split or merge source domains in answer summaries', () => {
  const source = pack.seasons[2];
  assert.equal(new Set(source.map(q => q.group)).size, 3);
  const allAnswers = Object.fromEntries(source.map(q => [q.id, q.options[0].value]));
  const groups = summarizeUnscoredAnswers(pack, 2, allAnswers).groups;
  assert.equal(groups.length, 3);
  assert.equal(groups.reduce((sum, row) => sum + row.answered, 0), 37);

  const reject = change => {
    const draft = structuredClone(raw);
    change(draft.questions.filter(q => q.season === 2));
    assert.throws(() => buildFullQuestionnaire(draft, index), /题组韩中映射不一致/);
  };
  reject(questions => { questions[0].source_group_zh_cn_draft = ''; });
  reject(questions => { questions[0].source_group_zh_cn_draft = '额外的错误中文题组'; });
  reject(questions => {
    const other = questions.find(q => q.source_group_ko !== questions[0].source_group_ko);
    other.source_group_zh_cn_draft = questions[0].source_group_zh_cn_draft;
  });
  // Legitimate consistent editorial updates to a whole group remain possible.
  const updated = structuredClone(raw);
  const members = updated.questions.filter(q => q.season === 2);
  for (const q of members) {
    if (q.source_group_ko === members[0].source_group_ko) q.source_group_zh_cn_draft = '同组统一的新中文草稿标签';
  }
  assert.equal(buildFullQuestionnaire(updated, index).seasons[2].length, 37);
});

test('identical Korean response scales cannot silently diverge in Chinese across the same season', () => {
  const captions = new Map();
  for (const q of raw.questions) {
    for (const option of q.options) {
      const key = JSON.stringify([q.season, q.options.length, option.value, option.ko]);
      if (captions.has(key)) {
        assert.equal(option.zh_cn, captions.get(key), `inconsistent draft scale: ${q.id}`);
      }
      captions.set(key, option.zh_cn);
    }
  }

  const rejectOne = (season, count) => {
    const changed = structuredClone(raw);
    const candidates = changed.questions.filter(q => q.season === season && q.options.length === count);
    assert.ok(candidates.length >= 2);
    candidates[1].options[0].zh_cn = '故意相反的 AI 草稿，仅用于测试';
    assert.throws(() => buildFullQuestionnaire(changed, index),
      /同一韩文量表选项存在不一致的中文 AI 初译/);
  };
  rejectOne(1, 6);
  rejectOne(1, 4);
  rejectOne(2, 2);

  // One coordinated draft-wide editorial revision should remain possible.
  // Consistency is a machine guard, never evidence of a correct translation.
  const coordinated = structuredClone(raw);
  for (const q of coordinated.questions.filter(q => q.season === 1 && q.options.length === 6)) {
    q.options.find(option => option.value === 2).zh_cn = '第2档（待真人核对）';
  }
  const revised = buildFullQuestionnaire(coordinated, index);
  assert.equal(revised.seasons[1].length, 87);
  assert.equal(revised.seasons[2].length, 37);
  assert.equal(revised.scoringVersion, 'UNKNOWN');
  assert.equal(revised.rightsEvidence, 'USER_REPORTED_NOT_INDEPENDENTLY_VERIFIED');
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

test('unload protection considers unbacked changes in either season, not just the visible quiz', () => {
  const sessions = new Map([
    [1, { answers: { 's1-a': 1 }, backupStale: false }],
    [2, { answers: {}, backupStale: true }],
  ]);
  assert.equal(hasUnsavedPrivateChoices(sessions.values()), false);
  sessions.get(2).answers['s2-a'] = 'O';
  assert.equal(hasUnsavedPrivateChoices(sessions.values()), true);
  sessions.get(2).backupStale = false; // User downloaded a current JSON backup.
  assert.equal(hasUnsavedPrivateChoices(sessions.values()), false);
  sessions.get(1).backupStale = true; // Changes after that season's earlier backup.
  assert.equal(hasUnsavedPrivateChoices(sessions.values()), true);
  sessions.get(1).answers = {}; // A confirmed restart clears the at-risk answers.
  assert.equal(hasUnsavedPrivateChoices(sessions.values()), false);
});

test('importing an identical choice cannot silently erase a recorded wording fingerprint', () => {
  const question = pack.seasons[2][0];
  const answer = { [question.id]: question.options[0].value };
  const known = {
    answers: answer,
    answerVersions: { [question.id]: question.translationVersion },
    answerFingerprints: { [question.id]: question.translationFingerprint },
  };
  const legacy = createPrivateProgressReceipt(pack, 2, answer, 0);
  delete legacy.selections[0].translationFingerprint;
  const restored = restorePrivateProgressReceipt(pack, legacy);
  assert.equal(wouldDiscardLocalAnswers(known.answers, restored.answers), false,
    'selected original value is unchanged');
  assert.equal(restored.changedQuestionIds.length, 0,
    'legacy file cannot independently prove the Chinese wording changed');
  assert.equal(countReplacedLocalAnswerProvenance(known, restored), 1,
    'import must warn before known wording evidence becomes UNKNOWN');
  assert.equal(countReplacedLocalAnswerProvenance(known, known), 0);
  const changedVersion = structuredClone(known);
  changedVersion.answerVersions[question.id] = 'draft-0.0.0';
  assert.equal(countReplacedLocalAnswerProvenance(known, changedVersion), 1);
  assert.throws(() => countReplacedLocalAnswerProvenance(known, { answers: answer }));
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
  assert.match(app, /if \(discardsLocal \|\| changed \|\| overwrittenProvenance \|\| unknown\)/);
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
  assert.deepEqual(restored.unknownWordingQuestionIds, [q.id],
    'legacy answers must be surfaced as historical text UNKNOWN');
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
