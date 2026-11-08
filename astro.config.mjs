import { defineConfig } from 'astro/config';
import tailwindcss from '@tailwindcss/vite';
import { selectedDeployTarget } from './scripts/deploy-target.mjs';

// Pages is the live site and therefore the default for local npm run build.
// Only an explicit rollback build should use Vercel's root-relative paths.
const githubPages = selectedDeployTarget() === 'github-pages';

export default defineConfig({
  output: 'static',
  site: githubPages ? 'https://mykcs.github.io' : 'https://the-community-lab.vercel.app',
  base: githubPages ? '/the-community-lab/' : '/',
  vite: { plugins: [tailwindcss()] },
});
