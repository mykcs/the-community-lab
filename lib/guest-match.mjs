/**
 * Evidence-gated guest ranking. No actual guest data is bundled here.
 * This function deliberately refuses independent-demo scores, since those
 * are NOT on the TV show's official measurement scale.
 */
export function rankComparableGuests(userResult, guestRecords, { limit = 5 } = {}) {
  if (!userResult || userResult.origin !== 'licensed_official') {
    return { status: 'incomparable_test', matches: [], excluded: guestRecords?.length ?? 0 };
  }
  if (!Array.isArray(guestRecords) || !Array.isArray(userResult.dimensions) ||
      !Number.isSafeInteger(limit) || limit < 1 || limit > 20 ||
      userResult.dimensions.length === 0) {
    throw new Error('无效的匹配输入');
  }
  const axes = new Map();
  for (const dimension of userResult.dimensions) {
    if (axes.has(dimension.id) || !isScore(dimension.score)) throw new Error('用户维度不完整或重复');
    axes.set(dimension.id, dimension.score);
  }
  const eligible = [];
  for (const guest of guestRecords) {
    if (guest.season !== userResult.season ||
        guest.question_version !== userResult.question_version ||
        guest.scoring_version !== userResult.scoring_version ||
        !guest.stage_name || !guest.id ||
        !isVerifiedUrl(guest.score_source_url) || !isDate(guest.score_checked_at)) continue;
    if (!Array.isArray(guest.dimensions) || guest.dimensions.length !== axes.size) continue;
    const comparable = new Map();
    for (const dimension of guest.dimensions) {
      if (!axes.has(dimension.id) || comparable.has(dimension.id) || !isScore(dimension.score)) break;
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

function isScore(value) { return Number.isFinite(value) && value >= -100 && value <= 100; }
function isDate(value) { return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value); }
function isVerifiedUrl(value) {
  if (typeof value !== 'string') return false;
  try { const url = new URL(value); return url.protocol === 'https:' && Boolean(url.hostname); }
  catch { return false; }
}
function verifiedPublicAccounts(accounts) {
  if (!Array.isArray(accounts)) return [];
  return accounts.filter(a =>
    ['X', 'Instagram', 'YouTube', 'other'].includes(a.platform) &&
    isVerifiedUrl(a.profile_url) && isVerifiedUrl(a.identity_source_url) && isDate(a.verified_at))
    .map(a => ({ platform: a.platform, profile_url: a.profile_url,
      identity_source_url: a.identity_source_url, verified_at: a.verified_at }));
}
