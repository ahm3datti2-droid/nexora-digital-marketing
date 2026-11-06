(() => {
  'use strict';
  const $ = (s, r = document) => r.querySelector(s);
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
  const lines = (t) => String(t || '').split('\n').map((s) => s.trim()).filter(Boolean);
  const safeUrl = (u) => (/^https:\/\//i.test(u || '') || /^\/[^/]/.test(u || '') ? u : '');

  $('#year').textContent = new Date().getFullYear();

  // ---------- Mobile nav ----------
  const toggle = $('#navToggle');
  const links = $('#navLinks');
  toggle.addEventListener('click', () => {
    const open = links.classList.toggle('open');
    toggle.setAttribute('aria-expanded', String(open));
    toggle.setAttribute('aria-label', open ? 'إغلاق القائمة' : 'فتح القائمة');
  });
  links.addEventListener('click', (e) => {
    if (e.target.closest('a')) { links.classList.remove('open'); toggle.setAttribute('aria-expanded', 'false'); }
  });

  // ---------- Reveal on scroll ----------
  const io = 'IntersectionObserver' in window
    ? new IntersectionObserver((entries) => entries.forEach((en) => {
      if (en.isIntersecting) { en.target.classList.add('in'); io.unobserve(en.target); }
    }), { threshold: 0.12 })
    : null;
  const reveal = (nodes) => nodes.forEach((n) => { if (io) { n.classList.add('reveal'); io.observe(n); } });

  // ---------- Renderers ----------
  function renderSettings(s) {
    document.querySelectorAll('[data-setting]').forEach((n) => {
      const v = s[n.dataset.setting];
      if (v) n.textContent = v;
    });

    const stats = lines(s.stats).map((l) => l.split('|')).filter((p) => p.length >= 2);
    const statsEl = $('#stats');
    statsEl.replaceChildren(...stats.map(([num, label]) => el('li', {}, el('b', { text: num.trim() }), el('span', { text: label.trim() }))));
    statsEl.hidden = !stats.length;

    const list = $('#contactList');
    const items = [];
    const wa = String(s.whatsapp || '').replace(/[^\d]/g, '');
    if (s.phone) items.push(['📞', s.phone, 'tel:' + s.phone.replace(/[^\d+]/g, '')]);
    if (wa) items.push(['💬', 'واتساب', 'https://wa.me/' + wa]);
    if (s.email) items.push(['✉️', s.email, 'mailto:' + s.email]);
    if (s.address) items.push(['📍', s.address, null]);
    if (s.working_hours) items.push(['🕒', s.working_hours, null]);
    list.replaceChildren(...items.map(([ic, label, href]) => el('li', {},
      el('span', { class: 'ic', 'aria-hidden': 'true', text: ic }),
      href ? el('a', { href, dir: /^[\d+\s()-]+$|@/.test(label) ? 'ltr' : null, target: href.startsWith('http') ? '_blank' : null, rel: 'noopener', text: label }) : el('span', { text: label }))));

    const soc = [['facebook', 'Facebook'], ['instagram', 'Instagram'], ['tiktok', 'TikTok'], ['linkedin', 'LinkedIn'], ['youtube', 'YouTube'], ['x', 'X']]
      .filter(([k]) => safeUrl(s[k]) && /^https:/.test(s[k]));
    $('#socials').replaceChildren(...soc.map(([k, label]) => el('a', { href: s[k], target: '_blank', rel: 'noopener', text: label })));

    const waBtn = $('#waFloat');
    if (wa) {
      waBtn.href = 'https://wa.me/' + wa + '?text=' + encodeURIComponent('مرحبًا NEXORA، عايز أعرف تفاصيل أكتر عن خدماتكم');
      waBtn.hidden = false;
    }
  }

  function renderServices(services) {
    const grid = $('#servicesGrid');
    grid.replaceChildren(...services.map((sv) => el('article', { class: 'card service' },
      el('div', { class: 'service__icon', 'aria-hidden': 'true', text: sv.icon || '🚀' }),
      el('h3', { text: sv.title }),
      el('p', { text: sv.description }),
      lines(sv.features).length ? el('ul', { class: 'ticks' }, lines(sv.features).map((f) => el('li', { text: f }))) : null)));
    reveal([...grid.children]);
    const sel = $('#serviceSelect');
    services.forEach((sv) => sel.append(el('option', { text: sv.title })));
    sel.append(el('option', { text: 'أخرى' }));
  }

  function renderPortfolio(items) {
    const section = $('#work');
    const navLink = document.querySelector('[data-section="portfolio"]');
    if (!items.length) { section.hidden = true; if (navLink) navLink.hidden = true; return; }
    section.hidden = false;
    const grid = $('#workGrid');
    const draw = (cat) => {
      const list = cat ? items.filter((i) => i.category === cat) : items;
      grid.replaceChildren(...list.map((w) => {
        const img = safeUrl(w.image_url);
        const card = el('article', { class: 'card work' },
          el('div', { class: 'work__img' }, img ? el('img', { src: img, alt: w.title, loading: 'lazy' }) : 'NEXORA'),
          el('div', { class: 'work__body' },
            w.category ? el('span', { class: 'tag', text: w.category }) : null,
            el('h3', { text: w.title }),
            w.description ? el('p', { class: 'muted', text: w.description }) : null,
            w.result ? el('p', { class: 'work__result', text: '📈 ' + w.result }) : null,
            safeUrl(w.link) ? el('a', { href: w.link, target: '_blank', rel: 'noopener', text: 'عرض المشروع ←' }) : null));
        return card;
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

  function renderPackages(pk) {
    const section = $('#pricing');
    if (!pk.length) { section.hidden = true; return; }
    section.hidden = false;
    const grid = $('#pricingGrid');
    grid.replaceChildren(...pk.map((p) => el('article', { class: 'card price' + (p.featured ? ' price--featured' : '') },
      p.featured ? el('span', { class: 'price__badge', text: 'الأكثر طلبًا' }) : null,
      el('h3', { text: p.name }),
      p.description ? el('p', { class: 'muted', text: p.description }) : null,
      p.price
        ? el('div', { class: 'price__amount' }, p.price + ' ', p.period ? el('small', { text: '/ ' + p.period }) : null)
        : el('div', { class: 'price__ask', text: 'السعر حسب احتياجك' }),
      el('ul', { class: 'ticks' }, lines(p.features).map((f) => el('li', { text: f }))),
      el('a', { href: '#contact', class: 'btn ' + (p.featured ? 'btn--primary' : 'btn--ghost'), 'data-package': p.name, text: 'اطلب الباقة' }))));
    grid.addEventListener('click', (e) => {
      const a = e.target.closest('[data-package]');
      if (a) { const m = $('#contactForm [name=message]'); if (!m.value) m.value = 'مهتم بـ ' + a.dataset.package; }
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
      renderPortfolio(c.portfolio || []);
      renderPackages(c.packages || []);
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
    msg.className = 'form__msg';
    if (!data.name || data.name.trim().length < 2) { msg.className = 'form__msg err'; msg.textContent = 'من فضلك اكتب اسمك'; return; }
    if (!data.phone && !data.email) { msg.className = 'form__msg err'; msg.textContent = 'من فضلك اكتب رقم الموبايل أو البريد الإلكتروني'; return; }
    const btn = cf.querySelector('button[type=submit]');
    btn.disabled = true; msg.textContent = 'جاري الإرسال...';
    try {
      const res = await submitJson('/api/contact', data);
      msg.className = 'form__msg ok'; msg.textContent = res.message || 'تم الإرسال بنجاح';
      cf.reset();
    } catch (err) {
      msg.className = 'form__msg err'; msg.textContent = err.message;
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
