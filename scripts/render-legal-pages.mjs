import { build, loadEnv } from 'vite';
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

// Legal URLs must remain readable without JavaScript or an authenticated session.
process.env.NODE_ENV = 'production';
const output = process.argv[2] || 'dist';
const mode = process.argv[3] || 'production';
const env = loadEnv(mode, process.cwd(), 'VITE_');
const definitions = Object.fromEntries(Object.entries(env).map(([key, value]) => [`import.meta.env.${key}`, JSON.stringify(value)]));
await build({
  configFile: false,
  logLevel: 'warn',
  define: { ...definitions, 'import.meta.env.VITE_APP_TARGET': JSON.stringify('site') },
  resolve: { alias: { '@': resolve('src') } },
  build: {
    ssr: resolve('src/pages/LegalPage.tsx'), outDir: '.release/legal-render', emptyOutDir: true,
    rolldownOptions: { output: { entryFileNames: 'LegalPage.mjs' } },
  },
});
const { createElement } = await import('react');
const { renderToStaticMarkup } = await import('react-dom/server');
const { StaticRouter } = await import('react-router-dom');
const { default: LegalPage } = await import(pathToFileURL(resolve('.release/legal-render/LegalPage.mjs')).href);
const index = readFileSync(`${output}/index.html`, 'utf8');
const stylesheets = [...index.matchAll(/<link[^>]*rel="stylesheet"[^>]*>/g)].map((match) => match[0]).join('\n');
for (const [path, title] of [['privacidade', 'Política de privacidade'], ['suporte', 'Suporte'], ['excluir-conta', 'Exclusão de conta e dados']]) {
  const body = renderToStaticMarkup(createElement(StaticRouter, { location: `/${path}` }, createElement(LegalPage)));
  mkdirSync(`${output}/${path}`, { recursive: true });
  writeFileSync(`${output}/${path}/index.html`, `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="index,follow"><title>${title} | Best Part School</title>${stylesheets}</head><body>${body}</body></html>`);
}
console.log(`Páginas públicas de privacidade, suporte e exclusão exportadas em ${output}.`);
