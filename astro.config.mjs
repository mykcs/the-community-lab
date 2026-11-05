import { defineConfig } from 'astro/config';
import tailwindcss from '@tailwindcss/vite';
import { getPagesDeploymentConfig } from './lib/pages-deployment-config.mjs';

// Keep the Vercel rollback build and existing GitHub project URL stable. When a
// verified custom Pages hostname is configured, the same site builds at `/`.
const githubPages = process.env.COMMUNITY_DEPLOY_TARGET === 'github-pages';
const pages = githubPages ? getPagesDeploymentConfig(process.env) : null;

export default defineConfig({
  output: 'static',
  site: githubPages ? pages.site : 'https://the-community-lab.vercel.app',
  base: githubPages ? pages.base : '/',
  vite: { plugins: [tailwindcss()] },
});
