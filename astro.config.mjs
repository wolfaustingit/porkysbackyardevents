// @ts-check
import { defineConfig } from 'astro/config';
import sitemap from '@astrojs/sitemap';

// https://astro.build/config
export default defineConfig({
  site: 'https://porkysbackyardevents.com',
  output: 'static',
  integrations: [sitemap()],
  // One page sharing one token file — inlining removes a render-blocking
  // round trip on the only paint that matters here. Same call as the sibling
  // sites in this portfolio.
  build: { inlineStylesheets: 'always' },
  // 4321 conroebc, 4322/4323 timberforestbp, 4324/4325 atascocitastowandgo.
  // Keep every site in the portfolio runnable at once.
  server: { port: Number(process.env.PORT) || 4326 },
});
