/**
 * Evidence-gated guest ranking. No actual guest data is bundled here.
 * This function deliberately refuses independent-demo scores, since those
 * are NOT on the TV show's official measurement scale.
 */
export function rankComparableGuests(userResult, guestRecords, { limit = 5 } = {}) {
  if (!userResult || userResult.origin !== 'licensed_official') {
    return { status: 'incomparable_test', matches: [], excluded: guestRecords?.length ?? 0 };
  }
  // A partial or unversioned official result must never be ranked as if it
  // covered the complete, same-season measurement. S1 has four axes; S2 three.
  const expectedAxes = userResult.season === 1 ? 4 : userResult.season === 2 ? 3 : null;
  if (!Array.isArray(guestRecords) || expectedAxes === null ||
      typeof userResult.question_version !== 'string' || !userResult.question_version.trim() ||
      typeof userResult.scoring_version !== 'string' || !userResult.scoring_version.trim() ||
      !Array.isArray(userResult.dimensions) || userResult.dimensions.length !== expectedAxes ||
      !Number.isSafeInteger(limit) || limit < 1 || limit > 20) {
    throw new Error('无效的匹配输入');
  }
  const axes = new Map();
  for (const dimension of userResult.dimensions) {
    if (!dimension || typeof dimension !== 'object' ||
        typeof dimension.id !== 'string' || !dimension.id.trim() ||
        axes.has(dimension.id) || !isScore(dimension.score)) {
      throw new Error('用户维度不完整或重复');
    }
    axes.set(dimension.id, dimension.score);
  }
  // Duplicate IDs in the same season make a person's ranking ambiguous.
  // Reject all conflicting records rather than arbitrarily selecting a score.
  const seenIds = new Set();
  const duplicateIds = new Set();
  for (const record of guestRecords) {
    if (!record || record.season !== userResult.season ||
        typeof record.id !== 'string' || !record.id.trim()) continue;
    const id = record.id.trim();
    if (seenIds.has(id)) duplicateIds.add(id);
    seenIds.add(id);
  }
  const eligible = [];
  for (const guest of guestRecords) {
    if (!guest || guest.season !== userResult.season ||
        guest.question_version !== userResult.question_version ||
        guest.scoring_version !== userResult.scoring_version ||
        typeof guest.stage_name !== 'string' || !guest.stage_name.trim() ||
        typeof guest.id !== 'string' || !guest.id.trim() || duplicateIds.has(guest.id.trim()) ||
        !isVerifiedUrl(guest.score_source_url) || !isDate(guest.score_checked_at) ||
        !hasHumanReviewedScoreEvidence(guest)) continue;
    if (!Array.isArray(guest.dimensions) || guest.dimensions.length !== axes.size) continue;
    const comparable = new Map();
    for (const dimension of guest.dimensions) {
      if (!dimension || typeof dimension !== 'object' ||
          typeof dimension.id !== 'string' || !axes.has(dimension.id) ||
          comparable.has(dimension.id) || !isScore(dimension.score)) break;
      comparable.set(dimension.id, dimension.score);
    }
    if (comparable.size !== axes.size) continue;
    const axisDifferences = [...axes].map(([axis, score]) => ({ axis, delta: Math.abs(score - comparable.get(axis)) }));
    const difference = axisDifferences.reduce((total, x) => total + x.delta, 0) / axes.size;
    eligible.push({
      guest_id: guest.id, stage_name: guest.stage_name, difference,
      axis_differences: axisDifferences,
      score_source_url: guest.score_source_url, score_checked_at: guest.score_checked_at,
      social_accounts: verifiedPublicAccounts(guest.social_accounts),
    });
  }
  eligible.sort((a, b) => a.difference - b.difference || a.guest_id.localeCompare(b.guest_id));
  // Retain ties at the final rank rather than pretending one tied guest is closer.
  const threshold = eligible[Math.min(limit, eligible.length) - 1]?.difference;
  const matches = eligible.filter((x) => x.difference <= threshold);
  return { status: matches.length ? 'ready' : 'no_verified_comparables',
    matches, excluded: guestRecords.length - eligible.length, metric: 'mean_absolute_difference_-100_to_100' };
}

