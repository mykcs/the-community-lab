import directory from './guest-social-directory.json' with { type: 'json' };
import { auditGuestSocialDirectory } from '../lib/guest-social-audit.mjs';

// Navigation only. This record never enters official scoring or guest ranking.
// One poisoned/stale evidence row suppresses the entire directory, while the
// independent demo quiz remains usable. CI tests require a clean audit.
const reviewed = auditGuestSocialDirectory(directory);
export const GUEST_SOCIAL_DIRECTORY_AUDIT = Object.freeze({
  valid: reviewed.valid, issues: Object.freeze([...reviewed.issues]),
});
export const GUEST_SOCIAL_DIRECTORY = Object.freeze(reviewed.people.map(person => Object.freeze({
  ...person,
  accounts: Object.freeze(person.accounts.map(account => Object.freeze({
    ...account,
    source_urls: Object.freeze([...account.source_urls]),
  }))),
})));

export function directoryScope() { return directory.scope; }
