import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { REVIEW_PAGES } from './sync-review-csp.mjs';

const block = /<!-- community-design:start -->[\s\S]*?<!-- community-design:end -->\n?/;
export function withReviewDesign(html, tokens) {
  const embedded = `<!-- community-design:start -->\n<style data-community-design>\n${tokens.trim()}\n</style>\n<!-- community-design:end -->\n`;
  return block.test(html) ? html.replace(block, embedded) : html.replace('<style>', embedded + '<style>');
}
export async function syncReviewDesign({ write = false } = {}) {
  const tokens = await readFile('src/styles/tokens.css', 'utf8');
  for (const file of REVIEW_PAGES) {
    const source = await readFile(file, 'utf8');
    const expected = withReviewDesign(source, tokens);
    if (source === expected) continue;
    if (!write) throw new Error(`${file}: shared offline styles are stale; run npm run sync:design`);
    await writeFile(file, expected);
  }
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  await syncReviewDesign({ write: process.argv.includes('--write') });
}
