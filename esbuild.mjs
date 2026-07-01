import { build } from 'esbuild';
import { cpSync, mkdirSync } from 'node:fs';

const entries = ['background', 'content-bridge', 'wa-content', 'popup'];

mkdirSync('dist', { recursive: true });

await build({
  entryPoints: entries.map((e) => `src/${e}.ts`),
  bundle: true,
  format: 'iife',
  target: 'chrome110',
  outdir: 'dist',
  minify: false,
  legalComments: 'none',
  logLevel: 'info',
});

// copy static files (manifest.json, popup.html)
cpSync('public', 'dist', { recursive: true });

console.log('build ok -> dist/');
