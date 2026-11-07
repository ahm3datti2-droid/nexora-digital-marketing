-- Content update: contact info, real package prices (no video), professional icons
UPDATE settings SET value = '01117543009' WHERE key = 'phone';
UPDATE settings SET value = '201117543009' WHERE key = 'whatsapp';
UPDATE settings SET value = 'https://www.facebook.com/share/1JZskHPDox/' WHERE key = 'facebook';
UPDATE settings SET value = 'تسويق رقمي احترافي يحوّل متابعينك لعملاء' WHERE key = 'hero_title';
UPDATE settings SET value = 'إدارة سوشيال ميديا، تصميمات احترافية وإعلانات ممولة مدروسة — بباقات شهرية واضحة تبدأ من 3,500 ج.م.' WHERE key = 'hero_subtitle';

UPDATE packages SET name = 'الباقة الأساسية', price = '3,500', period = 'شهريًا', featured = 0, sort_order = 1,
  description = 'بداية احترافية لحضورك على السوشيال ميديا.',
  features = 'إدارة صفحة فيسبوك وإنستجرام
12 تصميم بوست احترافي شهريًا
كتابة المحتوى والكابشن
الرد على الرسائل والتعليقات
تقرير أداء شهري' WHERE id = 1;
UPDATE packages SET name = 'الباقة الاحترافية', price = '5,000', period = 'شهريًا', featured = 1, sort_order = 2,
  description = 'الأنسب للمشاريع اللي عايزة تبيع أكتر.',
  features = 'كل مميزات الباقة الأساسية
20 تصميم بوست احترافي شهريًا
خطة محتوى شهرية
إدارة إعلانات فيسبوك وإنستجرام الممولة
تقرير أداء كل أسبوعين' WHERE id = 2;
UPDATE packages SET name = 'باقة بريميوم', price = '8,000', period = 'شهريًا', featured = 0, sort_order = 3,
  description = 'حل تسويقي متكامل للشركات والبراندات.',
  features = 'كل مميزات الباقة الاحترافية
30 تصميم بوست احترافي شهريًا
إعلانات على Meta وGoogle وTikTok
قوالب تصميم بهوية البراند
متابعة يومية ومدير حساب مخصّص' WHERE id = 3;

UPDATE services SET icon = 'social' WHERE id = 1;
UPDATE services SET icon = 'ads' WHERE id = 2;
UPDATE services SET icon = 'brand' WHERE id = 3;
UPDATE services SET icon = 'web' WHERE id = 4;
UPDATE services SET icon = 'seo' WHERE id = 5;
UPDATE services SET icon = 'content', title = 'كتابة المحتوى',
  description = 'محتوى مكتوب بيحكي قصة علامتك ويقنع جمهورك ويحوّله لعملاء.',
  features = 'كتابة إعلانية مقنعة
كابشن وبوستات السوشيال
محتوى صفحات الموقع
مقالات ومدونات' WHERE id = 6;

INSERT INTO faqs (question, answer, sort_order) VALUES
  ('إيه الفرق بين الباقات؟', 'الفرق في عدد التصميمات الشهرية والمنصات الإعلانية ومستوى المتابعة: الأساسية 3,500 ج.م، الاحترافية 5,000 ج.م، وبريميوم 8,000 ج.م شهريًا.', 0),
  ('الباقات فيها فيديوهات؟', 'الباقات بتشمل التصميمات والمحتوى المكتوب وإدارة الصفحات والإعلانات، ومش بتشمل إنتاج فيديو.', 6);
