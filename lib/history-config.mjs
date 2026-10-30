export const HISTORY_AUTH_STORAGE_KEY = 'community-auth-v1';

// Astro's BASE_URL is '/' for the rollback site and '/the-community-lab/' for
// project GitHub Pages. Only site-local, fixed routes may be composed here.
export function siteRoutePath(basePath = '/', route = '') {
  if (typeof basePath !== 'string' || !/^\/(?:[a-zA-Z0-9_-]+\/)*$/.test(basePath) ||
      typeof route !== 'string' || !/^(?:[a-zA-Z0-9_-]+\/)*$/.test(route)) {
    throw new TypeError('Invalid site route');
  }
  return `${basePath}${route}`;
}

function origin(value, allowLocal = false) {
  try {
    const url = new URL(value);
    const local = ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
    if (url.username || url.password || url.search || url.hash || url.pathname !== '/' ||
        (url.protocol !== 'https:' && !(allowLocal && local && url.protocol === 'http:'))) return null;
    return url.origin;
  } catch { return null; }
}

// A publishable key is the only accepted browser key. Do not copy server secrets
// or spread process.env into a browser configuration object.
export function getHistoryConfig(values = {}, currentOrigin = '') {
  const siteOrigin = origin(values.siteOrigin, true);
  const supabaseUrl = origin(values.supabaseUrl);
  let basePath = null, callbackPath = null;
  try {
    basePath = siteRoutePath(values.basePath ?? '/');
    callbackPath = siteRoutePath(basePath, 'auth/callback/');
  } catch { /* Invalid build route fails closed. */ }
  const publishableKey = typeof values.publishableKey === 'string' &&
    /^sb_publishable_[A-Za-z0-9_-]+$/.test(values.publishableKey) ? values.publishableKey : null;
  const configured = values.authEnabled === true && Boolean(siteOrigin && supabaseUrl && publishableKey && callbackPath) &&
    siteOrigin === currentOrigin;
  const privacyReady = typeof values.regionLabel === 'string' && Boolean(values.regionLabel.trim()) &&
    typeof values.retentionLabel === 'string' && Boolean(values.retentionLabel.trim()) &&
    values.privacyApproved === true && values.deletionAvailable === true;
  return Object.freeze({ configured, siteOrigin, basePath, callbackPath, supabaseUrl, publishableKey,
    saveAvailable: configured && privacyReady && values.saveEnabled === true,
    regionLabel: values.regionLabel || '', retentionLabel: values.retentionLabel || '' });
}
