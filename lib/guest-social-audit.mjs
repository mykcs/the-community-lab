// Public navigation evidence gate. This is a structural/URL audit, NOT a
// human identity verification, a licence grant, or proof of official scores.
const ROOT_KEYS = ['scope', 'source_review', 'ig_limit', 'people'];
const PERSON_KEYS = ['season', 'stage_name_ko', 'accounts', 'score_source', 'matching_eligible', 'activity'];
const ACCOUNT_KEYS = ['platform', 'url', 'relationship', 'evidence_url', 'source_review',
  'checked_at', 'profile_directly_checked', 'evidence_scope', 'source_urls'];
const REVIEW = 'TWO_INDEPENDENT_AGENT_PRIMARY_SOURCE_CHECKS';
const RESERVED = new Set(['home', 'share', 'intent', 'search', 'explore', 'messages',
  'notifications', 'settings', 'login', 'i', 'accounts', 'direct', 'about',
  'stories', 'p', 'reel', 'reels']);

function record(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value) &&
    [Object.prototype, null].includes(Object.getPrototypeOf(value));
}
function onlyKeys(value, keys) {
  return record(value) && Object.keys(value).every(key => keys.includes(key)) &&
    keys.every(key => Object.hasOwn(value, key));
}
function httpsUrl(value) {
  if (typeof value !== 'string') return null;
  try {
    const url = new URL(value);
    const host = url.hostname.toLowerCase();
    if (url.protocol !== 'https:' || url.username || url.password || url.port ||
        host === 'localhost' || host.endsWith('.localhost') ||
        host.endsWith('.local') || host.endsWith('.internal') ||
        host.startsWith('[') || /^\d+(?:\.\d+){3}$/.test(host) ||
        !host.includes('.')) return null;
    return url;
  } catch { return null; }
}
function profileUrl(platform, value) {
  const url = httpsUrl(value);
  if (!url || url.search || url.hash) return false;
  const host = url.hostname.toLowerCase().replace(/^www\./, '');
  const segments = url.pathname.split('/').filter(Boolean);
  const first = segments[0]?.toLowerCase();
  if (platform === 'Instagram') {
    return host === 'instagram.com' && segments.length === 1 && !RESERVED.has(first);
  }
  if (platform === 'YouTube') {
    return ['youtube.com', 'm.youtube.com'].includes(host) &&
      ((segments.length === 1 && first.startsWith('@') && first.length > 1) ||
       (segments.length === 2 && ['channel', 'user', 'c'].includes(first) && segments[1].length > 1));
  }
  if (platform === 'X') {
    return ['x.com', 'twitter.com', 'mobile.twitter.com'].includes(host) &&
      segments.length === 1 && !RESERVED.has(first);
  }
  return false;
}
function validDate(value, today) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = Date.parse(value + 'T00:00:00Z');
  return Number.isFinite(parsed) &&
    new Date(parsed).toISOString().slice(0, 10) === value && value <= today;
}

/**
 * Fail closed: a bad record suppresses the entire navigation directory.
 * The quiz still works; the UI must not publish unsupported personal links.
 * A green result confirms only internal data constraints, not identity or activity.
 */
export function auditGuestSocialDirectory(directory, { today = new Date().toISOString().slice(0, 10) } = {}) {
  const issues = [];
  if (!onlyKeys(directory, ROOT_KEYS) || !Array.isArray(directory.people) ||
      !/no scores, rankings, activity claims or human-review claims/.test(directory.scope) ||
      !/Two independent Agents/.test(directory.source_review) ||
      !/not directly opened/.test(directory.ig_limit)) {
    return { valid: false, issues: ['directory: unrecognized scope or missing evidence limitations'], people: [] };
  }
  const seenPeople = new Set();
  // A personal profile must not silently become two unrelated guests.
  const seenProfiles = new Map();
  for (const [index, person] of directory.people.entries()) {
    const label = 'person[' + index + ']';
    if (!onlyKeys(person, PERSON_KEYS) || ![1, 2].includes(person.season) ||
        typeof person.stage_name_ko !== 'string' || !/[가-힣]/.test(person.stage_name_ko) ||
        person.score_source !== 'UNKNOWN' || person.matching_eligible !== false ||
        person.activity !== 'UNKNOWN' || !Array.isArray(person.accounts) || !person.accounts.length) {
      issues.push(label + ': unverifiable person, score, matching or activity fields');
      continue;
    }
    const identity = person.season + ':' + person.stage_name_ko.trim();
    if (seenPeople.has(identity)) issues.push(label + ': duplicated season/stage identity');
    seenPeople.add(identity);
    const localLinks = new Set();
    for (const [accountIndex, account] of person.accounts.entries()) {
      const at = label + '.accounts[' + accountIndex + ']';
      if (!onlyKeys(account, ACCOUNT_KEYS)) {
        issues.push(at + ': missing or unexpected fields');
        continue;
      }
      const relationshipOk = account.platform === 'YouTube'
        ? ['personal_channel', 'co_hosted_channel'].includes(account.relationship)
        : ['Instagram', 'X'].includes(account.platform) && account.relationship === 'personal_account';
      if (!relationshipOk || !profileUrl(account.platform, account.url) ||
          account.source_review !== REVIEW || account.profile_directly_checked !== false ||
          !validDate(account.checked_at, today) ||
          typeof account.evidence_scope !== 'string' || !account.evidence_scope.trim() ||
          !httpsUrl(account.evidence_url) || !Array.isArray(account.source_urls) ||
          !account.source_urls.length ||
          !account.source_urls.every(url => httpsUrl(url) !== null) ||
          !account.source_urls.includes(account.evidence_url)) {
        issues.push(at + ': unsafe profile, missing provenance or unverified review claim');
      }
      const key = account.platform + ':' + account.url;
      if (localLinks.has(key)) issues.push(at + ': duplicate profile for one person');
      localLinks.add(key);
      // Normalize common domain aliases for the *same* public profile,
      // while preserving case-sensitive YouTube channel IDs.
      if (profileUrl(account.platform, account.url)) {
        const url = new URL(account.url);
        let host = url.hostname.toLowerCase().replace(/^www\./, '');
        if (host === 'm.youtube.com') host = 'youtube.com';
        if (host === 'mobile.twitter.com' || host === 'twitter.com') host = 'x.com';
        const path = url.pathname.replace(/\/+$/, '');
        let canonicalPath = path.toLowerCase();
        if (account.platform === 'YouTube') {
          // YouTube handles ignore case, but /channel/ IDs are case-sensitive.
          // Decode international handles before Unicode case folding.
          if (path.startsWith('/@')) {
            try { canonicalPath = decodeURIComponent(path).normalize('NFC').toLowerCase(); }
            catch { issues.push(at + ': malformed YouTube handle encoding'); continue; }
          } else {
            canonicalPath = path;
          }
        }
        const profileKey = account.platform + ':' + host + canonicalPath;
        const previous = seenProfiles.get(profileKey);
        if (previous && (previous.identity === identity ||
            previous.relationship !== 'co_hosted_channel' || account.relationship !== 'co_hosted_channel')) {
          issues.push(at + ': profile attributed more than once without a shared-channel exception');
        } else if (!previous) {
          seenProfiles.set(profileKey, { identity, relationship: account.relationship });
        }
      }
    }
  }
  return { valid: issues.length === 0, issues,
    people: issues.length === 0 ? directory.people : [] };
}
