// NEXORA Digital Marketing — Cloudflare Worker (API + static site)
// Zero dependencies. Bindings: DB (D1), ASSETS (static files).

const SESSION_COOKIE = 'nx_session';
const SESSION_TTL_SEC = 60 * 60 * 24 * 7; // 7 days
const PBKDF2_ITERATIONS = 100000; // Workers maximum
const LOGIN_MAX_ATTEMPTS = 8; // per IP per 15 minutes
const CONTACT_MAX_PER_HOUR = 5; // per IP

const PUBLIC_SETTINGS = [
  'site_name', 'tagline', 'hero_title', 'hero_subtitle', 'about_title', 'about_text', 'stats',
  'phone', 'whatsapp', 'email', 'address', 'working_hours',
  'facebook', 'instagram', 'tiktok', 'linkedin', 'youtube', 'x',
];

// Admin-editable collections and their writable columns
const COLLECTIONS = {
  services: { cols: { icon: 'text', title: 'req', description: 'text', features: 'text', sort_order: 'int', active: 'bool' } },
  portfolio: { cols: { title: 'req', category: 'text', description: 'text', challenge: 'text', solution: 'text', image_url: 'url', result: 'text', link: 'url', sort_order: 'int', active: 'bool' } },
  testimonials: { cols: { name: 'req', role: 'text', content: 'req', rating: 'int', sort_order: 'int', active: 'bool' } },
  packages: { cols: { name: 'req', price: 'text', period: 'text', description: 'text', features: 'text', featured: 'bool', sort_order: 'int', active: 'bool' } },
  faqs: { cols: { question: 'req', answer: 'req', sort_order: 'int', active: 'bool' } },
};

const LEAD_STATUSES = ['new', 'contacted', 'won', 'lost'];
const LEAD_SOURCES = ['contact', 'audit', 'quiz'];
const SOURCE_LABEL = { contact: 'فورم التواصل', audit: 'فحص مجاني للصفحة', quiz: 'اختبار الباقة' };
const MEDIA_TYPES = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' };
const MEDIA_MAX_BYTES = 4 * 1024 * 1024;

// ---------------------------------------------------------------- helpers
class HttpError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}

function json(data, status = 200, extra = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', ...extra },
  });
}

