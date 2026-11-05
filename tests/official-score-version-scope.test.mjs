import test from 'node:test';
import assert from 'node:assert/strict';
import { OFFICIAL_SYNTHETIC_SCORE_OBSERVATIONS } from '../data/original-site-audit.mjs';
import { buildVerifiedOfficialScoreFixtures } from '../lib/official-score-parity.mjs';

// A plausible new service response can retain the same 37 answers but change
// its questionnaire, question-set, or scoring identity. Such evidence must not
// be pooled with the current version's gold fixtures.
test('verified official S2 gold pairs cannot silently mix incompatible versions', () => {
  const driftCases = [
    ['questionnaireVersion', 'season-2@2026-09'],
    ['questionSetHash', '0123456789abcdef'],
    ['scoringVersion', 'season-2-score@3'],
  ];
  for (const [field, value] of driftCases) {
    const observations = structuredClone(OFFICIAL_SYNTHETIC_SCORE_OBSERVATIONS);
    observations[3].output = { ...observations[3].output, [field]: value };
    assert.throws(
      () => buildVerifiedOfficialScoreFixtures(observations),
      /金标准.*同一.*版本/,
      field + ' must fail closed rather than silently pool a new version',
    );
  }
});

test('an unverified historical result from another version remains evidence, not a gold fixture', () => {
  const observations = structuredClone(OFFICIAL_SYNTHETIC_SCORE_OBSERVATIONS);
  observations[1].output = { ...observations[1].output, scoringVersion: 'season-2-score@3' };
  const fixtures = buildVerifiedOfficialScoreFixtures(
    observations.filter(row =>
      !['EvG6GUuDwVZomdTc', 'UhcZYwxcXKtGKCQA', 'Im8DirzXwGTAQygS', 'aMpgxXI50B7Eqrb-'].includes(row.publicResultId)));
  assert.equal(fixtures.length, 4);
  assert.ok(fixtures.every(f => f.input.scoringVersion === 'season-2-score@2'));
});
