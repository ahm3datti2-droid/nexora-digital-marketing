// Build for Cloudflare Pages (advanced mode):
// copies public/ -> dist/ and src/worker.js -> dist/_worker.js
import { rmSync, cpSync, copyFileSync, existsSync } from 'node:fs';
const root = new URL('..', import.meta.url).pathname;
const out = root + 'dist';
if (existsSync(out)) rmSync(out, { recursive: true });
cpSync(root + 'public', out, { recursive: true });
copyFileSync(root + 'src/worker.js', out + '/_worker.js');
console.log('Built dist/ with _worker.js');
