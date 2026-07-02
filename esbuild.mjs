import { build } from 'esbuild';
import { cpSync, mkdirSync, rmSync } from 'node:fs';

const entries = ['background', 'content-bridge', 'wa-content', 'popup'];

const isDev = process.env.NODE_ENV !== 'production';

rmSync('dist', { recursive: true, force: true });
mkdirSync('dist', { recursive: true });

await build({
  entryPoints: entries.map((e) => `src/${e}.ts`),
  bundle: true,
  format: 'iife',
  target: 'chrome110',
  outdir: 'dist',
  minify: !isDev,
  legalComments: 'none',
  logLevel: 'info',
});

cpSync('public', 'dist', { recursive: true });

console.log(`build ok (${isDev ? 'development (unminified)' : 'production (minified)'}) -> dist/`);
