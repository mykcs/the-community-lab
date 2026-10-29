import { defineConfig } from 'astro/config';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  output: 'static',
  site: 'https://the-community-lab.vercel.app',
  vite: { plugins: [tailwindcss()] },
});