// A URL and an observation date alone do not establish that the numbers were
// read from the cited original item or independently checked by a person.
// This is a data-contract gate, NOT automatic proof that a human actually
// reviewed the source; real admissions still require independent readback.
function hasHumanReviewedScoreEvidence(guest) {
  return guest.score_review_status === 'human_reviewed_primary_source' &&
    typeof guest.score_source_locator === 'string' &&
    guest.score_source_locator.trim().length >= 8 &&
    isDate(guest.score_reviewed_at) &&
    guest.score_reviewed_at >= guest.score_checked_at;
}

function isScore(value) { return Number.isFinite(value) && value >= -100 && value <= 100; }
function isDate(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const timestamp = Date.parse(value + 'T00:00:00Z');
  return Number.isFinite(timestamp) && new Date(timestamp).toISOString().slice(0, 10) === value &&
    value <= new Date().toISOString().slice(0, 10);
}
const NONPUBLIC_DOMAINS = new Set([
  'localhost', 'local', 'internal', 'test', 'invalid', 'example',
  'example.com', 'example.net', 'example.org', 'home.arpa', 'onion', 'alt',
]);
function isNonpublicDomain(host) {
  const normalized = host.toLowerCase().replace(/\.$/, '');
  return [...NONPUBLIC_DOMAINS].some(domain =>
    normalized === domain || normalized.endsWith(`.${domain}`));
}
function publicHttpsUrl(value) {
  if (typeof value !== 'string') return null;
  try {
    const url = new URL(value);
    const host = url.hostname.toLowerCase().replace(/\.$/, '');
    if (url.protocol !== 'https:' || !host || url.username || url.password || url.port ||
        isNonpublicDomain(host) ||
        !host.includes('.') || host.startsWith('[') || /^\d+(?:\.\d+){3}$/.test(host)) return null;
    return url;
  } catch { return null; }
}
function isVerifiedUrl(value) { return publicHttpsUrl(value) !== null; }
// Navigation endpoints are not guest profiles. Keep this boundary aligned
// with the public directory audit, including rejecting tracking parameters.
const RESERVED_PROFILE_SEGMENTS = new Set([
  'home', 'share', 'intent', 'search', 'explore', 'messages',
  'notifications', 'settings', 'login', 'i', 'accounts', 'direct',
  'about', 'stories', 'p', 'reel', 'reels',
]);
function isPlatformProfileUrl(platform, value) {
  const url = publicHttpsUrl(value);
  if (!url || url.search || url.hash) return false;
  const host = url.hostname.toLowerCase().replace(/^www\./, '');
  const segments = url.pathname.split('/').filter(Boolean);
  const first = segments[0]?.toLowerCase();
  if (platform === 'X') return ['x.com', 'twitter.com', 'mobile.twitter.com'].includes(host) &&
    segments.length === 1 && !RESERVED_PROFILE_SEGMENTS.has(first);
  if (platform === 'Instagram') return host === 'instagram.com' && segments.length === 1 &&
    !RESERVED_PROFILE_SEGMENTS.has(first);
  if (platform === 'YouTube') return ['youtube.com', 'm.youtube.com'].includes(host) &&
    ((segments.length === 1 && first.startsWith('@') && first.length > 1) ||
     (segments.length === 2 && ['channel', 'user', 'c'].includes(first)));
  return platform === 'other';
}
function verifiedPublicAccounts(accounts) {
  if (!Array.isArray(accounts)) return [];
  return accounts.filter(a => a &&
    ['X', 'Instagram', 'YouTube', 'other'].includes(a.platform) &&
    isPlatformProfileUrl(a.platform, a.profile_url) &&
    isVerifiedUrl(a.identity_source_url) && isDate(a.verified_at))
    .map(a => ({ platform: a.platform, profile_url: a.profile_url,
      identity_source_url: a.identity_source_url, verified_at: a.verified_at }));
}
