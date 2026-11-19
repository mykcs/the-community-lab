import { readFile, readdir } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { syncReviewDesign } from './sync-review-design.mjs';
import { nonCanonicalDates } from '../lib/calendar-date.mjs';

export const DESIGN_SOURCES = ['src/styles/global.css', 'src/pages/index.astro', 'src/pages/questionnaire/index.astro', 'docs/translation-review/index.html', 'docs/original-question-translation-review/index.html'];
export function stylesFrom(source, file) {
  if (file.endsWith('.css')) return source;
  return [...source.replace(/<!-- community-design:start -->[\s\S]*?<!-- community-design:end -->/g, '').matchAll(/<style[^>]*>([\s\S]*?)<\/style>/g)].map(match => match[1]).join('\n');
}
export function styleViolations(css) {
  const problems = [];
  // Narrow exemption: the standard screen-reader clipping box, not a UI gap.
  css = css.replace(/\.full-sr-only\{[^}]*\}/g, '');
  for (const match of css.matchAll(/(?:^|[;{])\s*(font-size|font-family|font-weight|line-height|font|max-width|margin(?:-[\w]+)?|padding(?:-[\w]+)?|gap|row-gap|column-gap)\s*:\s*([^;}]+)/g)) {
    const [, property, value] = match;
    if (/font|line-height/.test(property) && !/^(?:inherit|normal)$/.test(value.trim()) && !value.includes('var(--')) problems.push(`${property}: ${value}`);
    if (/max-width|margin|padding|gap/.test(property) && /[-\d.]+(?:px|rem|em)\b/.test(value)) problems.push(`${property}: ${value}`);
  }
  return problems;
}
export async function sourceFiles(dir) {
  const files=[];
  for(const entry of await readdir(dir,{withFileTypes:true})){
    const file=join(dir,entry.name);
    if(entry.isDirectory())files.push(...await sourceFiles(file));
    else if(/\.(astro|css)$/.test(file) && !file.endsWith('/tokens.css'))files.push(file);
  }
  return files.sort();
}
export async function htmlFiles(dir) {
  const files = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const file = join(dir, entry.name);
    if (entry.isDirectory()) files.push(...await htmlFiles(file));
    else if (file.endsWith('.html')) files.push(file);
  }
  return files.sort();
}
export function assertBuiltOwnership(file, html, css) {
  if (!/--community-design-version\s*:\s*1\b/.test(css) || !/font(?:-size)?\s*:[^;}]*var\(--type-body\)/.test(css) || !/padding[^:]*:[^;}]*var\(--space-/.test(css)) throw new Error(`${file}: missing executable shared design owner/consumers`);
  const visible = html.replace(/<(script|style|code|pre|svg)\b[^>]*>[\s\S]*?<\/\1>/gi, '').replace(/<[^>]*>/g, ' ');
  const dates = nonCanonicalDates(visible);
  if (dates.length) throw new Error(`${file}: noncanonical displayed dates: ${dates.join(', ')}`);
}
export async function checkSiteDesign({ built = false } = {}) {
  await syncReviewDesign();
  for (const file of [...await sourceFiles('src'), ...DESIGN_SOURCES.filter(file => file.startsWith('docs/'))]) {
    const css = stylesFrom(await readFile(file, 'utf8'), file);
    const violations = styleViolations(css);
    if (violations.length) throw new Error(`${file}: unowned presentation declarations\n${violations.join('\n')}`);
  }
  if (built) {
    const files = await htmlFiles('dist');
    if (files.length < 4) throw new Error('The live Pages target must include both offline reviewers');
    for (const file of files) {
      const html = await readFile(file, 'utf8');
      let css = [...html.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/g)].map(match => match[1]).join('\n');
      for (const [, href] of html.matchAll(/<link[^>]*href="([^"]+\.css)"[^>]*>/g)) {
        const relative = href.replace(/^\/the-community-lab\//, '').replace(/^\//, '');
        css += await readFile(join('dist', relative), 'utf8');
      }
      assertBuiltOwnership(file, html, css);
    }
    console.log(`Site design: ${files.length} generated HTML routes consume the shared owner.`);
  } else console.log('Site design: all five style sources and both offline embeds pass.');
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) await checkSiteDesign({ built: process.argv.includes('--built') });