const enc = new TextEncoder();
const toHex = (buf) => [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
const fromHex = (hex) => new Uint8Array(hex.match(/.{2}/g).map((h) => parseInt(h, 16)));
const randomHex = (bytes) => toHex(crypto.getRandomValues(new Uint8Array(bytes)));

async function sha256(text) {
  return toHex(await crypto.subtle.digest('SHA-256', enc.encode(text)));
}

async function hashPassword(password, saltHex) {
  const key = await crypto.subtle.importKey('raw', enc.encode(password), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', hash: 'SHA-256', salt: fromHex(saltHex), iterations: PBKDF2_ITERATIONS }, key, 256);
  return toHex(bits);
}

function timingSafeEqual(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string' || a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

function clientIp(req) {
  return req.headers.get('cf-connecting-ip') || req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown';
}

function getCookie(req, name) {
  const header = req.headers.get('cookie') || '';
  for (const part of header.split(';')) {
    const [k, ...v] = part.trim().split('=');
    if (k === name) return decodeURIComponent(v.join('='));
  }
  return null;
}

function sessionCookie(value, maxAge) {
  return `${SESSION_COOKIE}=${value}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=${maxAge}`;
}

async function readJson(req, maxBytes = 64 * 1024) {
  const ct = req.headers.get('content-type') || '';
  if (!ct.includes('application/json')) throw new HttpError(415, 'نوع المحتوى يجب أن يكون JSON');
  const text = await req.text();
  if (text.length > maxBytes) throw new HttpError(413, 'البيانات كبيرة جدًا');
  try { return JSON.parse(text || '{}'); } catch { throw new HttpError(400, 'JSON غير صالح'); }
}

const str = (v, max = 2000) => (v == null ? '' : String(v)).trim().slice(0, max);
const isEmail = (v) => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v);
const isSafeUrl = (v) => v === '' || /^https:\/\/[^\s<>"']+$/i.test(v) || /^\/[^\s<>"']*$/.test(v);

// Same-origin check for state-changing requests (CSRF defence in depth)
function assertSameOrigin(req) {
  const origin = req.headers.get('origin');
  if (!origin) return; // non-browser clients / same-origin GET-like
  const host = new URL(req.url).host;
  try {
    if (new URL(origin).host !== host) throw new Error();
  } catch { throw new HttpError(403, 'طلب غير مسموح'); }
}

// ---------------------------------------------------------------- auth
async function currentAdmin(req, env) {
  const token = getCookie(req, SESSION_COOKIE);
  if (!token || !/^[a-f0-9]{64}$/.test(token)) return null;
  const tokenHash = await sha256(token);
  const row = await env.DB.prepare(
    `SELECT a.id, a.username, s.expires_at FROM sessions s JOIN admins a ON a.id = s.admin_id WHERE s.token_hash = ?`,
  ).bind(tokenHash).first();
  if (!row) return null;
  if (row.expires_at < Math.floor(Date.now() / 1000)) {
    await env.DB.prepare('DELETE FROM sessions WHERE token_hash = ?').bind(tokenHash).run();
    return null;
  }
  return { id: row.id, username: row.username, tokenHash };
}

async function createSession(env, adminId) {
  const token = randomHex(32);
  const expires = Math.floor(Date.now() / 1000) + SESSION_TTL_SEC;
  await env.DB.prepare('INSERT INTO sessions (token_hash, admin_id, expires_at) VALUES (?, ?, ?)')
    .bind(await sha256(token), adminId, expires).run();
  // opportunistic cleanup
  await env.DB.prepare('DELETE FROM sessions WHERE expires_at < ?').bind(Math.floor(Date.now() / 1000)).run();
  return token;
}

function validatePassword(pw) {
  if (typeof pw !== 'string' || pw.length < 10) throw new HttpError(400, 'كلمة المرور لازم تكون 10 حروف على الأقل');
  if (pw.length > 200) throw new HttpError(400, 'كلمة المرور طويلة جدًا');
  if (!/[A-Za-z؀-ۿ]/.test(pw) || !/\d/.test(pw)) throw new HttpError(400, 'كلمة المرور لازم تحتوي على حروف وأرقام');
}

function validateUsername(u) {
  if (!/^[a-zA-Z0-9_.-]{3,32}$/.test(u || '')) throw new HttpError(400, 'اسم المستخدم: 3-32 حرف إنجليزي/أرقام فقط');
}

// ---------------------------------------------------------------- public API
async function getContent(env) {
  const placeholders = PUBLIC_SETTINGS.map(() => '?').join(',');
  const [settings, services, portfolio, testimonials, packages, faqs] = await env.DB.batch([
    env.DB.prepare(`SELECT key, value FROM settings WHERE key IN (${placeholders})`).bind(...PUBLIC_SETTINGS),
    env.DB.prepare('SELECT id, icon, title, description, features FROM services WHERE active = 1 ORDER BY sort_order, id'),
    env.DB.prepare('SELECT id, title, category, description, challenge, solution, image_url, result, link FROM portfolio WHERE active = 1 ORDER BY sort_order, id'),
    env.DB.prepare('SELECT id, name, role, content, rating FROM testimonials WHERE active = 1 ORDER BY sort_order, id'),
    env.DB.prepare('SELECT id, name, price, period, description, features, featured FROM packages WHERE active = 1 ORDER BY sort_order, id'),
    env.DB.prepare('SELECT id, question, answer FROM faqs WHERE active = 1 ORDER BY sort_order, id'),
  ]);
  const s = {};
  for (const r of settings.results) s[r.key] = r.value;
  return {
    settings: s,
    services: services.results,
    portfolio: portfolio.results,
    testimonials: testimonials.results,
    packages: packages.results,
    faqs: faqs.results,
  };
}

async function postContact(req, env, ctx) {
  assertSameOrigin(req);
  const body = await readJson(req, 16 * 1024);
  if (str(body.website)) return json({ ok: true }); // honeypot: silently accept bots
  const lead = {
    name: str(body.name, 120), email: str(body.email, 160).toLowerCase(), phone: str(body.phone, 40),
    company: str(body.company, 160), service: str(body.service, 160), budget: str(body.budget, 80), message: str(body.message, 4000),
    source: LEAD_SOURCES.includes(body.source) ? body.source : 'contact', page_url: str(body.page_url, 500),
  };
  if (lead.page_url && !/^https?:\/\/[^\s<>"']+\.[^\s<>"']+$/i.test(lead.page_url)) throw new HttpError(400, 'رابط الصفحة غير صحيح، انسخه كامل من المتصفح');
  if (lead.source === 'audit' && !lead.page_url) throw new HttpError(400, 'من فضلك حط رابط صفحتك');
  if (lead.source === 'audit' && !lead.phone) throw new HttpError(400, 'من فضلك اكتب رقم الموبايل');
  if (lead.name.length < 2) throw new HttpError(400, 'من فضلك اكتب اسمك');
  if (!lead.email && !lead.phone) throw new HttpError(400, 'من فضلك اكتب رقم الموبايل أو البريد الإلكتروني');
  if (lead.email && !isEmail(lead.email)) throw new HttpError(400, 'البريد الإلكتروني غير صحيح');
  if (lead.phone && !/^[+\d\s()-]{6,40}$/.test(lead.phone)) throw new HttpError(400, 'رقم الموبايل غير صحيح');
  const ip = clientIp(req);
  const recent = await env.DB.prepare(
    `SELECT COUNT(*) AS c FROM leads WHERE ip = ? AND created_at > datetime('now', '-1 hour')`,
  ).bind(ip).first();
  if (recent.c >= CONTACT_MAX_PER_HOUR) throw new HttpError(429, 'وصلنا طلبات كتير منك، حاول تاني بعد شوية');
  await env.DB.prepare(
    'INSERT INTO leads (name, email, phone, company, service, budget, message, source, page_url, ip) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
  ).bind(lead.name, lead.email, lead.phone, lead.company, lead.service, lead.budget, lead.message, lead.source, lead.page_url, ip).run();
  const lines = [
    '🔔 طلب جديد — ' + SOURCE_LABEL[lead.source],
    '👤 ' + lead.name,
    lead.phone && '📞 ' + lead.phone,
    lead.email && '✉️ ' + lead.email,
    lead.service && '🧩 ' + lead.service,
    lead.page_url && '🔗 ' + lead.page_url,
    lead.message && '📝 ' + lead.message.slice(0, 700),
  ].filter(Boolean);
  const p = notifyTelegram(env, lines.join('\n')).catch((e) => console.error('telegram', e));
  if (ctx && ctx.waitUntil) ctx.waitUntil(p); else await p;
  return json({ ok: true, message: lead.source === 'audit'
    ? 'تم استلام طلب الفحص! هنراجع صفحتك ونبعتلك الملاحظات على واتساب.'
    : 'تم استلام طلبك بنجاح! هنتواصل معاك في أقرب وقت.' }, 201);
}

async function postSubscribe(req, env) {
  assertSameOrigin(req);
  const body = await readJson(req, 2048);
  const email = str(body.email, 160).toLowerCase();
  if (!isEmail(email)) throw new HttpError(400, 'البريد الإلكتروني غير صحيح');
  await env.DB.prepare('INSERT OR IGNORE INTO subscribers (email) VALUES (?)').bind(email).run();
  return json({ ok: true, message: 'تم الاشتراك بنجاح 🎉' }, 201);
}

// ---------------------------------------------------------------- telegram
async function getSystem(env, key) {
  const r = await env.DB.prepare('SELECT value FROM system WHERE key = ?').bind(key).first();
  return r ? r.value : '';
}
async function setSystem(env, key, value) {
  if (value === '') await env.DB.prepare('DELETE FROM system WHERE key = ?').bind(key).run();
  else await env.DB.prepare('INSERT INTO system (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value').bind(key, value).run();
}
async function telegramCall(token, method, payload) {
  const r = await fetch(`https://api.telegram.org/bot${token}/${method}`, {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(payload || {}),
  });
  const data = await r.json().catch(() => ({}));
  if (!data.ok) throw new HttpError(400, 'تليجرام رفض الطلب: ' + str(data.description || r.status, 200));
  return data.result;
}
async function notifyTelegram(env, text) {
  const token = await getSystem(env, 'telegram_token');
  const chat = await getSystem(env, 'telegram_chat_id');
  if (!token || !chat) return false;
  await telegramCall(token, 'sendMessage', { chat_id: chat, text: text.slice(0, 4000), disable_web_page_preview: true });
  return true;
}

async function adminNotify(req, env, action) {
  if (req.method === 'GET' && !action) {
    const token = await getSystem(env, 'telegram_token');
    const chat = await getSystem(env, 'telegram_chat_id');
    return json({ hasToken: !!token, tokenHint: token ? '••••' + token.slice(-4) : '', chatId: chat, chatTitle: await getSystem(env, 'telegram_chat_title') });
  }
  if (req.method === 'PUT' && !action) {
    const body = await readJson(req, 4096);
    if (body.clear) {
      for (const k of ['telegram_token', 'telegram_chat_id', 'telegram_chat_title']) await setSystem(env, k, '');
      return json({ ok: true, message: 'تم إيقاف الإشعارات' });
    }
    const token = str(body.bot_token, 200);
    if (!/^\d{5,}:[A-Za-z0-9_-]{30,}$/.test(token)) throw new HttpError(400, 'التوكن شكله غلط — انسخه كامل من BotFather');
    const me = await telegramCall(token, 'getMe');
    await setSystem(env, 'telegram_token', token);
    return json({ ok: true, message: `تم ربط البوت @${me.username}. دلوقتي ابعتله أي رسالة من تليجرام ودوس "ربط حسابي".`, botUsername: me.username });
  }
  if (req.method === 'POST' && action === 'detect') {
    const token = await getSystem(env, 'telegram_token');
    if (!token) throw new HttpError(400, 'حط توكن البوت الأول');
    const updates = await telegramCall(token, 'getUpdates', { limit: 50, timeout: 0 });
    const last = [...updates].reverse().map((u) => (u.message || u.channel_post || u.my_chat_member || {}).chat).find(Boolean);
    if (!last) throw new HttpError(404, 'مفيش رسايل للبوت. افتح البوت في تليجرام وابعتله "مرحبا" وجرب تاني');
    const title = last.title || [last.first_name, last.last_name].filter(Boolean).join(' ') || last.username || String(last.id);
    await setSystem(env, 'telegram_chat_id', String(last.id));
    await setSystem(env, 'telegram_chat_title', str(title, 100));
    await telegramCall(token, 'sendMessage', { chat_id: last.id, text: '✅ تم ربط إشعارات موقع NEXORA. أي طلب جديد هيوصلك هنا.' });
    return json({ ok: true, message: 'تم الربط مع: ' + title, chatTitle: title });
  }
  if (req.method === 'POST' && action === 'test') {
    const sent = await notifyTelegram(env, '🧪 رسالة تجريبية من لوحة تحكم NEXORA — الإشعارات شغالة ✅');
    if (!sent) throw new HttpError(400, 'الإشعارات مش متظبطة لسه');
    return json({ ok: true, message: 'اتبعتت رسالة تجريبية على تليجرام' });
  }
  throw new HttpError(405, 'Method not allowed');
}

// ---------------------------------------------------------------- media (R2)
async function adminUpload(req, env) {
  if (!env.MEDIA) throw new HttpError(500, 'مخزن الصور غير متصل');
  const type = (req.headers.get('content-type') || '').split(';')[0].trim().toLowerCase();
  const ext = MEDIA_TYPES[type];
  if (!ext) throw new HttpError(415, 'نوع الصورة لازم يكون JPG أو PNG أو WEBP');
  const buf = await req.arrayBuffer();
  if (!buf.byteLength) throw new HttpError(400, 'الملف فاضي');
  if (buf.byteLength > MEDIA_MAX_BYTES) throw new HttpError(413, 'الصورة أكبر من 4 ميجا');
  const b = new Uint8Array(buf.slice(0, 12));
  const isJpg = b[0] === 0xff && b[1] === 0xd8;
  const isPng = b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47;
  const isWebp = b[0] === 0x52 && b[1] === 0x49 && b[8] === 0x57 && b[9] === 0x45;
  if (!((ext === 'jpg' && isJpg) || (ext === 'png' && isPng) || (ext === 'webp' && isWebp))) throw new HttpError(415, 'الملف مش صورة صالحة');
  const key = `${new Date().toISOString().slice(0, 7)}/${randomHex(12)}.${ext}`;
  await env.MEDIA.put(key, buf, { httpMetadata: { contentType: type, cacheControl: 'public, max-age=31536000, immutable' } });
  await env.DB.prepare('INSERT INTO media (key, content_type, size) VALUES (?, ?, ?)').bind(key, type, buf.byteLength).run();
  return json({ ok: true, url: '/media/' + key }, 201);
}

async function serveMedia(env, key) {
  if (!env.MEDIA || !/^\d{4}-\d{2}\/[a-f0-9]{24}\.(jpg|png|webp)$/.test(key)) return new Response('Not found', { status: 404 });
  const obj = await env.MEDIA.get(key);
  if (!obj) return new Response('Not found', { status: 404 });
  const h = new Headers();
  obj.writeHttpMetadata(h);
  h.set('etag', obj.httpEtag);
  h.set('cache-control', 'public, max-age=31536000, immutable');
  h.set('content-disposition', 'inline');
  return new Response(obj.body, { headers: h });
}

// ---------------------------------------------------------------- admin API
async function adminSetupStatus(env) {
  const a = await env.DB.prepare('SELECT COUNT(*) AS c FROM admins').first();
  return json({ needsSetup: a.c === 0 });
}

async function adminSetup(req, env) {
  assertSameOrigin(req);
  const body = await readJson(req, 4096);
  const count = await env.DB.prepare('SELECT COUNT(*) AS c FROM admins').first();
  if (count.c > 0) throw new HttpError(403, 'تم إعداد حساب المدير بالفعل');
  const stored = await env.DB.prepare(`SELECT value FROM system WHERE key = 'setup_code_hash'`).first();
  const ip = clientIp(req);
  await enforceLoginRate(env, ip);
  if (!stored || !timingSafeEqual(await sha256(str(body.code, 200)), stored.value)) {
    await env.DB.prepare('INSERT INTO login_attempts (ip, attempted_at) VALUES (?, ?)').bind(ip, Date.now()).run();
    throw new HttpError(401, 'كود الإعداد غير صحيح');
  }
  const username = str(body.username, 32);
  validateUsername(username);
  validatePassword(body.password);
  const salt = randomHex(16);
  const hash = await hashPassword(body.password, salt);
  const res = await env.DB.prepare('INSERT INTO admins (username, password_hash, salt) VALUES (?, ?, ?)')
    .bind(username, hash, salt).run();
  await env.DB.prepare(`DELETE FROM system WHERE key = 'setup_code_hash'`).run();
  const token = await createSession(env, res.meta.last_row_id);
  return json({ ok: true, username }, 201, { 'set-cookie': sessionCookie(token, SESSION_TTL_SEC) });
}

async function enforceLoginRate(env, ip) {
  const since = Date.now() - 15 * 60 * 1000;
  await env.DB.prepare('DELETE FROM login_attempts WHERE attempted_at < ?').bind(since).run();
  const r = await env.DB.prepare('SELECT COUNT(*) AS c FROM login_attempts WHERE ip = ? AND attempted_at >= ?').bind(ip, since).first();
  if (r.c >= LOGIN_MAX_ATTEMPTS) throw new HttpError(429, 'محاولات كثيرة. حاول مرة أخرى بعد 15 دقيقة');
}

async function adminLogin(req, env) {
  assertSameOrigin(req);
  const body = await readJson(req, 4096);
  const ip = clientIp(req);
  await enforceLoginRate(env, ip);
  const username = str(body.username, 64);
  const password = typeof body.password === 'string' ? body.password.slice(0, 200) : '';
  const admin = await env.DB.prepare('SELECT id, username, password_hash, salt FROM admins WHERE username = ?').bind(username).first();
  // Always run PBKDF2 to keep timing uniform
  const hash = await hashPassword(password, admin ? admin.salt : '00000000000000000000000000000000');
  if (!admin || !timingSafeEqual(hash, admin.password_hash)) {
    await env.DB.prepare('INSERT INTO login_attempts (ip, attempted_at) VALUES (?, ?)').bind(ip, Date.now()).run();
    throw new HttpError(401, 'اسم المستخدم أو كلمة المرور غير صحيحة');
  }
  await env.DB.prepare(`UPDATE admins SET last_login = datetime('now') WHERE id = ?`).bind(admin.id).run();
  await env.DB.prepare('DELETE FROM login_attempts WHERE ip = ?').bind(ip).run();
  const token = await createSession(env, admin.id);
  return json({ ok: true, username: admin.username }, 200, { 'set-cookie': sessionCookie(token, SESSION_TTL_SEC) });
}

async function adminLogout(req, env) {
  const token = getCookie(req, SESSION_COOKIE);
  if (token) await env.DB.prepare('DELETE FROM sessions WHERE token_hash = ?').bind(await sha256(token)).run();
  return json({ ok: true }, 200, { 'set-cookie': sessionCookie('', 0) });
}

async function adminChangePassword(req, env, admin) {
  const body = await readJson(req, 4096);
  const row = await env.DB.prepare('SELECT password_hash, salt FROM admins WHERE id = ?').bind(admin.id).first();
  const current = await hashPassword(String(body.current_password || '').slice(0, 200), row.salt);
  if (!timingSafeEqual(current, row.password_hash)) throw new HttpError(400, 'كلمة المرور الحالية غير صحيحة');
  validatePassword(body.new_password);
  const salt = randomHex(16);
  const hash = await hashPassword(body.new_password, salt);
  await env.DB.prepare('UPDATE admins SET password_hash = ?, salt = ? WHERE id = ?').bind(hash, salt, admin.id).run();
  // sign out all other sessions
  await env.DB.prepare('DELETE FROM sessions WHERE admin_id = ? AND token_hash != ?').bind(admin.id, admin.tokenHash).run();
  return json({ ok: true, message: 'تم تغيير كلمة المرور' });
}

async function adminStats(env) {
  const [leads, byStatus, subs, week, services, portfolio, recent, audits, tg] = await env.DB.batch([
    env.DB.prepare('SELECT COUNT(*) AS c FROM leads'),
    env.DB.prepare('SELECT status, COUNT(*) AS c FROM leads GROUP BY status'),
    env.DB.prepare('SELECT COUNT(*) AS c FROM subscribers'),
    env.DB.prepare(`SELECT COUNT(*) AS c FROM leads WHERE created_at > datetime('now', '-7 days')`),
    env.DB.prepare('SELECT COUNT(*) AS c FROM services WHERE active = 1'),
    env.DB.prepare('SELECT COUNT(*) AS c FROM portfolio WHERE active = 1'),
    env.DB.prepare('SELECT id, name, service, source, status, created_at FROM leads ORDER BY id DESC LIMIT 5'),
    env.DB.prepare(`SELECT COUNT(*) AS c FROM leads WHERE source = 'audit'`),
    env.DB.prepare(`SELECT COUNT(*) AS c FROM system WHERE key = 'telegram_chat_id'`),
  ]);
  const status = Object.fromEntries(LEAD_STATUSES.map((s) => [s, 0]));
  for (const r of byStatus.results) status[r.status] = r.c;
  return json({
    leads: leads.results[0].c, leadsThisWeek: week.results[0].c, byStatus: status,
    subscribers: subs.results[0].c, services: services.results[0].c, portfolio: portfolio.results[0].c,
    recentLeads: recent.results, audits: audits.results[0].c, telegram: tg.results[0].c > 0,
  });
}

async function adminListLeads(url, env) {
  const status = url.searchParams.get('status') || '';
  const q = str(url.searchParams.get('q'), 100);
  let sql = 'SELECT * FROM leads WHERE 1=1';
  const binds = [];
  if (LEAD_STATUSES.includes(status)) { sql += ' AND status = ?'; binds.push(status); }
  const source = url.searchParams.get('source') || '';
  if (LEAD_SOURCES.includes(source)) { sql += ' AND source = ?'; binds.push(source); }
  if (q) {
    sql += ' AND (name LIKE ? OR email LIKE ? OR phone LIKE ? OR company LIKE ? OR message LIKE ? OR page_url LIKE ?)';
    const like = `%${q}%`; binds.push(like, like, like, like, like, like);
  }
  sql += ' ORDER BY id DESC LIMIT 500';
  const r = await env.DB.prepare(sql).bind(...binds).all();
  return json({ items: r.results });
}

function csvCell(v) {
  let s = v == null ? '' : String(v);
  if (/^[=+\-@\t\r]/.test(s)) s = "'" + s; // CSV/formula injection guard
  return '"' + s.replace(/"/g, '""') + '"';
}

async function adminLeadsCsv(env) {
  const r = await env.DB.prepare('SELECT id, created_at, source, name, phone, email, company, service, budget, page_url, status, message, notes FROM leads ORDER BY id DESC').all();
  const cols = ['id', 'created_at', 'source', 'name', 'phone', 'email', 'company', 'service', 'budget', 'page_url', 'status', 'message', 'notes'];
  const lines = [cols.join(',')].concat(r.results.map((row) => cols.map((c) => csvCell(row[c])).join(',')));
  return new Response('﻿' + lines.join('\r\n'), {
    headers: {
      'content-type': 'text/csv; charset=utf-8',
      'content-disposition': 'attachment; filename="nexora-leads.csv"',
      'cache-control': 'no-store',
    },
  });
}

async function adminUpdateLead(req, env, id) {
  const body = await readJson(req);
  const sets = []; const binds = [];
  if (body.status !== undefined) {
    if (!LEAD_STATUSES.includes(body.status)) throw new HttpError(400, 'حالة غير صالحة');
    sets.push('status = ?'); binds.push(body.status);
  }
  if (body.notes !== undefined) { sets.push('notes = ?'); binds.push(str(body.notes, 4000)); }
  if (!sets.length) throw new HttpError(400, 'لا يوجد تعديل');
  const r = await env.DB.prepare(`UPDATE leads SET ${sets.join(', ')} WHERE id = ?`).bind(...binds, id).run();
  if (!r.meta.changes) throw new HttpError(404, 'غير موجود');
  return json({ ok: true });
}

function cleanRecord(collection, body, partial) {
  const spec = COLLECTIONS[collection].cols;
  const out = {};
  for (const [col, type] of Object.entries(spec)) {
    if (!(col in body)) {
      if (!partial && type === 'req') throw new HttpError(400, `الحقل ${col} مطلوب`);
      continue;
    }
    const v = body[col];
    if (type === 'int') out[col] = Number.isFinite(+v) ? Math.trunc(+v) : 0;
    else if (type === 'bool') out[col] = v === true || v === 1 || v === '1' || v === 'true' ? 1 : 0;
    else if (type === 'url') {
      const u = str(v, 1000);
      if (!isSafeUrl(u)) throw new HttpError(400, 'الرابط لازم يبدأ بـ https://');
      out[col] = u;
    } else {
      const s = str(v, 5000);
      if (type === 'req' && !s) throw new HttpError(400, `الحقل ${col} مطلوب`);
      out[col] = s;
    }
  }
  if (collection === 'testimonials' && 'rating' in out) out.rating = Math.min(5, Math.max(1, out.rating));
  return out;
}

async function adminCollection(req, env, collection, id) {
  const method = req.method;
  if (method === 'GET' && !id) {
    const r = await env.DB.prepare(`SELECT * FROM ${collection} ORDER BY sort_order, id`).all();
    return json({ items: r.results });
  }
  if (method === 'POST' && !id) {
    const rec = cleanRecord(collection, await readJson(req), false);
    const cols = Object.keys(rec);
    const r = await env.DB.prepare(`INSERT INTO ${collection} (${cols.join(',')}) VALUES (${cols.map(() => '?').join(',')})`)
      .bind(...cols.map((c) => rec[c])).run();
    return json({ ok: true, id: r.meta.last_row_id }, 201);
  }
  if (method === 'PUT' && id) {
    const rec = cleanRecord(collection, await readJson(req), true);
    const cols = Object.keys(rec);
    if (!cols.length) throw new HttpError(400, 'لا يوجد تعديل');
    const r = await env.DB.prepare(`UPDATE ${collection} SET ${cols.map((c) => `${c} = ?`).join(', ')} WHERE id = ?`)
      .bind(...cols.map((c) => rec[c]), id).run();
    if (!r.meta.changes) throw new HttpError(404, 'غير موجود');
    return json({ ok: true });
  }
  if (method === 'DELETE' && id) {
    const r = await env.DB.prepare(`DELETE FROM ${collection} WHERE id = ?`).bind(id).run();
    if (!r.meta.changes) throw new HttpError(404, 'غير موجود');
    return json({ ok: true });
  }
  throw new HttpError(405, 'Method not allowed');
}

async function adminSettings(req, env) {
  if (req.method === 'GET') {
    const r = await env.DB.prepare('SELECT key, value FROM settings').all();
    const s = Object.fromEntries(PUBLIC_SETTINGS.map((k) => [k, '']));
    for (const row of r.results) if (PUBLIC_SETTINGS.includes(row.key)) s[row.key] = row.value;
    return json({ settings: s });
  }
  if (req.method === 'PUT') {
    const body = await readJson(req);
    const urlKeys = ['facebook', 'instagram', 'tiktok', 'linkedin', 'youtube', 'x'];
    const stmts = [];
    for (const key of PUBLIC_SETTINGS) {
      if (!(key in body)) continue;
      const value = str(body[key], 3000);
      if (urlKeys.includes(key) && !isSafeUrl(value)) throw new HttpError(400, `رابط ${key} لازم يبدأ بـ https://`);
      if (key === 'email' && value && !isEmail(value)) throw new HttpError(400, 'البريد الإلكتروني غير صحيح');
      if (key === 'whatsapp' && value && !/^\+?\d{8,15}$/.test(value.replace(/[\s-]/g, ''))) throw new HttpError(400, 'رقم واتساب غير صحيح (مثال: 201001234567)');
      stmts.push(env.DB.prepare('INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value').bind(key, value));
    }
    if (stmts.length) await env.DB.batch(stmts);
    return json({ ok: true, message: 'تم حفظ الإعدادات' });
  }
  throw new HttpError(405, 'Method not allowed');
}

// ---------------------------------------------------------------- router
async function handleApi(req, env, url, ctx) {
  const path = url.pathname.replace(/\/+$/, '');
  const m = req.method;

  if (path === '/api/health') {
    const r = await env.DB.prepare('SELECT 1 AS ok').first();
    return json({ ok: true, db: r?.ok === 1, time: new Date().toISOString() });
  }
  if (path === '/api/content' && m === 'GET') {
    return json(await getContent(env), 200, { 'cache-control': 'public, max-age=60' });
  }
  if (path === '/api/contact' && m === 'POST') return postContact(req, env, ctx);
  if (path === '/api/subscribe' && m === 'POST') return postSubscribe(req, env);

  if (path === '/api/admin/setup-status' && m === 'GET') return adminSetupStatus(env);
  if (path === '/api/admin/setup' && m === 'POST') return adminSetup(req, env);
  if (path === '/api/admin/login' && m === 'POST') return adminLogin(req, env);
  if (path === '/api/admin/logout' && m === 'POST') return adminLogout(req, env);

  if (path.startsWith('/api/admin/')) {
    if (m !== 'GET') assertSameOrigin(req);
    const admin = await currentAdmin(req, env);
    if (!admin) throw new HttpError(401, 'يجب تسجيل الدخول');
    const parts = path.split('/').slice(3); // after /api/admin
    const [resource, rawId] = parts;
    const id = rawId !== undefined ? Number(rawId) : undefined;
    if (rawId !== undefined && resource !== 'notify' && (!Number.isInteger(id) || id <= 0)) throw new HttpError(400, 'معرّف غير صالح');

    if (resource === 'me' && m === 'GET') return json({ username: admin.username });
    if (resource === 'password' && m === 'POST') return adminChangePassword(req, env, admin);
    if (resource === 'stats' && m === 'GET') return adminStats(env);
    if (resource === 'settings') return adminSettings(req, env);
    if (resource === 'notify') return adminNotify(req, env, rawId);
    if (resource === 'upload' && m === 'POST') return adminUpload(req, env);
    if (resource === 'leads.csv' && m === 'GET') return adminLeadsCsv(env);
    if (resource === 'leads') {
      if (m === 'GET' && !id) return adminListLeads(url, env);
      if (m === 'PATCH' && id) return adminUpdateLead(req, env, id);
      if (m === 'DELETE' && id) {
        const r = await env.DB.prepare('DELETE FROM leads WHERE id = ?').bind(id).run();
        if (!r.meta.changes) throw new HttpError(404, 'غير موجود');
        return json({ ok: true });
      }
    }
    if (resource === 'subscribers') {
      if (m === 'GET' && !id) return json({ items: (await env.DB.prepare('SELECT * FROM subscribers ORDER BY id DESC LIMIT 2000').all()).results });
      if (m === 'DELETE' && id) {
        await env.DB.prepare('DELETE FROM subscribers WHERE id = ?').bind(id).run();
        return json({ ok: true });
      }
    }
    if (Object.hasOwn(COLLECTIONS, resource)) return adminCollection(req, env, resource, id);
  }
  throw new HttpError(404, 'المسار غير موجود');
}

const CSP = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self' https://fonts.googleapis.com",
  "font-src 'self' https://fonts.gstatic.com",
  "img-src 'self' https: data: blob:",
  "connect-src 'self'",
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "object-src 'none'",
].join('; ');

function withSecurityHeaders(res, isAdmin) {
  const r = new Response(res.body, res);
  const h = r.headers;
  h.set('X-Content-Type-Options', 'nosniff');
  h.set('X-Frame-Options', 'DENY');
  h.set('Referrer-Policy', 'strict-origin-when-cross-origin');
  h.set('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  h.set('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  const ct = h.get('content-type') || '';
  if (ct.includes('text/html')) h.set('Content-Security-Policy', CSP);
  if (isAdmin) {
    h.set('X-Robots-Tag', 'noindex, nofollow');
    h.set('Cache-Control', 'no-store');
  }
  return r;
}

export default {
  async fetch(req, env, ctx) {
    const url = new URL(req.url);
    if (url.pathname.startsWith('/media/') && (req.method === 'GET' || req.method === 'HEAD')) {
      return withSecurityHeaders(await serveMedia(env, url.pathname.slice(7)), false);
    }
    const isApi = url.pathname.startsWith('/api/');
    const isAdmin = url.pathname.startsWith('/admin') || url.pathname.startsWith('/api/admin');
    let res;
    try {
      if (isApi) res = await handleApi(req, env, url, ctx);
      else res = await env.ASSETS.fetch(req);
    } catch (err) {
      if (err instanceof HttpError) res = json({ ok: false, error: err.message }, err.status);
      else {
        console.error('Unhandled error', err && err.stack ? err.stack : err);
        res = json({ ok: false, error: 'حدث خطأ غير متوقع' }, 500);
      }
    }
    return withSecurityHeaders(res, isAdmin);
  },
};
