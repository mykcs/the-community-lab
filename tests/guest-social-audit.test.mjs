import test from 'node:test';
import assert from 'node:assert/strict';
import source from '../data/guest-social-directory.json' with { type: 'json' };
import { GUEST_SOCIAL_DIRECTORY, GUEST_SOCIAL_DIRECTORY_AUDIT } from '../data/guest-social-directory.mjs';
import { auditGuestSocialDirectory } from '../lib/guest-social-audit.mjs';

test('public navigation records pass the structural safety gate without qualifying as official results', () => {
  const checked = auditGuestSocialDirectory(source, { today: '2026-10-29' });
  assert.equal(checked.valid, true, checked.issues.join('\n'));
  assert.deepEqual(checked.issues, []);
  assert.equal(GUEST_SOCIAL_DIRECTORY_AUDIT.valid, true);
  assert.equal(GUEST_SOCIAL_DIRECTORY.length, 7);
  assert.equal(GUEST_SOCIAL_DIRECTORY.flatMap(person => person.accounts).length, 13);
  assert.ok(checked.people.every(person => person.matching_eligible === false &&
    person.score_source === 'UNKNOWN' && person.activity === 'UNKNOWN'));
});

test('wrong social host or page type cannot masquerade as an account profile', () => {
  for (const badUrl of [
    'https://www.youtube.com.evil.example/channel/fake',
    'https://www.youtube.com/watch?v=NUviO_w8tVA',
    'https://user:pass@www.youtube.com/channel/UCtest',
    'https://127.0.0.1/channel/UCtest',
    'javascript:alert(1)',
  ]) {
    const modified = structuredClone(source);
    modified.people[0].accounts[0].url = badUrl;
    const checked = auditGuestSocialDirectory(modified, { today: '2026-10-29' });
    assert.equal(checked.valid, false, badUrl);
    assert.deepEqual(checked.people, [], 'a damaged directory must be suppressed');
  }
  const wrongInstagram = structuredClone(source);
  wrongInstagram.people[0].accounts[1].url = 'https://www.instagram.com/reel/12345';
  assert.equal(auditGuestSocialDirectory(wrongInstagram, { today: '2026-10-29' }).valid, false);
});

test('evidence dates, URLs and participant ownership claims must be internally consistent', () => {
  const changes = [
    d => { d.people[0].accounts[0].checked_at = '2026-02-30'; },
    d => { d.people[0].accounts[0].checked_at = '2099-10-29'; },
    d => { d.people[0].accounts[0].evidence_url = 'https://unlisted.example/missing'; },
    d => { d.people[0].accounts[0].source_urls = ['http://unsafe.example/source']; },
    d => { d.people[0].accounts[0].profile_directly_checked = true; },
    d => { d.people[0].accounts[0].source_review = 'HUMAN_VERIFIED'; },
    d => { d.people[0].accounts[0].relationship = 'co_hosted_channel'; d.people[0].accounts[0].platform = 'Instagram'; },
    d => { d.people[0].accounts.push(structuredClone(d.people[0].accounts[0])); },
    d => { d.people.push(structuredClone(d.people[0])); },
  ];
  for (const mutate of changes) {
    const copy = structuredClone(source);
    mutate(copy);
    const checked = auditGuestSocialDirectory(copy, { today: '2026-10-29' });
    assert.equal(checked.valid, false, JSON.stringify(copy.people[0]));
    assert.equal(checked.people.length, 0);
  }
});

test('a future edit may not smuggle in scores, private contact fields or stronger public claims', () => {
  const changes = [
    d => { d.people[0].matching_eligible = true; },
    d => { d.people[0].score_source = 'https://unverified.example/score'; },
    d => { d.people[0].activity = 'ACTIVE'; },
    d => { d.people[0].private_email = 'not-a-real-person@example.invalid'; },
    d => { d.people[0].accounts[0].personal_address = 'private'; },
    d => { d.scope = 'official participant matching'; },
    d => { d.ig_limit = 'all accounts individually verified'; },
  ];
  for (const mutate of changes) {
    const copy = structuredClone(source);
    mutate(copy);
    assert.equal(auditGuestSocialDirectory(copy, { today: '2026-10-29' }).valid, false);
  }
});
