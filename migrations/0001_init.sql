-- NEXORA Digital Marketing — initial schema

CREATE TABLE IF NOT EXISTS settings (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL DEFAULT ''
);

-- Private key/value store (never exposed by public API)
CREATE TABLE IF NOT EXISTS system (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS services (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  icon        TEXT NOT NULL DEFAULT '🚀',
  title       TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  features    TEXT NOT NULL DEFAULT '',
  sort_order  INTEGER NOT NULL DEFAULT 0,
  active      INTEGER NOT NULL DEFAULT 1,
  created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS portfolio (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  title       TEXT NOT NULL,
  category    TEXT NOT NULL DEFAULT '',
  description TEXT NOT NULL DEFAULT '',
  image_url   TEXT NOT NULL DEFAULT '',
  result      TEXT NOT NULL DEFAULT '',
  link        TEXT NOT NULL DEFAULT '',
  sort_order  INTEGER NOT NULL DEFAULT 0,
  active      INTEGER NOT NULL DEFAULT 1,
  created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS testimonials (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  name        TEXT NOT NULL,
  role        TEXT NOT NULL DEFAULT '',
  content     TEXT NOT NULL,
  rating      INTEGER NOT NULL DEFAULT 5,
  sort_order  INTEGER NOT NULL DEFAULT 0,
  active      INTEGER NOT NULL DEFAULT 1,
  created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS packages (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  name        TEXT NOT NULL,
  price       TEXT NOT NULL DEFAULT '',
  period      TEXT NOT NULL DEFAULT '',
  description TEXT NOT NULL DEFAULT '',
  features    TEXT NOT NULL DEFAULT '',
  featured    INTEGER NOT NULL DEFAULT 0,
  sort_order  INTEGER NOT NULL DEFAULT 0,
  active      INTEGER NOT NULL DEFAULT 1,
  created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS faqs (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  question    TEXT NOT NULL,
  answer      TEXT NOT NULL,
  sort_order  INTEGER NOT NULL DEFAULT 0,
  active      INTEGER NOT NULL DEFAULT 1,
  created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS leads (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  name        TEXT NOT NULL,
  email       TEXT NOT NULL DEFAULT '',
  phone       TEXT NOT NULL DEFAULT '',
  company     TEXT NOT NULL DEFAULT '',
  service     TEXT NOT NULL DEFAULT '',
  budget      TEXT NOT NULL DEFAULT '',
  message     TEXT NOT NULL DEFAULT '',
  status      TEXT NOT NULL DEFAULT 'new',
  notes       TEXT NOT NULL DEFAULT '',
  ip          TEXT NOT NULL DEFAULT '',
  created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_leads_created ON leads(created_at);
CREATE INDEX IF NOT EXISTS idx_leads_ip ON leads(ip, created_at);

CREATE TABLE IF NOT EXISTS subscribers (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  email       TEXT NOT NULL UNIQUE,
  created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS admins (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  username      TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  salt          TEXT NOT NULL,
  created_at    TEXT NOT NULL DEFAULT (datetime('now')),
  last_login    TEXT
);

CREATE TABLE IF NOT EXISTS sessions (
  token_hash  TEXT PRIMARY KEY,
  admin_id    INTEGER NOT NULL REFERENCES admins(id) ON DELETE CASCADE,
  expires_at  INTEGER NOT NULL,
  created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS login_attempts (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  ip          TEXT NOT NULL,
  attempted_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_attempts_ip ON login_attempts(ip, attempted_at);

-- ---------- Seed: public settings (edit from the admin dashboard) ----------
INSERT OR IGNORE INTO settings (key, value) VALUES
  ('site_name', 'NEXORA Digital Marketing'),
  ('tagline', 'Beyond Digital. Beyond Limits.'),
  ('hero_title', 'نكبّر علامتك التجارية في العالم الرقمي'),
  ('hero_subtitle', 'وكالة تسويق رقمي متكاملة: إدارة السوشيال ميديا، الإعلانات الممولة، الهوية البصرية، المواقع وتحسين محركات البحث — بخطة واضحة ونتائج تقدر تقيسها.'),
  ('about_title', 'ليه NEXORA؟'),
  ('about_text', 'إحنا فريق بيجمع بين الإبداع والتحليل. بنبدأ بفهم نشاطك وجمهورك، وبعدين نبني استراتيجية مخصّصة ونتابع الأرقام أسبوع بأسبوع عشان كل جنيه تصرفه على التسويق يرجعلك بقيمة.'),
  ('stats', ''),
  ('phone', ''),
  ('whatsapp', ''),
  ('email', ''),
  ('address', ''),
  ('working_hours', ''),
  ('facebook', ''),
  ('instagram', ''),
  ('tiktok', ''),
  ('linkedin', ''),
  ('youtube', ''),
  ('x', '');

-- ---------- Seed: services ----------
INSERT INTO services (icon, title, description, features, sort_order) VALUES
  ('📱', 'إدارة السوشيال ميديا', 'إدارة كاملة لصفحاتك على فيسبوك وإنستجرام وتيك توك ولينكدإن بمحتوى منتظم وتفاعل حقيقي.', 'خطة محتوى شهرية
تصميم بوستات وريلز
الرد على الرسائل والتعليقات
تقارير أداء شهرية', 1),
  ('🎯', 'الإعلانات الممولة', 'حملات مدروسة على Meta وGoogle وTikTok تستهدف العميل الصح بأقل تكلفة ممكنة.', 'استهداف دقيق للجمهور
اختبار A/B للإعلانات
تتبّع التحويلات والبيكسل
تحسين مستمر للميزانية', 2),
  ('🎨', 'الهوية البصرية والتصميم', 'هوية بصرية تميّز علامتك: لوجو، ألوان، خطوط، وتصميمات متناسقة لكل المنصات.', 'تصميم اللوجو
دليل الهوية البصرية
تصميمات المطبوعات
قوالب السوشيال ميديا', 3),
  ('💻', 'تصميم وتطوير المواقع', 'مواقع ومتاجر إلكترونية سريعة ومتجاوبة مع الموبايل ومجهّزة للبيع والظهور في جوجل.', 'مواقع شركات وصفحات هبوط
متاجر إلكترونية
سرعة عالية وأمان
لوحة تحكم سهلة', 4),
  ('🔍', 'تحسين محركات البحث SEO', 'نخلّي عملاءك يلاقوك أول ما يدوروا على خدمتك في جوجل.', 'تحليل الكلمات المفتاحية
تحسين المحتوى والصفحات
SEO محلي وخرائط جوجل
تقارير ترتيب دورية', 5),
  ('🎬', 'صناعة المحتوى والفيديو', 'محتوى مكتوب ومرئي بيحكي قصة علامتك ويقنع جمهورك.', 'كتابة إعلانية
تصوير وموشن جرافيك
فيديوهات ريلز قصيرة
محتوى المدونات', 6);

-- ---------- Seed: packages (prices are set by the owner from the dashboard) ----------
INSERT INTO packages (name, price, period, description, features, featured, sort_order) VALUES
  ('الباقة الأساسية', '', 'شهريًا', 'بداية قوية للمشاريع الصغيرة.', 'إدارة منصتين
12 تصميم شهريًا
الرد على الرسائل
تقرير شهري', 0, 1),
  ('باقة النمو', '', 'شهريًا', 'الأنسب للشركات اللي عايزة تكبر بسرعة.', 'إدارة 3 منصات
20 تصميم + 4 ريلز
إدارة الإعلانات الممولة
تقرير نصف شهري', 1, 2),
  ('الباقة الاحترافية', '', 'شهريًا', 'حل تسويقي متكامل للشركات والبراندات.', 'إدارة كل المنصات
محتوى وفيديو بلا حدود
حملات على Meta وGoogle وTikTok
مدير حساب مخصّص', 0, 3);

-- ---------- Seed: FAQs ----------
INSERT INTO faqs (question, answer, sort_order) VALUES
  ('إمتى أبدأ أشوف نتايج؟', 'الإعلانات الممولة بتبدأ تجيب نتايج من أول أسبوع، أما بناء الحضور العضوي وSEO فبيحتاج عادةً من 2 لـ 3 شهور من الشغل المنتظم.', 1),
  ('هل ميزانية الإعلانات ضمن سعر الباقة؟', 'لا، ميزانية الإعلانات بتتدفع مباشرة للمنصة (Meta أو Google أو TikTok) وإنت متحكم فيها بالكامل، وسعر الباقة مقابل الإدارة والمحتوى.', 2),
  ('هل فيه عقد طويل المدة؟', 'تقدر تبدأ بشهر واحد. إحنا بنكسب ثقتك بالنتايج مش بالعقود.', 3),
  ('بتشتغلوا مع أي نوع نشاط؟', 'أيوه، بنشتغل مع المطاعم والعيادات والمتاجر والشركات الخدمية والعقارات وغيرها، وبنفصّل الخطة على حسب نشاطك.', 4),
  ('إزاي أتابع الشغل؟', 'هتوصلك تقارير دورية واضحة بالأرقام، وهيكون معاك تواصل مباشر مع فريقك على واتساب.', 5);
