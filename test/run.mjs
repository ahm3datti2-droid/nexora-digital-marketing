import { startServer, makeEnv } from './harness.mjs';
import { createHash } from 'node:crypto';

const PORT = 8788;
// Mock Telegram API
const tgCalls = [];
const realFetch = globalThis.fetch;
globalThis.fetch = async (url, init) => {
  const u = String(url);
  if (u.startsWith('https://api.telegram.org/')) {
    const method = u.split('/').pop();
    const body = init?.body ? JSON.parse(init.body) : {};
    tgCalls.push({ method, body });
    if (u.includes(':BAD')) return new Response(JSON.stringify({ ok: false, description: 'Unauthorized' }));
    const result = method === 'getMe' ? { username: 'nexora_test_bot' }
      : method === 'getUpdates' ? [{ message: { chat: { id: 5551234, first_name: 'Ahmed' } } }]
      : { message_id: 1 };
    return new Response(JSON.stringify({ ok: true, result }));
  }
  return realFetch(url, init);
};
const env = makeEnv();
const SETUP_CODE = 'test-setup-code-123';
env.DB.raw.prepare(`INSERT INTO system (key, value) VALUES ('setup_code_hash', ?)`).run(createHash('sha256').update(SETUP_CODE).digest('hex'));
const server = await startServer(PORT, env);
const B = `http://localhost:${PORT}`;

let pass = 0, fail = 0;
const ok = (cond, name, extra = '') => { if (cond) { pass++; console.log('  ✓', name); } else { fail++; console.log('  ✗', name, extra); } };
let cookie = '';
async function call(method, path, body, opts = {}) {
  const headers = { ...(opts.headers || {}) };
  if (body !== undefined) headers['content-type'] = 'application/json';
  if (opts.auth !== false && cookie) headers.cookie = cookie;
  const r = await fetch(B + path, { method, headers, body: body !== undefined ? JSON.stringify(body) : undefined, redirect: 'manual' });
  const sc = r.headers.get('set-cookie');
  if (sc && opts.keepCookie !== false) cookie = sc.split(';')[0];
  let data = null; const t = await r.text(); try { data = JSON.parse(t); } catch { data = t; }
  return { s: r.status, d: data, h: r.headers };
}

console.log('Public');
let r = await call('GET', '/api/health'); ok(r.s === 200 && r.d.db === true, 'health');
r = await call('GET', '/api/content'); ok(r.s === 200 && r.d.services.length === 6 && r.d.faqs.length === 7 && r.d.packages[0].price === '3,500' && r.d.settings.whatsapp === '201117543009' && r.d.packages.length === 3, 'content seeded');
ok(!('setup_code_hash' in r.d.settings), 'no private keys in content');
r = await call('GET', '/'); ok(r.s === 200 && r.h.get('content-security-policy')?.includes("script-src 'self'"), 'home + CSP');
r = await call('GET', '/admin'); ok(r.s === 307, '/admin redirects to /admin/');
r = await call('GET', '/admin/'); ok(r.s === 200 && r.h.get('x-robots-tag')?.includes('noindex'), 'admin page noindex');
r = await call('GET', '/nope'); ok(r.s === 404, '404 page');
r = await call('POST', '/api/contact', { name: 'A' }); ok(r.s === 400, 'contact: short name rejected');
r = await call('POST', '/api/contact', { name: 'Ahmed' }); ok(r.s === 400, 'contact: needs phone or email');
r = await call('POST', '/api/contact', { name: 'Ahmed', email: 'bad' }); ok(r.s === 400, 'contact: bad email');
r = await call('POST', '/api/contact', { name: 'أحمد', phone: '01001234567', service: 'الإعلانات الممولة', message: 'test <script>alert(1)</script>' }); ok(r.s === 201, 'contact: ok');
r = await call('POST', '/api/contact', { name: 'Bot', phone: '0100', website: 'spam' }); ok(r.s === 200 && env.DB.raw.prepare('SELECT COUNT(*) c FROM leads').get().c === 1, 'contact: honeypot dropped');
r = await call('POST', '/api/contact', { name: 'X', phone: '1' }, { headers: { origin: 'https://evil.com' } }); ok(r.s === 403, 'contact: cross-origin blocked');
await fetch(B + '/api/contact', { method: 'POST', body: '{}' }).then((x) => ok(x.status === 415, 'contact: non-JSON rejected'));
for (let i = 0; i < 4; i++) await call('POST', '/api/contact', { name: 'R' + i, email: `r${i}@x.com` }, { headers: { 'x-test-ip': '9.9.9.9' } });
r = await call('POST', '/api/contact', { name: 'R5', email: 'r5@x.com' }, { headers: { 'x-test-ip': '9.9.9.9' } }); ok(r.s === 201, 'contact: 5th allowed');
r = await call('POST', '/api/contact', { name: 'R6', email: 'r6@x.com' }, { headers: { 'x-test-ip': '9.9.9.9' } }); ok(r.s === 429, 'contact: rate limited');
r = await call('POST', '/api/subscribe', { email: 'Sub@Test.com' }); ok(r.s === 201, 'subscribe');
r = await call('POST', '/api/subscribe', { email: 'sub@test.com' }); ok(r.s === 201 && env.DB.raw.prepare('SELECT COUNT(*) c FROM subscribers').get().c === 1, 'subscribe: dedupe');

