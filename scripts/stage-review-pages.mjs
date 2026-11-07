import { copyFileSync, mkdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

// Match the actual GitHub Pages artifact in BOTH local preview and Actions.
// These are the already-public, explicitly unreviewed source-draft pages;
// copying them here does not upgrade translation, rights or scoring status.
export const REVIEW_ROUTES = [
  'translation-review',
  'original-question-translation-review',
];

export function stageReviewPages(repositoryRoot = process.cwd()) {
  for (const route of REVIEW_ROUTES) {
    const source = join(repositoryRoot, 'docs', route, 'index.html');
    const target = join(repositoryRoot, 'dist', route, 'index.html');
    mkdirSync(dirname(target), { recursive: true });
    copyFileSync(source, target);
  }
}

// Vercel is only an unchanged rollback snapshot; Pages owns these routes.
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url) &&
    process.env.COMMUNITY_DEPLOY_TARGET === 'github-pages') {
  stageReviewPages();
  console.log('Staged two source-draft reviewer routes for GitHub Pages.');
}
