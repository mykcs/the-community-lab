import test from 'node:test';
import assert from 'node:assert/strict';
import directory from '../data/guest-social-directory.json' with { type: 'json' };
import { GUEST_SOCIAL_DIRECTORY, directoryScope } from '../data/guest-social-directory.mjs';

test('social directory contains only the approved public navigation scope', () => {
  assert.equal(GUEST_SOCIAL_DIRECTORY.length, 7);
  assert.equal(GUEST_SOCIAL_DIRECTORY.flatMap(person => person.accounts).length, 13);
  assert.match(directoryScope(), /no scores, rankings, activity claims or human-review claims/);
  assert.match(directory.source_review, /Two independent Agents/);
  assert.match(directory.ig_limit, /not directly opened/);

  for (const person of GUEST_SOCIAL_DIRECTORY) {
    assert.equal(person.score_source, 'UNKNOWN');
    assert.equal(person.matching_eligible, false);
    assert.equal(person.activity, 'UNKNOWN');
    for (const account of person.accounts) {
      assert.equal(account.source_review, 'TWO_INDEPENDENT_AGENT_PRIMARY_SOURCE_CHECKS');
      assert.equal(account.profile_directly_checked, false);
      assert.equal(account.checked_at, '2026-10-29');
      assert.equal(new URL(account.url).protocol, 'https:');
      assert.equal(new URL(account.evidence_url).protocol, 'https:');
      assert.ok(account.source_urls.length > 0);
      assert.ok(account.source_urls.some(url => url === account.evidence_url));
      assert.ok(account.source_urls.every(url => new URL(url).protocol === 'https:'));
    }
  }
});

test('shared channels are explicitly distinguishable and do not become personal-account claims', () => {
  const shared = GUEST_SOCIAL_DIRECTORY.flatMap(person => person.accounts)
    .filter(account => account.relationship === 'co_hosted_channel');
  assert.equal(shared.length, 2);
});