console.log('Auth');
r = await call('GET', '/api/admin/stats'); ok(r.s === 401, 'admin requires auth');
r = await call('GET', '/api/admin/setup-status'); ok(r.d.needsSetup === true, 'needs setup');
r = await call('POST', '/api/admin/setup', { code: 'wrong', username: 'admin', password: 'Secret12345' }); ok(r.s === 401, 'setup: wrong code');
r = await call('POST', '/api/admin/setup', { code: SETUP_CODE, username: 'admin', password: 'short1' }); ok(r.s === 400, 'setup: weak password');
r = await call('POST', '/api/admin/setup', { code: SETUP_CODE, username: 'a b', password: 'Secret12345' }); ok(r.s === 400, 'setup: bad username');
r = await call('POST', '/api/admin/setup', { code: SETUP_CODE, username: 'nexora', password: 'Secret12345' }); ok(r.s === 201 && cookie.startsWith('nx_session='), 'setup: success + cookie');
ok(!env.DB.raw.prepare(`SELECT 1 FROM system WHERE key='setup_code_hash'`).get(), 'setup code consumed');
r = await call('POST', '/api/admin/setup', { code: SETUP_CODE, username: 'x2', password: 'Secret12345' }); ok(r.s === 403, 'setup: cannot run twice');
r = await call('GET', '/api/admin/me'); ok(r.s === 200 && r.d.username === 'nexora', 'me');
const adm = env.DB.raw.prepare('SELECT password_hash FROM admins').get(); ok(adm.password_hash.length === 64 && !adm.password_hash.includes('Secret'), 'password stored hashed');
r = await call('POST', '/api/admin/logout', undefined); ok(r.s === 200, 'logout');
cookie = '';
r = await call('GET', '/api/admin/me'); ok(r.s === 401, 'after logout 401');
r = await call('POST', '/api/admin/login', { username: 'nexora', password: 'wrongpass1' }); ok(r.s === 401, 'login: wrong password');
r = await call('POST', '/api/admin/login', { username: 'nexora', password: 'Secret12345' }); ok(r.s === 200, 'login: ok');
r = await call('GET', '/api/admin/stats', undefined, { headers: { cookie: 'nx_session=' + 'a'.repeat(64) }, auth: false }); ok(r.s === 401, 'forged session rejected');

