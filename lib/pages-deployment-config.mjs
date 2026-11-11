const PROJECT_PAGES_SITE = 'https://mykcs.github.io';
const PROJECT_PAGES_BASE = '/the-community-lab/';

function customDomain(value) {
  if (value == null || value === '') return null;
  if (typeof value !== 'string' || value !== value.trim()) {
    throw new TypeError('COMMUNITY_PAGES_DOMAIN must be a hostname without a scheme or path');
  }

  let url;
  try { url = new URL(`https://${value}`); }
  catch { throw new TypeError('COMMUNITY_PAGES_DOMAIN must be a valid hostname'); }

  const hostname = url.hostname.toLowerCase();
  if (url.username || url.password || url.port || url.pathname !== '/' || url.search || url.hash ||
      !hostname.includes('.') || hostname === 'github.io' || hostname.endsWith('.github.io')) {
    throw new TypeError('COMMUNITY_PAGES_DOMAIN must be a dedicated public hostname, not a GitHub Pages shared origin');
  }
  return hostname;
}

export function getPagesDeploymentConfig(env = {}) {
  const domain = customDomain(env.COMMUNITY_PAGES_DOMAIN);
  const site = domain ? `https://${domain}` : PROJECT_PAGES_SITE;
  const base = domain ? '/' : PROJECT_PAGES_BASE;
  const publicUrl = domain ? site : `${site}${base.replace(/\/$/, '')}`;
  return Object.freeze({ site, base, publicUrl, customDomain: domain });
}
