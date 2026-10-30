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

test('a single personal profile cannot be attributed to unrelated guests, including URL aliases', () => {
  const modified = structuredClone(source);
  modified.people[1].accounts[0].url =
    modified.people[0].accounts[0].url.replace('www.youtube.com', 'youtube.com');
  const checked = auditGuestSocialDirectory(modified, { today: '2026-10-29' });
  assert.equal(checked.valid, false, 'same channel via www alias must not be claimed as two personal accounts');
  assert.deepEqual(checked.people, []);
  assert.ok(checked.issues.some(issue => issue.includes('profile attributed')));
});

test('shared channels may appear twice only if both accounts explicitly say co-hosted', () => {
  const shared = structuredClone(source);
  const first = shared.people[4].accounts[0];
  const second = shared.people[5].accounts[0];
  assert.equal(first.relationship, 'co_hosted_channel');
  assert.equal(second.relationship, 'personal_channel');
  second.url = first.url;
  assert.equal(auditGuestSocialDirectory(shared, { today: '2026-10-29' }).valid, false);
  second.relationship = 'co_hosted_channel';
  assert.equal(auditGuestSocialDirectory(shared, { today: '2026-10-29' }).valid, true);
  second.relationship = 'personal_channel';
  assert.equal(auditGuestSocialDirectory(shared, { today: '2026-10-29' }).valid, false);
});

test('YouTube @handles are case-insensitive across aliases and encoded Unicode', () => {
  for (const [left, right] of [
    ['https://www.youtube.com/@GuestName', 'https://youtube.com/@guestname'],
    ['https://www.youtube.com/@ÄBC', 'https://m.youtube.com/@äbc'],
  ]) {
    const modified = structuredClone(source);
    modified.people[0].accounts[0].url = left;
    modified.people[1].accounts[0].url = right;
    const checked = auditGuestSocialDirectory(modified, { today: '2026-10-29' });
    assert.equal(checked.valid, false, left + ' vs ' + right);
    assert.deepEqual(checked.people, []);
    assert.ok(checked.issues.some(issue => issue.includes('profile attributed')));
  }
});

test('YouTube /channel IDs preserve case in duplicate matching', () => {
  const modified = structuredClone(source);
  modified.people[0].accounts[0].url = 'https://www.youtube.com/channel/UCAbC';
  modified.people[1].accounts[0].url = 'https://youtube.com/channel/UCabc';
  assert.equal(auditGuestSocialDirectory(modified, { today: '2026-10-29' }).valid, true);
});


test('special-use domains cannot support the public guest directory, even with HTTPS', () => {
  for (const host of [
    'records.test', 'records.invalid', 'records.example',
    'records.example.org', 'records.example.net', 'records.example.com',
    'printer.home.arpa', 'service.onion', 'resolver.alt',
    'staff.internal', 'local', 'localhost.', 'records.test.',
  ]) {
    const modified = structuredClone(source);
    const proof = `https://${host}/public-proof`;
    modified.people[0].accounts[0].evidence_url = proof;
    modified.people[0].accounts[0].source_urls = [proof];
    const checked = auditGuestSocialDirectory(modified, { today: '2026-10-29' });
    assert.equal(checked.valid, false, host);
    assert.deepEqual(checked.people, [], host);
  }
});
