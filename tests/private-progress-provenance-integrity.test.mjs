import test from 'node:test';
import assert from 'node:assert/strict';
import { loadFullQuestionnaire } from '../scripts/load-full-questionnaire.mjs';
import {
  summarizeUnscoredAnswers, createPrivateProgressReceipt,
} from '../lib/full-questionnaire.mjs';

const pack = loadFullQuestionnaire();
const questions = pack.seasons[2];
const answers = Object.fromEntries(questions.map(q => [q.id, q.options[0].value]));
const versions = Object.fromEntries(questions.map(q => [q.id, q.translationVersion]));
const fingerprints = Object.fromEntries(questions.map(q => [q.id, q.translationFingerprint]));

test('explicit per-answer provenance cannot silently fall back to today’s Chinese draft', () => {
  const missingVersions = { ...versions };
  delete missingVersions[questions[0].id];
  assert.throws(() =>
    summarizeUnscoredAnswers(pack, 2, answers, missingVersions, fingerprints),
  /缺少答题时的译文版本/);
  assert.throws(() =>
    createPrivateProgressReceipt(pack, 2, answers, 0, missingVersions, fingerprints),
  /缺少答题时的译文版本/);

  const missingFingerprints = { ...fingerprints };
  delete missingFingerprints[questions[0].id];
  assert.throws(() =>
    summarizeUnscoredAnswers(pack, 2, answers, versions, missingFingerprints),
  /缺少答题时的中文文字指纹/);
  assert.throws(() =>
    createPrivateProgressReceipt(pack, 2, answers, 0, versions, missingFingerprints),
  /缺少答题时的中文文字指纹/);
});

test('complete tracked provenance and explicitly untracked legacy calls remain supported', () => {
  const tracked = summarizeUnscoredAnswers(pack, 2, answers, versions, fingerprints);
  assert.equal(tracked.selections.length, 37);
  assert.equal(tracked.selections[0].translationFingerprint, questions[0].translationFingerprint);

  const legacy = summarizeUnscoredAnswers(pack, 2, answers);
  assert.equal(legacy.selections[0].translationVersion, questions[0].translationVersion);
  const privateBackup = createPrivateProgressReceipt(pack, 2, answers, 0, versions, fingerprints);
  assert.equal(privateBackup.selections.length, 37);
  assert.equal(privateBackup.selections[0].translationFingerprint, questions[0].translationFingerprint);

  // Explicit historical uncertainty must survive a re-export, never be
  // silently replaced with a fingerprint of today's translation.
  const unknown = { ...fingerprints, [questions[0].id]: null };
  const reexport = createPrivateProgressReceipt(pack, 2, answers, 0, versions, unknown);
  assert.equal(reexport.selections[0].translationFingerprint, null);
});
