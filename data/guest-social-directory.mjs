import directory from './guest-social-directory.json' with { type: 'json' };

// Public navigation records only. This dataset never enters score ranking.
export const GUEST_SOCIAL_DIRECTORY = Object.freeze(directory.people.map(person => Object.freeze({
  ...person,
  accounts: Object.freeze(person.accounts.map(account => Object.freeze({
    ...account,
    source_urls: Object.freeze([...account.source_urls]),
  }))),
})));

export function directoryScope() { return directory.scope; }
