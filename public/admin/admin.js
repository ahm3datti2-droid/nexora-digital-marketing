(() => {
  'use strict';
  const $ = (s, r = document) => r.querySelector(s);
  const el = (tag, attrs = {}, ...kids) => {
    const n = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs)) {
      if (v == null || v === false) continue;
      if (k === 'class') n.className = v;
      else if (k === 'text') n.textContent = v;
      else if (k.startsWith('on')) n.addEventListener(k.slice(2), v);
      else n.setAttribute(k, v === true ? '' : v);
    }
    for (const k of kids.flat()) if (k != null && k !== false) n.append(k.nodeType ? k : document.createTextNode(k));
    return n;
  };
  const fmtDate = (s) => { try { return new Date(s.replace(' ', 'T') + 'Z').toLocaleString('ar-EG', { dateStyle: 'medium', timeStyle: 'short' }); } catch { return s; } };

  // ---------- API ----------
  async function api(path, opts = {}) {
    const init = { method: opts.method || 'GET', headers: { accept: 'application/json' }, credentials: 'same-origin' };
    if (opts.body !== undefined) { init.headers['content-type'] = 'application/json'; init.body = JSON.stringify(opts.body); }
    const r = await fetch('/api/admin' + path, init);
    const data = await r.json().catch(() => ({}));
    if (r.status === 401 && !path.startsWith('/login') && !path.startsWith('/setup')) { showAuth(false); throw new Error(data.error || 'انتهت الجلسة'); }
    if (!r.ok) throw new Error(data.error || 'حدث خطأ');
    return data;
  }

  let toastTimer;
  function toast(text, isErr) {
    const t = $('#toast');
    t.textContent = text; t.className = 'toast show' + (isErr ? ' err' : '');
    clearTimeout(toastTimer); toastTimer = setTimeout(() => (t.className = 'toast'), 3000);
  }

  // ---------- Auth ----------
  let setupMode = false;
  function showAuth(isSetup) {
    setupMode = isSetup;
    $('#appView').hidden = true; $('#authView').hidden = false;
    $('#codeField').hidden = !isSetup; $('#confirmField').hidden = !isSetup;
    $('#authTitle').textContent = isSetup ? 'إعداد حساب المدير' : 'تسجيل الدخول';
    $('#authHint').textContent = isSetup ? 'أدخل كود الإعداد لمرة واحدة، ثم اختار اسم مستخدم وكلمة مرور قوية (10 حروف على الأقل وفيها أرقام).' : 'لوحة تحكم NEXORA Digital Marketing';
    $('#authBtn').textContent = isSetup ? 'إنشاء الحساب' : 'دخول';
    $('#authForm').password.autocomplete = isSetup ? 'new-password' : 'current-password';
  }

  $('#authForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const f = e.target; const msg = $('#authMsg'); const btn = $('#authBtn');
    msg.className = 'msg'; msg.textContent = '';
    if (setupMode && f.password.value !== f.confirm.value) { msg.className = 'msg err'; msg.textContent = 'كلمتا المرور غير متطابقتين'; return; }
    btn.disabled = true;
    try {
      const body = { username: f.username.value.trim(), password: f.password.value };
      if (setupMode) body.code = f.code.value.trim();
      await api(setupMode ? '/setup' : '/login', { method: 'POST', body });
      f.reset();
      await startApp();
    } catch (err) { msg.className = 'msg err'; msg.textContent = err.message; } finally { btn.disabled = false; }
  });

  $('#logoutBtn').addEventListener('click', async () => {
    try { await api('/logout', { method: 'POST' }); } catch {}
    showAuth(false);
  });

  // ---------- Shell ----------
  const side = $('#side'); const backdrop = $('#backdrop');
  const closeMenu = () => { side.classList.remove('open'); backdrop.classList.remove('show'); };
  $('#menuBtn').addEventListener('click', () => { side.classList.add('open'); backdrop.classList.add('show'); });
  backdrop.addEventListener('click', closeMenu);
  $('#sideNav').addEventListener('click', (e) => { if (e.target.closest('a')) closeMenu(); });

  const content = $('#content');
  const setTitle = (t) => { $('#pageTitle').textContent = t; document.title = t + ' | لوحة تحكم NEXORA'; };

  async function refreshBadge() {
    try {
      const s = await api('/stats');
      const b = $('#newBadge'); b.textContent = s.byStatus.new; b.hidden = !s.byStatus.new;
      return s;
    } catch { return null; }
  }

  // ---------- Modal form ----------
  const modal = $('#modal');
  let modalSubmit = null;
  $('#modalClose').addEventListener('click', () => modal.close());
  $('#modalCancel').addEventListener('click', () => modal.close());
  $('#modalForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!modalSubmit) return;
    const btn = $('#modalSave'); btn.disabled = true;
    try { await modalSubmit(); modal.close(); } catch (err) { toast(err.message, true); } finally { btn.disabled = false; }
  });

  async function resizeImage(file) {
    if (file.type === 'image/png' && file.size <= 1.5 * 1024 * 1024) return file;
    const bmp = await createImageBitmap(file);
    const max = 1600;
    const scale = Math.min(1, max / Math.max(bmp.width, bmp.height));
    const c = document.createElement('canvas');
    c.width = Math.round(bmp.width * scale); c.height = Math.round(bmp.height * scale);
    c.getContext('2d').drawImage(bmp, 0, 0, c.width, c.height);
    return new Promise((res, rej) => c.toBlob((b) => (b ? res(b) : rej(new Error('تعذّر تجهيز الصورة'))), 'image/jpeg', 0.85));
  }

  async function uploadImage(file) {
    if (!/^image\/(jpeg|png|webp|heic|heif)$/.test(file.type) && !file.type.startsWith('image/')) throw new Error('اختار صورة');
    const blob = await resizeImage(file);
    const r = await fetch('/api/admin/upload', { method: 'POST', headers: { 'content-type': blob.type || 'image/jpeg' }, body: blob, credentials: 'same-origin' });
    const data = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(data.error || 'فشل رفع الصورة');
    return data.url;
  }

  function imageField(f, v) {
    const input = el('input', { name: f.name, type: 'text', value: String(v || ''), dir: 'ltr', placeholder: 'ارفع صورة أو حط رابط https://' });
    const preview = el('img', { class: 'img-preview', alt: '' });
    const setPreview = () => { const u = input.value.trim(); preview.hidden = !u; if (u) preview.src = u; };
    input.addEventListener('input', setPreview);
    const file = el('input', { type: 'file', accept: 'image/*', class: 'sr-only', id: 'file-' + f.name });
    const btn = el('label', { class: 'btn btn--ghost btn--sm upload-btn', for: 'file-' + f.name }, '📷 رفع صورة من الموبايل');
    const status = el('span', { class: 'hint' });
    file.addEventListener('change', async () => {
      const fl = file.files && file.files[0];
      if (!fl) return;
      status.textContent = 'جاري الرفع...';
      try { input.value = await uploadImage(fl); setPreview(); status.textContent = '✅ تم رفع الصورة'; }
      catch (e) { status.textContent = '❌ ' + e.message; }
      file.value = '';
    });
    setPreview();
    return el('div', { class: 'full img-field' }, el('span', { class: 'img-field__label', text: f.label }), preview, el('div', { class: 'img-field__row' }, btn, file), input, status);
  }

  function fieldInput(f, value) {
    const v = value ?? f.default ?? '';
    if (f.type === 'image') return imageField(f, v);
    let input;
    if (f.type === 'textarea') input = el('textarea', { name: f.name, rows: f.rows || 4 }, String(v));
    else if (f.type === 'bool') {
      return el('label', { class: 'check full' }, el('input', { type: 'checkbox', name: f.name, checked: !!Number(v) }), f.label);
    } else if (f.type === 'select') {
      input = el('select', { name: f.name }, f.options.map(([val, lab]) => el('option', { value: val, selected: String(v) === String(val) }, lab)));
    } else input = el('input', { name: f.name, type: f.type || 'text', value: String(v), dir: f.ltr ? 'ltr' : null, placeholder: f.placeholder || null, required: f.required || null });
    return el('label', { class: f.full ? 'full' : null }, f.label + (f.required ? ' *' : ''), input, f.hint ? el('span', { class: 'hint', text: f.hint }) : null);
  }

  function readFields(fields) {
    const out = {};
    for (const f of fields) {
      const n = $('#modalBody').querySelector(`[name="${f.name}"]`);
      if (!n) continue;
      out[f.name] = f.type === 'bool' ? (n.checked ? 1 : 0) : f.type === 'number' ? Number(n.value || 0) : n.value;
    }
    return out;
  }

  function openModal(title, fields, record, onSave) {
    $('#modalTitle').textContent = title;
    $('#modalBody').replaceChildren(el('div', { class: 'form-grid' }, fields.map((f) => fieldInput(f, record ? record[f.name] : undefined))));
    modalSubmit = () => onSave(readFields(fields));
    modal.showModal();
  }

  // ---------- Collection config ----------
  const common = [
    { name: 'sort_order', label: 'الترتيب', type: 'number', default: 0, hint: 'الأصغر يظهر الأول' },
    { name: 'active', label: 'ظاهر في الموقع', type: 'bool', default: 1 },
  ];
  const COLLECTIONS = {
    services: {
      title: 'الخدمات', singular: 'خدمة', main: 'title',
      fields: [
        { name: 'icon', label: 'الأيقونة', type: 'select', default: 'social', options: [['social', 'سوشيال ميديا'], ['ads', 'إعلانات'], ['brand', 'تصميم وهوية'], ['web', 'مواقع'], ['seo', 'بحث SEO'], ['content', 'كتابة محتوى'], ['chart', 'نمو / تقارير'], ['target', 'استهداف'], ['shield', 'حماية / ثقة'], ['bolt', 'سرعة']] },
        { name: 'title', label: 'اسم الخدمة', required: true },
        { name: 'description', label: 'الوصف', type: 'textarea', full: true },
        { name: 'features', label: 'المميزات', type: 'textarea', full: true, hint: 'كل ميزة في سطر' },
        ...common,
      ],
      sub: (r) => r.description,
    },
    portfolio: {
      title: 'الأعمال', singular: 'مشروع', main: 'title',
      fields: [
        { name: 'title', label: 'اسم المشروع', required: true },
        { name: 'category', label: 'التصنيف', placeholder: 'سوشيال ميديا / مواقع / هوية' },
        { name: 'image_url', label: 'صورة المشروع', type: 'image' },
        { name: 'description', label: 'وصف قصير', type: 'textarea', full: true, rows: 2 },
        { name: 'challenge', label: 'التحدي (دراسة الحالة)', type: 'textarea', full: true, rows: 3, hint: 'العميل كان عنده مشكلة إيه؟' },
        { name: 'solution', label: 'اللي عملناه', type: 'textarea', full: true, rows: 3, hint: 'خطتك والتنفيذ' },
        { name: 'result', label: 'النتيجة', placeholder: 'مثال: الرسايل زادت 3 أضعاف في شهرين', full: true },
        { name: 'link', label: 'رابط المشروع (اختياري)', ltr: true, full: true, placeholder: 'https://...' },
        ...common,
      ],
      sub: (r) => [r.category, r.result].filter(Boolean).join(' • '),
    },
    packages: {
      title: 'الباقات', singular: 'باقة', main: 'name',
      fields: [
        { name: 'name', label: 'اسم الباقة', required: true },
        { name: 'price', label: 'السعر بالجنيه', placeholder: 'مثال: 5,000', hint: 'اكتب الرقم بس (هيظهر جنبه ج.م). سيبه فاضي ليظهر "السعر حسب احتياجك"' },
        { name: 'period', label: 'المدة', placeholder: 'شهريًا' },
        { name: 'description', label: 'وصف قصير' },
        { name: 'features', label: 'المميزات', type: 'textarea', full: true, hint: 'كل ميزة في سطر' },
        { name: 'featured', label: 'باقة مميزة (الأكثر طلبًا)', type: 'bool', default: 0 },
        ...common,
      ],
      sub: (r) => (r.price ? r.price + ' / ' + (r.period || '') : 'السعر حسب الطلب') + (Number(r.featured) ? ' • ⭐ مميزة' : ''),
    },
    testimonials: {
      title: 'آراء العملاء', singular: 'رأي', main: 'name',
      fields: [
        { name: 'name', label: 'اسم العميل', required: true },
        { name: 'role', label: 'الوظيفة / الشركة' },
        { name: 'content', label: 'الرأي', type: 'textarea', full: true, required: true },
        { name: 'rating', label: 'التقييم', type: 'select', default: 5, options: [[5, '★★★★★'], [4, '★★★★'], [3, '★★★'], [2, '★★'], [1, '★']] },
        ...common,
      ],
      sub: (r) => r.content,
    },
    faqs: {
      title: 'الأسئلة الشائعة', singular: 'سؤال', main: 'question',
      fields: [
        { name: 'question', label: 'السؤال', full: true, required: true },
        { name: 'answer', label: 'الإجابة', type: 'textarea', full: true, required: true },
        ...common,
      ],
      sub: (r) => r.answer,
    },
  };

  async function viewCollection(key) {
    const cfg = COLLECTIONS[key];
    setTitle(cfg.title);
    const list = el('div', { class: 'list' });
    const add = el('button', { class: 'btn btn--primary', type: 'button', text: '+ إضافة ' + cfg.singular });
    content.replaceChildren(el('div', { class: 'toolbar' }, add), list);
    const load = async () => {
      const { items } = await api('/' + key);
      if (!items.length) { list.replaceChildren(el('div', { class: 'empty', text: 'لا يوجد عناصر بعد. اضغط "إضافة" للبدء.' })); return; }
      list.replaceChildren(...items.map((r) => el('div', { class: 'item' },
        el('div', { class: 'item__head' },
          el('span', { class: 'item__title' }, (r.icon && !/^[a-z]+$/.test(r.icon) ? r.icon + ' ' : '') + r[cfg.main]),
          Number(r.active) ? null : el('span', { class: 'pill pill--off', text: 'مخفي' })),
        cfg.sub(r) ? el('p', { class: 'item__text muted', text: String(cfg.sub(r)).slice(0, 220) }) : null,
        el('div', { class: 'item__actions' },
          el('button', { class: 'btn btn--ghost btn--sm', type: 'button', text: '✏️ تعديل', onclick: () => openModal('تعديل ' + cfg.singular, cfg.fields, r, async (data) => { await api(`/${key}/${r.id}`, { method: 'PUT', body: data }); toast('تم الحفظ'); load(); }) }),
          el('button', { class: 'btn btn--ghost btn--sm', type: 'button', text: Number(r.active) ? '🙈 إخفاء' : '👁️ إظهار', onclick: async () => { try { await api(`/${key}/${r.id}`, { method: 'PUT', body: { active: Number(r.active) ? 0 : 1 } }); load(); } catch (e) { toast(e.message, true); } } }),
          el('button', { class: 'btn btn--danger btn--sm', type: 'button', text: '🗑️ حذف', onclick: async () => { if (!confirm('متأكد من الحذف؟')) return; try { await api(`/${key}/${r.id}`, { method: 'DELETE' }); toast('تم الحذف'); load(); } catch (e) { toast(e.message, true); } } })))));
    };
    add.addEventListener('click', () => openModal('إضافة ' + cfg.singular, cfg.fields, null, async (data) => { await api('/' + key, { method: 'POST', body: data }); toast('تمت الإضافة'); load(); }));
    await load();
  }

  // ---------- Views ----------
  const STATUS = { new: 'جديد', contacted: 'تم التواصل', won: 'تم التعاقد', lost: 'غير مهتم' };
  const SOURCE = { contact: 'فورم التواصل', audit: 'فحص مجاني', quiz: 'اختبار الباقة' };

  async function viewDashboard() {
    setTitle('الرئيسية');
    const s = await refreshBadge();
    if (!s) return;
    const total = Math.max(1, s.leads);
    content.replaceChildren(
      el('div', { class: 'cards' },
        el('div', { class: 'stat' }, el('b', { text: s.leads }), 'إجمالي الطلبات'),
        el('div', { class: 'stat' }, el('b', { text: s.byStatus.new }), 'طلبات جديدة'),
        el('div', { class: 'stat' }, el('b', { text: s.leadsThisWeek }), 'طلبات آخر 7 أيام'),
        el('div', { class: 'stat' }, el('b', { text: s.byStatus.won }), 'تم التعاقد'),
        el('div', { class: 'stat' }, el('b', { text: s.audits }), 'طلبات فحص مجاني'),
        el('div', { class: 'stat' }, el('b', { text: s.subscribers }), 'مشتركين النشرة')),
      s.telegram ? null : el('a', { class: 'panel notice', href: '#/notify' }, el('b', { text: '🔔 فعّل إشعارات تليجرام' }), el('span', { class: 'muted', text: 'عشان يوصلك كل طلب جديد على موبايلك فورًا — دوس هنا.' })),
      el('div', { class: 'panel' }, el('h2', { text: 'حالة الطلبات' }),
        el('div', { class: 'bars' }, Object.entries(STATUS).map(([k, lab]) => el('div', { class: 'bar' },
          el('span', { text: lab }),
          el('div', { class: 'bar__track' }, (() => { const f = el('div', { class: 'bar__fill' }); f.style.width = (s.byStatus[k] / total * 100) + '%'; return f; })()),
          el('b', { text: s.byStatus[k] }))))),
      el('div', { class: 'panel' }, el('h2', { text: 'أحدث الطلبات' }),
        s.recentLeads.length
          ? el('div', { class: 'mini' }, s.recentLeads.map((l) => el('a', { href: '#/leads' }, el('span', {}, l.name + ' — ' + (SOURCE[l.source] || '') + (l.service && l.source !== 'audit' ? ' • ' + l.service : '')), el('span', { class: 'pill pill--' + l.status, text: STATUS[l.status] || l.status }))))
          : el('p', { class: 'muted', text: 'لا توجد طلبات بعد. أول ما حد يملأ فورم التواصل في الموقع هيظهر هنا.' })));
  }

  async function viewLeads() {
    setTitle('الطلبات');
    const q = el('input', { type: 'search', placeholder: 'بحث بالاسم أو الموبايل أو البريد...' });
    const st = el('select', {}, el('option', { value: '' }, 'كل الحالات'), Object.entries(STATUS).map(([k, v]) => el('option', { value: k }, v)));
    const src = el('select', {}, el('option', { value: '' }, 'كل المصادر'), Object.entries(SOURCE).map(([k, v]) => el('option', { value: k }, v)));
    const exp = el('a', { class: 'btn btn--ghost', href: '/api/admin/leads.csv', text: '⬇️ تصدير CSV' });
    const list = el('div', { class: 'list' });
    content.replaceChildren(el('div', { class: 'toolbar' }, q, st, src, exp), list);
    let timer;
    const load = async () => {
      const params = new URLSearchParams();
      if (q.value.trim()) params.set('q', q.value.trim());
      if (st.value) params.set('status', st.value);
      if (src.value) params.set('source', src.value);
      const { items } = await api('/leads?' + params);
      if (!items.length) { list.replaceChildren(el('div', { class: 'empty', text: 'لا توجد طلبات.' })); return; }
      list.replaceChildren(...items.map((l) => {
        const wa = l.phone ? l.phone.replace(/[^\d]/g, '').replace(/^0(?=1)/, '20') : '';
        const sel = el('select', { 'aria-label': 'الحالة' }, Object.entries(STATUS).map(([k, v]) => el('option', { value: k, selected: l.status === k }, v)));
        sel.style.width = 'auto';
        sel.addEventListener('change', async () => { try { await api('/leads/' + l.id, { method: 'PATCH', body: { status: sel.value } }); toast('تم تحديث الحالة'); refreshBadge(); } catch (e) { toast(e.message, true); } });
        return el('div', { class: 'item' },
          el('div', { class: 'item__head' }, el('span', { class: 'item__title', text: l.name }), el('span', { class: 'toolbar' }, el('span', { class: 'pill pill--src', text: SOURCE[l.source] || l.source }), el('span', { class: 'pill pill--' + l.status, text: STATUS[l.status] }))),
          el('div', { class: 'item__meta' },
            el('span', { text: '🕒 ' + fmtDate(l.created_at) }),
            l.phone ? el('a', { href: 'tel:' + l.phone.replace(/[^\d+]/g, ''), dir: 'ltr', text: '📞 ' + l.phone }) : null,
            wa ? el('a', { href: 'https://wa.me/' + wa, target: '_blank', rel: 'noopener', text: '💬 واتساب' }) : null,
            l.email ? el('a', { href: 'mailto:' + l.email, dir: 'ltr', text: '✉️ ' + l.email }) : null,
            l.company ? el('span', { text: '🏢 ' + l.company }) : null,
            l.service ? el('span', { text: '🧩 ' + l.service }) : null,
            l.budget ? el('span', { text: '💰 ' + l.budget }) : null,
            /^https?:\/\//.test(l.page_url || '') ? el('a', { href: l.page_url, target: '_blank', rel: 'noopener noreferrer', dir: 'ltr', text: '🔗 ' + l.page_url.replace(/^https?:\/\//, '').slice(0, 45) }) : null),
          l.message ? el('p', { class: 'item__text', text: l.message }) : null,
          l.notes ? el('p', { class: 'item__text muted', text: '📝 ' + l.notes }) : null,
          el('div', { class: 'item__actions' }, sel,
            el('button', { class: 'btn btn--ghost btn--sm', type: 'button', text: '📝 ملاحظات', onclick: () => openModal('ملاحظات: ' + l.name, [{ name: 'notes', label: 'ملاحظات داخلية', type: 'textarea', full: true, rows: 6 }], l, async (d) => { await api('/leads/' + l.id, { method: 'PATCH', body: d }); toast('تم الحفظ'); load(); }) }),
            el('button', { class: 'btn btn--danger btn--sm', type: 'button', text: '🗑️ حذف', onclick: async () => { if (!confirm('حذف هذا الطلب نهائيًا؟')) return; try { await api('/leads/' + l.id, { method: 'DELETE' }); toast('تم الحذف'); load(); refreshBadge(); } catch (e) { toast(e.message, true); } } })));
      }));
    };
    q.addEventListener('input', () => { clearTimeout(timer); timer = setTimeout(load, 300); });
    st.addEventListener('change', load);
    src.addEventListener('change', load);
    await load();
  }

  async function viewSubscribers() {
    setTitle('المشتركين');
    const { items } = await api('/subscribers');
    const list = el('div', { class: 'list' });
    const copy = el('button', { class: 'btn btn--ghost', type: 'button', text: '📋 نسخ كل الإيميلات', onclick: async () => { try { await navigator.clipboard.writeText(items.map((i) => i.email).join('\n')); toast('تم النسخ'); } catch { toast('تعذّر النسخ', true); } } });
    content.replaceChildren(el('div', { class: 'toolbar' }, el('span', { class: 'muted', text: `العدد: ${items.length}` }), items.length ? copy : null), list);
    if (!items.length) { list.replaceChildren(el('div', { class: 'empty', text: 'لا يوجد مشتركين بعد.' })); return; }
    list.replaceChildren(...items.map((s) => el('div', { class: 'item' }, el('div', { class: 'item__head' },
      el('span', { dir: 'ltr', text: s.email }), el('span', { class: 'muted small', text: fmtDate(s.created_at) }),
      el('button', { class: 'btn btn--danger btn--sm', type: 'button', text: 'حذف', onclick: async () => { if (!confirm('حذف المشترك؟')) return; await api('/subscribers/' + s.id, { method: 'DELETE' }); viewSubscribers(); } })))));
  }

  const SETTINGS_FIELDS = [
    { name: 'site_name', label: 'اسم الموقع' },
    { name: 'tagline', label: 'الشعار', ltr: true },
    { name: 'hero_title', label: 'العنوان الرئيسي', full: true },
    { name: 'hero_subtitle', label: 'الوصف تحت العنوان', type: 'textarea', full: true },
    { name: 'about_title', label: 'عنوان قسم "من نحن"' },
    { name: 'about_text', label: 'نص "من نحن"', type: 'textarea', full: true },
    { name: 'stats', label: 'أرقام الإنجازات (اختياري)', type: 'textarea', full: true, hint: 'كل سطر: الرقم|الوصف — مثال: 120+|عميل سعيد. سيبه فاضي لإخفاء القسم.' },
    { name: 'phone', label: 'رقم الهاتف', ltr: true, placeholder: '+20 100 000 0000' },
    { name: 'whatsapp', label: 'رقم واتساب', ltr: true, placeholder: '01xxxxxxxxx', hint: 'أزرار واتساب في الموقع كله بتشتغل على الرقم ده' },
    { name: 'email', label: 'البريد الإلكتروني', ltr: true },
    { name: 'address', label: 'العنوان' },
    { name: 'working_hours', label: 'مواعيد العمل', placeholder: 'السبت – الخميس، 10ص – 6م' },
    { name: 'facebook', label: 'Facebook', ltr: true, placeholder: 'https://facebook.com/...' },
    { name: 'instagram', label: 'Instagram', ltr: true, placeholder: 'https://instagram.com/...' },
    { name: 'tiktok', label: 'TikTok', ltr: true, placeholder: 'https://tiktok.com/@...' },
    { name: 'linkedin', label: 'LinkedIn', ltr: true },
    { name: 'youtube', label: 'YouTube', ltr: true },
    { name: 'x', label: 'X (Twitter)', ltr: true },
  ];

  async function viewSettings() {
    setTitle('إعدادات الموقع');
    const { settings } = await api('/settings');
    const form = el('form', { class: 'panel', novalidate: true });
    const grid = el('div', { class: 'form-grid' }, SETTINGS_FIELDS.map((f) => fieldInput(f, settings[f.name])));
    const save = el('button', { class: 'btn btn--primary', type: 'submit', text: '💾 حفظ الإعدادات' });
    form.append(grid, el('div', { class: 'toolbar' }, save));
    form.style.display = 'grid'; form.style.gap = '1.2rem';
    form.addEventListener('submit', async (e) => {
      e.preventDefault(); save.disabled = true;
      const data = {};
      for (const f of SETTINGS_FIELDS) data[f.name] = form.querySelector(`[name="${f.name}"]`).value;
      try { const r = await api('/settings', { method: 'PUT', body: data }); toast(r.message); } catch (err) { toast(err.message, true); } finally { save.disabled = false; }
    });
    content.replaceChildren(form);
  }

  async function viewNotify() {
    setTitle('إشعارات تليجرام');
    const s = await api('/notify');
    const msg = el('p', { class: 'msg' });
    const say = (t, bad) => { msg.className = 'msg ' + (bad ? 'err' : 'ok'); msg.textContent = t; };
    const run = async (btn, fn) => { btn.disabled = true; try { await fn(); } catch (e) { say(e.message, true); } finally { btn.disabled = false; } };

    const status = s.chatId
      ? el('div', { class: 'panel notice notice--ok' }, el('b', { text: '✅ الإشعارات شغالة' }), el('span', { class: 'muted', text: 'بتوصل لـ: ' + (s.chatTitle || s.chatId) }))
      : el('div', { class: 'panel notice' }, el('b', { text: '🔔 الإشعارات مش متفعّلة لسه' }), el('span', { class: 'muted', text: 'اتبع الخطوات اللي تحت (5 دقايق).' }));

    const token = el('input', { type: 'text', dir: 'ltr', placeholder: s.hasToken ? 'محفوظ ' + s.tokenHint + ' — حط توكن جديد لو عايز تغيّره' : '123456789:ABCdef...', autocomplete: 'off' });
    const saveBtn = el('button', { class: 'btn btn--primary', type: 'button', text: 'حفظ التوكن' });
    saveBtn.addEventListener('click', () => run(saveBtn, async () => { const r = await api('/notify', { method: 'PUT', body: { bot_token: token.value.trim() } }); token.value = ''; say(r.message); }));
    const detectBtn = el('button', { class: 'btn btn--primary', type: 'button', text: 'ربط حسابي' });
    detectBtn.addEventListener('click', () => run(detectBtn, async () => { const r = await api('/notify/detect', { method: 'POST', body: {} }); say(r.message); setTimeout(viewNotify, 1200); }));
    const testBtn = el('button', { class: 'btn btn--ghost', type: 'button', text: '🧪 ابعت رسالة تجريبية' });
    testBtn.addEventListener('click', () => run(testBtn, async () => { const r = await api('/notify/test', { method: 'POST', body: {} }); say(r.message); }));
    const offBtn = el('button', { class: 'btn btn--danger', type: 'button', text: 'إيقاف الإشعارات' });
    offBtn.addEventListener('click', () => { if (confirm('إيقاف إشعارات تليجرام؟')) run(offBtn, async () => { await api('/notify', { method: 'PUT', body: { clear: true } }); viewNotify(); }); });

    const step = (n, title, ...kids) => el('div', { class: 'panel step' }, el('h2', {}, el('span', { class: 'step__n', text: n }), title), ...kids);
    content.replaceChildren(status,
      step('1', 'اعمل بوت من BotFather',
        el('ol', { class: 'steps-list' },
          el('li', {}, 'افتح تليجرام وادخل على ', el('a', { href: 'https://t.me/BotFather', target: '_blank', rel: 'noopener', text: '@BotFather' })),
          el('li', { text: 'ابعتله /newbot' }),
          el('li', { text: 'اكتب اسم للبوت (مثلًا NEXORA Leads)، وبعدين username لازم يخلص بـ bot (مثلًا nexora_leads_bot)' }),
          el('li', { text: 'هيبعتلك توكن شكله كده: 123456789:ABC... — انسخه' }))),
      step('2', 'حط التوكن هنا', el('div', { class: 'toolbar' }, token, saveBtn)),
      step('3', 'ابعت للبوت رسالة واربط حسابك',
        el('p', { class: 'muted', text: 'افتح البوت الجديد في تليجرام، دوس Start أو ابعتله "مرحبا"، وبعدين ارجع هنا ودوس:' }),
        el('div', { class: 'toolbar' }, detectBtn)),
      el('div', { class: 'toolbar' }, s.chatId ? testBtn : null, s.hasToken ? offBtn : null),
      msg);
  }

  async function viewAccount() {
    setTitle('الحساب');
    const form = el('form', { class: 'panel', novalidate: true },
      el('h2', { text: 'تغيير كلمة المرور' }),
      el('div', { class: 'form-grid' },
        el('label', { class: 'full' }, 'كلمة المرور الحالية', el('input', { type: 'password', name: 'current', autocomplete: 'current-password', dir: 'ltr' })),
        el('label', {}, 'كلمة المرور الجديدة', el('input', { type: 'password', name: 'next', autocomplete: 'new-password', dir: 'ltr' }), el('span', { class: 'hint', text: '10 حروف على الأقل وفيها أرقام' })),
        el('label', {}, 'تأكيد كلمة المرور', el('input', { type: 'password', name: 'confirm', autocomplete: 'new-password', dir: 'ltr' }))),
      el('div', { class: 'toolbar' }, el('button', { class: 'btn btn--primary', type: 'submit', text: 'تغيير كلمة المرور' })));
    form.style.display = 'grid'; form.style.gap = '1rem';
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      if (form.next.value !== form.confirm.value) { toast('كلمتا المرور غير متطابقتين', true); return; }
      try { const r = await api('/password', { method: 'POST', body: { current_password: form.current.value, new_password: form.next.value } }); toast(r.message); form.reset(); } catch (err) { toast(err.message, true); }
    });
    content.replaceChildren(form, el('div', { class: 'panel' }, el('h2', { text: 'معلومات' }), el('p', { class: 'muted', text: 'تغيير كلمة المرور بيسجّل خروج كل الأجهزة التانية تلقائيًا. الجلسة بتنتهي بعد 7 أيام.' })));
  }

  const ROUTES = {
    dashboard: viewDashboard, leads: viewLeads, subscribers: viewSubscribers, settings: viewSettings, account: viewAccount, notify: viewNotify,
    services: () => viewCollection('services'), portfolio: () => viewCollection('portfolio'), packages: () => viewCollection('packages'),
    testimonials: () => viewCollection('testimonials'), faqs: () => viewCollection('faqs'),
  };

  async function route() {
    const name = (location.hash.replace(/^#\/?/, '') || 'dashboard').split('?')[0];
    const fn = ROUTES[name] || viewDashboard;
    document.querySelectorAll('#sideNav a').forEach((a) => a.classList.toggle('active', a.dataset.route === name));
    content.replaceChildren(el('p', { class: 'muted', text: 'جاري التحميل...' }));
    try { await fn(); } catch (err) { content.replaceChildren(el('div', { class: 'empty', text: err.message })); }
  }
  window.addEventListener('hashchange', route);

  async function startApp() {
    const me = await api('/me');
    $('#whoami').textContent = '👤 ' + me.username;
    $('#authView').hidden = true; $('#appView').hidden = false;
    refreshBadge();
    route();
  }

  // ---------- Boot ----------
  (async () => {
    try { await startApp(); } catch {
      try {
        const r = await fetch('/api/admin/setup-status').then((x) => x.json());
        showAuth(!!r.needsSetup);
      } catch { showAuth(false); }
    }
  })();
})();
