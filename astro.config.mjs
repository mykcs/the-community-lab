import { defineConfig } from 'astro/config';
import tailwindcss from '@tailwindcss/vite';
import { selectedDeployTarget } from './scripts/deploy-target.mjs';
import { getPagesDeploymentConfig } from './lib/pages-deployment-config.mjs';

// Pages is the live site and therefore the default for local npm run build.
// Only an explicit rollback build uses Vercel's root-relative paths.
const githubPages = selectedDeployTarget() === 'github-pages';
const pages = githubPages ? getPagesDeploymentConfig(process.env) : null;

export default defineConfig({
  output: 'static',
  site: githubPages ? pages.site : 'https://the-community-lab.vercel.app',
  base: githubPages ? pages.base : '/',
  vite: { plugins: [tailwindcss()] },
});
