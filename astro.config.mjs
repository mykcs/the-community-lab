import { defineConfig } from 'astro/config';
import tailwindcss from '@tailwindcss/vite';

// Keep the existing Vercel production build usable during the Pages cutover.
// GitHub project Pages is served below /the-community-lab/, not the domain root.
const githubPages = process.env.COMMUNITY_DEPLOY_TARGET === 'github-pages';

export default defineConfig({
  output: 'static',
  site: githubPages ? 'https://mykcs.github.io' : 'https://the-community-lab.vercel.app',
  base: githubPages ? '/the-community-lab/' : '/',
  vite: { plugins: [tailwindcss()] },
});