console.log('Admin');
r = await call('GET', '/api/admin/stats'); ok(r.s === 200 && r.d.leads === 6 && r.d.byStatus.new === 6 && r.d.subscribers === 1, 'stats');
r = await call('GET', '/api/admin/leads?q=أحمد'); ok(r.d.items.length === 1, 'leads search');
const leadId = r.d.items[0].id;
r = await call('PATCH', `/api/admin/leads/${leadId}`, { status: 'won', notes: 'closed' }); ok(r.s === 200, 'lead update');
r = await call('PATCH', `/api/admin/leads/${leadId}`, { status: 'hacked' }); ok(r.s === 400, 'lead bad status');
r = await call('GET', '/api/admin/leads?status=won'); ok(r.d.items.length === 1 && r.d.items[0].notes === 'closed', 'leads filter');
r = await fetch(B + '/api/admin/leads.csv', { headers: { cookie } }); const csv = await r.text(); ok(r.status === 200 && csv.includes('أحمد') && r.headers.get('content-type').includes('text/csv'), 'csv export');
r = await call('DELETE', `/api/admin/leads/${leadId}`); ok(r.s === 200, 'lead delete');
r = await call('POST', '/api/admin/services', { title: 'Test', icon: '🔥', features: 'a\nb', sort_order: 9 }); ok(r.s === 201, 'service create');
const sid = r.d.id;
r = await call('PUT', `/api/admin/services/${sid}`, { active: 0 }); ok(r.s === 200, 'service hide');
r = await call('GET', '/api/content'); ok(r.d.services.length === 6, 'hidden service not public');
r = await call('DELETE', `/api/admin/services/${sid}`); ok(r.s === 200, 'service delete');
r = await call('POST', '/api/admin/services', { description: 'no title' }); ok(r.s === 400, 'service missing title');
r = await call('POST', '/api/admin/portfolio', { title: 'P', image_url: 'javascript:alert(1)' }); ok(r.s === 400, 'portfolio rejects js: url');
r = await call('POST', '/api/admin/portfolio', { title: 'Brand X', category: 'سوشيال', image_url: 'https://example.com/a.jpg', result: '+200%' }); ok(r.s === 201, 'portfolio create');
r = await call('POST', '/api/admin/testimonials', { name: 'T', content: 'good', rating: 99 }); ok(r.s === 201 && env.DB.raw.prepare('SELECT rating FROM testimonials').get().rating === 5, 'testimonial rating clamped');
r = await call('POST', '/api/admin/faqs', { question: 'Q', answer: 'A' }); ok(r.s === 201, 'faq create');
r = await call('POST', '/api/admin/packages', { name: 'VIP', price: '9,999 ج.م', featured: true }); ok(r.s === 201, 'package create');
r = await call('GET', '/api/admin/admins'); ok(r.s === 404, 'unknown resource 404');
r = await call('PUT', '/api/admin/settings', { whatsapp: 'abc' }); ok(r.s === 400, 'settings: bad whatsapp');
r = await call('PUT', '/api/admin/settings', { facebook: 'http://x.com' }); ok(r.s === 400, 'settings: non-https social');
r = await call('PUT', '/api/admin/settings', { whatsapp: '201001234567', phone: '+20 100 123 4567', facebook: 'https://facebook.com/nexora', stats: '50+|عميل', evil: 'x' }); ok(r.s === 200, 'settings save');
r = await call('GET', '/api/content'); ok(r.d.settings.whatsapp === '201001234567' && !('evil' in r.d.settings), 'settings public');
r = await call('POST', '/api/admin/services', { title: 'x' }, { headers: { origin: 'https://evil.com' } }); ok(r.s === 403, 'admin CSRF origin blocked');
r = await call('GET', '/api/admin/subscribers'); ok(r.d.items.length === 1, 'subscribers list');
r = await call('POST', '/api/admin/password', { current_password: 'nope', new_password: 'NewSecret123' }); ok(r.s === 400, 'password: wrong current');
r = await call('POST', '/api/admin/password', { current_password: 'Secret12345', new_password: 'NewSecret123' }); ok(r.s === 200, 'password changed');
const saved = cookie; cookie = '';
r = await call('POST', '/api/admin/login', { username: 'nexora', password: 'Secret12345' }, { keepCookie: false }); ok(r.s === 401, 'old password rejected');
for (let i = 0; i < 8; i++) await call('POST', '/api/admin/login', { username: 'nexora', password: 'bad' }, { headers: { 'x-test-ip': '7.7.7.7' }, keepCookie: false });
r = await call('POST', '/api/admin/login', { username: 'nexora', password: 'NewSecret123' }, { headers: { 'x-test-ip': '7.7.7.7' }, keepCookie: false }); ok(r.s === 429, 'login brute-force rate limited');
cookie = saved;

