import test from 'node:test';
import assert from 'node:assert/strict';
import { SEASONS } from '../data/questions.mjs';
import { scoreAnswers } from '../lib/quiz.mjs';
import { rankComparableGuests } from '../lib/guest-match.mjs';

const user = {
  season: 2, origin: 'licensed_official', question_version: 'licensed-source-2026',
  scoring_version: 'licensed-official-v1',
  dimensions: [{ id: 'a', score: 40 }, { id: 'b', score: -30 }, { id: 'c', score: 0 }],
};

function guest(id, scores, override = {}) {
  return {
    id, stage_name: `合成嘉宾${id}`, season: 2,
    question_version: 'licensed-source-2026', scoring_version: 'licensed-official-v1',
    score_source_url: `https://example.org/synthetic/${id}`, score_checked_at: '2026-10-29',
    dimensions: ['a', 'b', 'c'].map((axis, i) => ({ id: axis, score: scores[i] })),
    social_accounts: [], ...override,
  };
}

test('do not compare independent non-official quiz results to show guests', () => {
  const quiz = SEASONS[2];
  const demo = scoreAnswers(quiz, Object.fromEntries(quiz.questions.map(q => [q.id, 1])));
  const response = rankComparableGuests(demo, [guest('a', [100, 0, 0])]);
  assert.equal(response.status, 'incomparable_test');
  assert.deepEqual(response.matches, []);
});

test('only same season, same versions, complete verified scores get ranked', () => {
  const records = [
    guest('near', [40, -20, 0]),
    guest('far', [-100, 80, 100]),
    guest('different-season', [40, -30, 0], { season: 1 }),
    guest('different-version', [40, -30, 0], { scoring_version: 'another-version' }),
    guest('missing-source', [40, -30, 0], { score_source_url: null }),
    guest('missing-axis', [40, -30, 0], { dimensions: [{ id: 'a', score: 40 }] }),
  ];
  const ranked = rankComparableGuests(user, records);
  assert.deepEqual(ranked.matches.map(g => g.guest_id), ['near', 'far']);
  assert.equal(ranked.excluded, 4);
  assert.equal(ranked.matches[0].difference, 10 / 3);
});

test('ties are included at the cutoff rather than arbitrarily broken', () => {
  const candidates = [guest('a', [40, -30, 0]), guest('b', [50, -30, 0]), guest('c', [40, -20, 0])];
  const ranked = rankComparableGuests(user, candidates, { limit: 2 });
  assert.deepEqual(ranked.matches.map(g => g.guest_id), ['a', 'b', 'c']);
});

test('public social links require both identity evidence and review date', () => {
  const withAccounts = guest('a', [40, -30, 0], { social_accounts: [
    { platform: 'X', profile_url: 'https://x.com/example', identity_source_url: 'https://example.org/identity', verified_at: '2026-10-29' },
    { platform: 'Instagram', profile_url: 'https://instagram.com/guess', identity_source_url: null, verified_at: '2026-10-29' },
    { platform: 'other', profile_url: 'javascript:alert(1)', identity_source_url: 'https://example.org/identity', verified_at: '2026-10-29' },
  ] });
  const ranked = rankComparableGuests(user, [withAccounts]);
  assert.equal(ranked.matches[0].social_accounts.length, 1);
  assert.equal(ranked.matches[0].social_accounts[0].platform, 'X');
});

test('a complete set of guests without sufficient evidence remains unranked', () => {
  const ranked = rankComparableGuests(user, [guest('x', [40, -30, 0], { score_checked_at: null })]);
  assert.equal(ranked.status, 'no_verified_comparables');
  assert.equal(ranked.matches.length, 0);
});


test('same-season duplicate guest IDs are excluded rather than taking two ranking slots', () => {
  const records = [
    guest('same', [40, -30, 0]),
    guest('same', [-100, 100, -100]),
    guest('unique', [50, -30, 0]),
  ];
  const ranked = rankComparableGuests(user, records);
  assert.equal(ranked.status, 'ready');
  assert.deepEqual(ranked.matches.map(g => g.guest_id), ['unique']);
  assert.equal(ranked.excluded, 2);
});

test('invalid calendar dates and future verification dates cannot authenticate results', () => {
  for (const badDate of ['2026-02-30', '2026-13-01', '2099-01-01', 'yesterday']) {
    const ranked = rankComparableGuests(user, [guest('false-date', [40, -30, 0], {
      score_checked_at: badDate,
    })]);
    assert.equal(ranked.status, 'no_verified_comparables', badDate);
    assert.equal(ranked.matches.length, 0);
  }
  const ranked = rankComparableGuests(user, [guest('bad-social-date', [40, -30, 0], {
    social_accounts: [
      { platform: 'X', profile_url: 'https://x.com/synthetic',
        identity_source_url: 'https://example.org/evidence', verified_at: '2026-02-30' },
    ],
  })]);
  assert.equal(ranked.matches[0].social_accounts.length, 0);
});

test('public account navigation rejects misleading platforms, post links and credentialed URLs', () => {
  const evidence = 'https://example.org/evidence';
  const account = (platform, profile_url, identity_source_url = evidence) =>
    ({ platform, profile_url, identity_source_url, verified_at: '2026-10-29' });
  const ranked = rankComparableGuests(user, [guest('links', [40, -30, 0], {
    social_accounts: [
      account('X', 'https://x.com/synthetic'),
      account('Instagram', 'https://www.instagram.com/synthetic'),
      account('YouTube', 'https://youtube.com/@synthetic'),
      account('X', 'https://x.com.evil.invalid/synthetic'),
      account('Instagram', 'https://example.org/synthetic'),
      account('YouTube', 'https://youtube.com/watch?v=example'),
      account('X', 'https://x.com/intent'),
      account('Instagram', 'https://instagram.com/p/abcdef'),
      account('X', 'https://name:password@x.com/synthetic'),
      account('X', 'https://x.com/synthetic', 'https://localhost/identity'),
    ],
  })]);
  assert.deepEqual(ranked.matches[0].social_accounts.map(a => a.platform),
    ['X', 'Instagram', 'YouTube']);
});
