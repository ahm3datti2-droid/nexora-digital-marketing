(() => {
  'use strict';
  const $ = (s, r = document) => r.querySelector(s);
  const SVGNS = 'http://www.w3.org/2000/svg';
  const el = (tag, attrs = {}, ...kids) => {
    const n = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs)) {
      if (v == null || v === false) continue;
      if (k === 'class') n.className = v;
      else if (k === 'text') n.textContent = v;
      else n.setAttribute(k, v);
    }
    for (const k of kids.flat()) if (k != null) n.append(k.nodeType ? k : document.createTextNode(k));
    return n;
  };
  const icon = (id, viewBox) => {
    const s = document.createElementNS(SVGNS, 'svg');
    s.setAttribute('aria-hidden', 'true');
    if (viewBox) s.setAttribute('viewBox', viewBox);
    const u = document.createElementNS(SVGNS, 'use');
    u.setAttribute('href', '#i-' + id);
    s.append(u);
    return s;
  };
  const ICON_KEYS = ['social', 'ads', 'brand', 'web', 'seo', 'content', 'chart', 'target', 'shield', 'bolt'];
  const lines = (t) => String(t || '').split('\n').map((s) => s.trim()).filter(Boolean);
  const safeUrl = (u) => (/^https:\/\//i.test(u || '') || /^\/[^/]/.test(u || '') ? u : '');
  // Accept 01xxxxxxxxx (Egypt local) or international digits
  const waNumber = (v) => {
    let d = String(v || '').replace(/[^\d]/g, '');
    if (/^01\d{9}$/.test(d)) d = '2' + d;
    return d.length >= 8 ? d : '';
  };
  const waLink = (num, text) => 'https://wa.me/' + num + (text ? '?text=' + encodeURIComponent(text) : '');
  const DEFAULT_WA_TEXT = 'مرحبًا NEXORA، عايز أعرف تفاصيل أكتر عن خدماتكم';

  let WA = '';
  let PHONE = '';

  $('#year').textContent = new Date().getFullYear();

  // ---------- Mobile nav ----------
  const toggle = $('#navToggle');
  const links = $('#navLinks');
  const setMenu = (open) => {
    links.classList.toggle('open', open);
    toggle.setAttribute('aria-expanded', String(open));
    toggle.setAttribute('aria-label', open ? 'إغلاق القائمة' : 'فتح القائمة');
  };
  toggle.addEventListener('click', () => setMenu(!links.classList.contains('open')));
  links.addEventListener('click', (e) => { if (e.target.closest('a')) setMenu(false); });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') setMenu(false); });

  // ---------- Reveal on scroll ----------
  const io = 'IntersectionObserver' in window
    ? new IntersectionObserver((entries) => entries.forEach((en) => {
      if (en.isIntersecting) { en.target.classList.add('in'); io.unobserve(en.target); }
    }), { threshold: 0.1 })
    : null;
  const reveal = (nodes) => nodes.forEach((n) => { if (io) { n.classList.add('reveal'); io.observe(n); } });

  // ---------- Renderers ----------
  function renderSettings(s) {
    document.querySelectorAll('[data-setting]').forEach((n) => {
      const v = s[n.dataset.setting];
      if (v) n.textContent = v;
    });

    WA = waNumber(s.whatsapp);
    PHONE = String(s.phone || '').replace(/[^\d+]/g, '');

    const stats = lines(s.stats).map((l) => l.split('|')).filter((p) => p.length >= 2);
    const statsEl = $('#stats');
    statsEl.replaceChildren(...stats.map(([num, label]) => el('li', {}, el('b', { text: num.trim() }), el('span', { text: label.trim() }))));
    statsEl.hidden = !stats.length;

    // Buttons marked data-wa / data-call
    if (WA) {
      document.querySelectorAll('[data-wa]').forEach((a) => {
        a.href = waLink(WA, DEFAULT_WA_TEXT); a.target = '_blank'; a.rel = 'noopener';
      });
    }
    document.querySelectorAll('[data-call]').forEach((a) => { if (PHONE) a.href = 'tel:' + PHONE; else a.hidden = true; });

    // Contact cards
    const cards = [];
    if (WA) cards.push(['wa', 'wa', 'واتساب', 'أسرع طريقة — رد سريع', waLink(WA, DEFAULT_WA_TEXT), '0 0 32 32']);
    if (PHONE) cards.push(['call', 'phone', 'اتصل بينا', s.phone, 'tel:' + PHONE]);
    if (safeUrl(s.facebook)) cards.push(['fb', 'fb', 'فيسبوك', 'تابعنا وابعتلنا رسالة', s.facebook]);
    if (s.email) cards.push(['mail', 'mail', 'البريد الإلكتروني', s.email, 'mailto:' + s.email]);
    $('#contactCards').replaceChildren(...cards.map(([cls, ic, title, sub, href, vb]) => el('a', {
      class: 'ccard ccard--' + cls, href, target: href.startsWith('http') ? '_blank' : null, rel: 'noopener',
    }, el('span', { class: 'ccard__ic' }, icon(ic, vb)), el('div', {}, el('b', { text: title }), el('small', { text: sub, dir: cls === 'call' || cls === 'mail' ? 'ltr' : null })), el('span', { class: 'ccard__arrow', 'aria-hidden': 'true', text: '←' }))));
    if (s.address || s.working_hours) {
      $('#contactCards').append(el('p', { class: 'muted' }, [s.address, s.working_hours].filter(Boolean).join(' • ')));
    }

    // Footer contact
    const fc = $('#footerContact');
    if (PHONE) fc.append(el('a', { href: 'tel:' + PHONE, dir: 'ltr', text: s.phone }));
    if (WA) fc.append(el('a', { href: waLink(WA, DEFAULT_WA_TEXT), target: '_blank', rel: 'noopener', text: 'واتساب' }));
    for (const [k, label] of [['facebook', 'Facebook'], ['instagram', 'Instagram'], ['tiktok', 'TikTok'], ['linkedin', 'LinkedIn'], ['youtube', 'YouTube'], ['x', 'X']]) {
      if (safeUrl(s[k]) && /^https:/.test(s[k])) fc.append(el('a', { href: s[k], target: '_blank', rel: 'noopener', text: label }));
    }
    if (s.email) fc.append(el('a', { href: 'mailto:' + s.email, dir: 'ltr', text: s.email }));
    if (fc.children.length === 1) fc.hidden = true;

    // Floating WhatsApp (desktop) + bottom bar (mobile)
    if (WA) {
      const f = $('#waFloat'); f.href = waLink(WA, DEFAULT_WA_TEXT); f.hidden = false;
    }
    if (WA || PHONE) {
      const bar = $('#mbar');
      const call = $('#mbarCall'); const wa = $('#mbarWa');
      if (PHONE) call.href = 'tel:' + PHONE; else call.hidden = true;
      if (WA) wa.href = waLink(WA, DEFAULT_WA_TEXT); else wa.hidden = true;
      if (!PHONE || !WA) bar.style.gridTemplateColumns = '1fr';
      bar.hidden = false;
      document.body.classList.add('has-mbar');
    }
  }

  function renderServices(services) {
    const grid = $('#servicesGrid');
    grid.replaceChildren(...services.map((sv) => el('article', { class: 'card service' },
      el('div', { class: 'service__icon', 'aria-hidden': 'true' }, ICON_KEYS.includes(sv.icon) ? icon(sv.icon) : (sv.icon || '🚀')),
      el('h3', { text: sv.title }),
      el('p', { text: sv.description }),
      lines(sv.features).length ? el('ul', { class: 'ticks' }, lines(sv.features).map((f) => el('li', { text: f }))) : null)));
    reveal([...grid.children]);
  }

  function fillServiceSelect(packages, services) {
    const sel = $('#serviceSelect');
    if (packages.length) {
      sel.append(el('optgroup', { label: 'الباقات' }, packages.map((p) => el('option', { value: p.name, text: p.price ? `${p.name} — ${p.price} ج.م` : p.name }))));
    }
    if (services.length) {
      sel.append(el('optgroup', { label: 'الخدمات' }, services.map((sv) => el('option', { value: sv.title, text: sv.title }))));
    }
    sel.append(el('option', { value: 'استشارة عامة', text: 'مش متأكد — محتاج استشارة' }));
  }

  function renderPortfolio(items) {
    const section = $('#work');
    const navLink = document.querySelector('[data-section="portfolio"]');
    if (!items.length) { section.hidden = true; if (navLink) navLink.hidden = true; return; }
    section.hidden = false; if (navLink) navLink.hidden = false;
    const grid = $('#workGrid');
    const draw = (cat) => {
      const list = cat ? items.filter((i) => i.category === cat) : items;
      grid.replaceChildren(...list.map((w) => {
        const img = safeUrl(w.image_url);
        return el('article', { class: 'card work' },
          el('div', { class: 'work__img' }, img ? el('img', { src: img, alt: w.title, loading: 'lazy' }) : 'NEXORA'),
          el('div', { class: 'work__body' },
            w.category ? el('span', { class: 'tag', text: w.category }) : null,
            el('h3', { text: w.title }),
            w.description ? el('p', { class: 'muted', text: w.description }) : null,
            w.result ? el('p', { class: 'work__result', text: '📈 ' + w.result }) : null,
            safeUrl(w.link) ? el('a', { href: w.link, target: '_blank', rel: 'noopener', text: 'عرض المشروع ←' }) : null));
      }));
    };
    const cats = [...new Set(items.map((i) => i.category).filter(Boolean))];
    const filters = $('#workFilters');
    if (cats.length > 1) {
      const mk = (label, cat) => {
        const b = el('button', { type: 'button', role: 'tab', 'aria-selected': cat === '' ? 'true' : 'false', text: label });
        b.addEventListener('click', () => {
          filters.querySelectorAll('button').forEach((x) => x.setAttribute('aria-selected', 'false'));
          b.setAttribute('aria-selected', 'true');
          draw(cat);
        });
        return b;
      };
      filters.replaceChildren(mk('الكل', ''), ...cats.map((c) => mk(c, c)));
    }
    draw('');
  }

  function choosePackageInForm(name) {
    const sel = $('#serviceSelect');
    const opt = [...sel.options].find((o) => o.value === name);
    if (opt) sel.value = name;
    $('#contact').scrollIntoView({ behavior: 'smooth' });
    setTimeout(() => $('#contactForm [name=name]').focus({ preventScroll: true }), 600);
  }

  function renderPackages(pk) {
    const section = $('#pricing');
    if (!pk.length) { section.hidden = true; return; }
    section.hidden = false;
    const grid = $('#pricingGrid');
    grid.replaceChildren(...pk.map((p) => {
      const isNum = /^[\d,.\s]+$/.test(p.price || '');
      const msg = `مرحبًا NEXORA، عايز أشترك في ${p.name}${p.price ? ` (${p.price}${isNum ? ' ج.م' : ''} ${p.period || ''})` : ''}`.trim();
      const main = WA
        ? el('a', { href: waLink(WA, msg), target: '_blank', rel: 'noopener', class: 'btn ' + (p.featured ? 'btn--primary' : 'btn--ghost') }, 'اشترك في الباقة')
        : el('a', { href: '#contact', class: 'btn ' + (p.featured ? 'btn--primary' : 'btn--ghost'), 'data-pick': p.name }, 'اطلب الباقة');
      return el('article', { class: 'card price' + (p.featured ? ' price--featured' : '') },
        p.featured ? el('span', { class: 'price__badge', text: '⭐ الأكثر طلبًا' }) : null,
        el('h3', { text: p.name }),
        el('p', { class: 'price__desc', text: p.description || '' }),
        p.price
          ? el('div', { class: 'price__amount' },
            el('span', { class: 'price__num', text: p.price }),
            isNum ? el('span', { class: 'price__cur', text: 'ج.م' }) : null,
            p.period ? el('span', { class: 'price__per', text: '/ ' + p.period }) : null)
          : el('div', { class: 'price__ask', text: 'السعر حسب احتياجك' }),
        el('ul', { class: 'ticks' }, lines(p.features).map((f) => el('li', { text: f }))),
        main,
        WA ? el('a', { href: '#contact', class: 'price__alt', 'data-pick': p.name, text: 'أو سيب رقمك ونكلمك' }) : null);
    }));
    grid.addEventListener('click', (e) => {
      const a = e.target.closest('[data-pick]');
      if (a) { e.preventDefault(); choosePackageInForm(a.dataset.pick); }
    });
    reveal([...grid.children]);
  }

  function renderTestimonials(t) {
    const section = $('#testimonials');
    if (!t.length) { section.hidden = true; return; }
    section.hidden = false;
    const grid = $('#testimonialsGrid');
    grid.replaceChildren(...t.map((q) => el('figure', { class: 'card quote' },
      el('div', { class: 'quote__stars', 'aria-label': `${q.rating} من 5`, text: '★'.repeat(Math.max(1, Math.min(5, q.rating || 5))) }),
      el('blockquote', {}, el('p', { text: q.content })),
      el('footer', {}, el('b', { text: q.name }), q.role ? el('span', { text: q.role }) : null))));
    reveal([...grid.children]);
  }

  function renderFaqs(f) {
    const section = $('#faq');
    if (!f.length) { section.hidden = true; return; }
    section.hidden = false;
    $('#faqList').replaceChildren(...f.map((q, i) => el('details', i === 0 ? { open: '' } : {},
      el('summary', { text: q.question }), el('p', { text: q.answer }))));
  }

  // ---------- Load content ----------
  fetch('/api/content', { headers: { accept: 'application/json' } })
    .then((r) => { if (!r.ok) throw new Error(r.status); return r.json(); })
    .then((c) => {
      renderSettings(c.settings || {});
      renderServices(c.services || []);
      renderPackages(c.packages || []);
      fillServiceSelect(c.packages || [], c.services || []);
      renderPortfolio(c.portfolio || []);
      renderTestimonials(c.testimonials || []);
      renderFaqs(c.faqs || []);
    })
    .catch(() => { $('#servicesGrid').replaceChildren(el('p', { class: 'muted', text: 'تعذّر تحميل المحتوى، حاول تحديث الصفحة.' })); });

  reveal([...document.querySelectorAll('.why li, .steps li')]);

  // ---------- Forms ----------
  async function submitJson(url, data) {
    const r = await fetch(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(data) });
    const body = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(body.error || 'حدث خطأ، حاول مرة أخرى');
    return body;
  }

  const cf = $('#contactForm');
  cf.addEventListener('submit', async (e) => {
    e.preventDefault();
    const msg = $('#contactMsg');
    const data = Object.fromEntries(new FormData(cf));
    const err = (t, field) => { msg.className = 'form__msg err'; msg.textContent = t; if (field) cf[field].focus(); };
    if (!data.name || data.name.trim().length < 2) return err('من فضلك اكتب اسمك', 'name');
    if (!/^[+\d\s()-]{8,}$/.test(data.phone || '')) return err('من فضلك اكتب رقم موبايل صحيح', 'phone');
    const btn = cf.querySelector('button[type=submit]');
    btn.disabled = true; msg.className = 'form__msg'; msg.textContent = 'جاري الإرسال...';
    try {
      const res = await submitJson('/api/contact', data);
      msg.className = 'form__msg ok'; msg.textContent = res.message || 'تم الإرسال بنجاح';
      cf.reset();
    } catch (e2) {
      err(e2.message);
    } finally { btn.disabled = false; }
  });

  const nf = $('#newsletterForm');
  nf.addEventListener('submit', async (e) => {
    e.preventDefault();
    const msg = $('#nlMsg');
    const btn = nf.querySelector('button');
    btn.disabled = true;
    try {
      const res = await submitJson('/api/subscribe', { email: nf.email.value });
      msg.className = 'form__msg ok'; msg.textContent = res.message; nf.reset();
    } catch (err) {
      msg.className = 'form__msg err'; msg.textContent = err.message;
    } finally { btn.disabled = false; }
  });
})();