console.log('New features');
r = await call('POST', '/api/contact', { name: 'Audit Guy', phone: '01000000000', source: 'audit' }); ok(r.s === 400, 'audit requires page link');
r = await call('POST', '/api/contact', { name: 'Audit Guy', phone: '01000000000', source: 'audit', page_url: 'javascript:alert(1)' }); ok(r.s === 400, 'audit rejects bad link');
r = await call('POST', '/api/contact', { name: 'Audit Guy', phone: '01000000000', source: 'audit', page_url: 'https://facebook.com/mypage' }, { headers: { 'x-test-ip': '3.3.3.3' } }); ok(r.s === 201 && r.d.message.includes('الفحص'), 'audit lead saved');
r = await call('POST', '/api/contact', { name: 'Quiz Guy', phone: '01000000001', source: 'quiz', service: 'الباقة الاحترافية' }, { headers: { 'x-test-ip': '3.3.3.3' } }); ok(r.s === 201, 'quiz lead saved');
r = await call('GET', '/api/admin/leads?source=audit'); ok(r.d.items.length === 1 && r.d.items[0].page_url === 'https://facebook.com/mypage', 'leads filter by source');
r = await call('GET', '/api/admin/stats'); ok(r.d.audits === 1 && r.d.telegram === false, 'stats audits + telegram flag');
ok(tgCalls.length === 0, 'no telegram calls before setup');
r = await call('PUT', '/api/admin/notify', { bot_token: 'nope' }); ok(r.s === 400, 'notify: bad token format');
r = await call('PUT', '/api/admin/notify', { bot_token: '12345678:BADxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx' }); ok(r.s === 400, 'notify: telegram rejects token');
r = await call('PUT', '/api/admin/notify', { bot_token: '12345678:AAH' + 'x'.repeat(32) }); ok(r.s === 200 && r.d.botUsername === 'nexora_test_bot', 'notify: token saved');
r = await call('GET', '/api/admin/notify'); ok(r.d.hasToken && !JSON.stringify(r.d).includes('AAH'), 'notify: token never returned');
r = await call('POST', '/api/admin/notify/detect', {}); ok(r.s === 200 && r.d.chatTitle === 'Ahmed', 'notify: chat detected');
r = await call('POST', '/api/admin/notify/test', {}); ok(r.s === 200, 'notify: test message');
tgCalls.length = 0;
r = await call('POST', '/api/contact', { name: 'Lead TG', phone: '01011111111', service: 'باقة بريميوم', message: 'hi' }, { headers: { 'x-test-ip': '4.4.4.4' } });
await new Promise((res) => setTimeout(res, 50));
ok(r.s === 201 && tgCalls.some((c) => c.method === 'sendMessage' && c.body.chat_id === '5551234' && c.body.text.includes('Lead TG')), 'new lead -> telegram message');
r = await call('GET', '/api/content'); ok(!JSON.stringify(r.d).includes('telegram'), 'telegram settings not public');
// uploads
const png = Buffer.from('89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000d4944415478da63f8ffff3f0005fe02fea7d6a4f50000000049454e44ae426082', 'hex');
let up = await fetch(B + '/api/admin/upload', { method: 'POST', headers: { 'content-type': 'image/png', cookie }, body: png });
let upd = await up.json(); ok(up.status === 201 && /^\/media\/\d{4}-\d{2}\/[a-f0-9]{24}\.png$/.test(upd.url), 'upload png');
let got = await fetch(B + upd.url); ok(got.status === 200 && got.headers.get('content-type') === 'image/png' && (await got.arrayBuffer()).byteLength === png.length, 'serve uploaded media');
up = await fetch(B + '/api/admin/upload', { method: 'POST', headers: { 'content-type': 'image/jpeg', cookie }, body: png }); ok(up.status === 415, 'upload: mismatched type rejected');
up = await fetch(B + '/api/admin/upload', { method: 'POST', headers: { 'content-type': 'text/html', cookie }, body: '<script>' }); ok(up.status === 415, 'upload: html rejected');
up = await fetch(B + '/api/admin/upload', { method: 'POST', headers: { 'content-type': 'image/png' }, body: png }); ok(up.status === 401, 'upload: requires login');
got = await fetch(B + '/media/../wrangler.jsonc'); ok(got.status === 404, 'media path traversal blocked');
r = await call('POST', '/api/admin/portfolio', { title: 'Case', image_url: upd.url, challenge: 'قليل', solution: 'حملة', result: '+300%' }); ok(r.s === 201, 'portfolio case study saved');
r = await call('GET', '/api/content'); ok(r.d.portfolio.some((p) => p.challenge === 'قليل' && p.image_url === upd.url), 'case study public');

console.log(`\n${pass} passed, ${fail} failed`);
if (process.argv.includes('--serve')) {
  console.log(`Serving on ${B}`);
} else {
  server.close();
  process.exit(fail ? 1 : 0);
}
