// Local test harness: runs src/worker.js on Node with a SQLite-backed fake D1
// and a static-assets fake that mimics Cloudflare's default html_handling.
import { DatabaseSync } from 'node:sqlite';
import { createServer } from 'node:http';
import { readFileSync, existsSync, statSync } from 'node:fs';
import { join, extname } from 'node:path';
import worker from '../src/worker.js';

const ROOT = new URL('..', import.meta.url).pathname;

class Stmt {
  constructor(db, sql) { this.db = db; this.sql = sql; this.args = []; }
  bind(...a) { this.args = a; return this; }
  _s() { return this.db.prepare(this.sql); }
  async first() { return this._s().get(...this.args) ?? null; }
  async all() { return { results: this._s().all(...this.args), success: true }; }
  async run() { const r = this._s().run(...this.args); return { success: true, meta: { changes: Number(r.changes), last_row_id: Number(r.lastInsertRowid) } }; }
  _batch() { return /^\s*select/i.test(this.sql) ? { results: this._s().all(...this.args) } : this.run(); }
}

export function makeDb() {
  const db = new DatabaseSync(':memory:');
  db.exec(readFileSync(join(ROOT, 'migrations/0001_init.sql'), 'utf8'));
  return {
    raw: db,
    prepare: (sql) => new Stmt(db, sql),
    batch: async (stmts) => Promise.all(stmts.map((s) => s._batch())),
  };
}

const TYPES = { '.html': 'text/html; charset=utf-8', '.css': 'text/css', '.js': 'application/javascript', '.png': 'image/png', '.jpg': 'image/jpeg', '.txt': 'text/plain', '.webmanifest': 'application/manifest+json' };
const ASSETS = {
  async fetch(req) {
    const url = new URL(req.url);
    let p = decodeURIComponent(url.pathname);
    const pub = join(ROOT, 'public');
    let file = join(pub, p);
    if (!file.startsWith(pub)) return new Response('bad', { status: 400 });
    if (existsSync(file) && statSync(file).isDirectory()) {
      if (!p.endsWith('/')) return new Response(null, { status: 307, headers: { location: p + '/' } });
      file = join(file, 'index.html');
    } else if (!existsSync(file) && existsSync(file + '.html')) file += '.html';
    if (!existsSync(file)) return new Response(readFileSync(join(pub, '404.html')), { status: 404, headers: { 'content-type': TYPES['.html'] } });
    return new Response(readFileSync(file), { headers: { 'content-type': TYPES[extname(file)] || 'application/octet-stream' } });
  },
};

export function startServer(port, env) {
  const server = createServer(async (req, res) => {
    const chunks = [];
    for await (const c of req) chunks.push(c);
    const body = chunks.length ? Buffer.concat(chunks) : undefined;
    const headers = new Headers();
    for (const [k, v] of Object.entries(req.headers)) headers.set(k, Array.isArray(v) ? v.join(', ') : v);
    headers.set('cf-connecting-ip', req.headers['x-test-ip'] || '127.0.0.1');
    const request = new Request(`http://localhost:${port}${req.url}`, { method: req.method, headers, body: ['GET', 'HEAD'].includes(req.method) ? undefined : body });
    const r = await worker.fetch(request, env);
    const h = {};
    r.headers.forEach((v, k) => { h[k] = v; });
    // local test runs over http, so drop the Secure flag on cookies
    if (h['set-cookie']) h['set-cookie'] = h['set-cookie'].replace('; Secure', '');
    res.writeHead(r.status, h);
    res.end(Buffer.from(await r.arrayBuffer()));
  });
  return new Promise((resolve) => server.listen(port, () => resolve(server)));
}

export const makeEnv = () => ({ DB: makeDb(), ASSETS });
