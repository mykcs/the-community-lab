// Keep offline review pages executable while disallowing unreviewed scripts and
// outbound network subresources. Hash only the ONE executable inline script;
// the embedded source-question JSON is inert application/json, not a script.
// After deliberately editing either review app, run --write and commit its CSP.
import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';

export const REVIEW_PAGES = [
  'docs/translation-review/index.html',
  'docs/original-question-translation-review/index.html',
];

const META_RE = /<meta\s+http-equiv=["']Content-Security-Policy["']\s+content="[^"]*"\s*\/?\s*>/i;

export function expectedReviewCsp(html) {
  const scriptTags = [...html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)];
  const executable = scriptTags.filter(([, attrs]) => !/\btype\s*=\s*["']application\/json["']/i.test(attrs));
  if (executable.length !== 1 || executable.some(([, attrs]) => /\bsrc\s*=|\btype\s*=/i.test(attrs))) {
    throw new Error('Review CSP expects exactly one inline executable script and no external scripts');
  }
  const scriptHash = createHash('sha256').update(executable[0][2], 'utf8').digest('base64');
  return [
    "default-src 'none'",
    "base-uri 'none'",
    `script-src 'sha256-${scriptHash}'`,
    "style-src 'unsafe-inline'",
    'img-src data:',
    "font-src 'none'",
    "connect-src 'none'",
    "frame-src 'none'",
    "media-src 'none'",
    "worker-src 'none'",
    "form-action 'none'",
    "object-src 'none'",
  ].join('; ');
}

export function withReviewCsp(html) {
  const policy = expectedReviewCsp(html);
  const meta = `<meta http-equiv="Content-Security-Policy" content="${policy.replaceAll("'", '&#39;')}">`;
  if (META_RE.test(html)) return html.replace(META_RE, meta);
  const charset = /<meta\s+charset=["']utf-8["']\s*\/?>/i;
  if (!charset.test(html)) throw new Error('No UTF-8 charset meta tag: fail closed');
  return html.replace(charset, match => match + '\n' + meta);
}

export async function checkReviewCsp({ write = false } = {}) {
  for (const path of REVIEW_PAGES) {
    const source = await readFile(path, 'utf8');
    const expected = withReviewCsp(source);
    if (expected === source) continue;
    if (!write) throw new Error(`${path}: review CSP missing or script hash stale; run node scripts/sync-review-csp.mjs --write`);
    await writeFile(path, expected);
    console.log(`Updated privacy CSP: ${path}`);
  }
}

if (process.argv[1]?.endsWith('/sync-review-csp.mjs')) {
  const arg = process.argv[2] ?? '--check';
  if (!['--check', '--write'].includes(arg)) throw new Error('Use --check or --write');
  await checkReviewCsp({ write: arg === '--write' });
}
