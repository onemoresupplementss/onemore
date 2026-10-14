import { defineConfig } from 'astro/config';
import preact from '@astrojs/preact';
import sitemap from '@astrojs/sitemap';
import tailwindcss from '@tailwindcss/vite';
import shop from './shop.config.json' with { type: 'json' };

// Static site: every page is built ahead of time. The only server code is in
// functions/ (Cloudflare Pages Functions) for orders and the live stock feed.
// The GitHub Pages workflow sets SITE_URL and BASE_PATH (the repository sub-folder).
export default defineConfig({
  site: process.env.SITE_URL || shop.siteUrl,
  base: process.env.BASE_PATH || '/',
  trailingSlash: 'always',
  integrations: [
    preact(),
    sitemap({ filter: (page) => !/\/(checkout|order)\/$/.test(page) }),
  ],
  vite: {
    plugins: [tailwindcss()],
  },
  build: {
    inlineStylesheets: 'always',
  },
});
