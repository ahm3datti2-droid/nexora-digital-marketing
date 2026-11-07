-- Lead source (contact / audit / quiz) and the page link for free audits
ALTER TABLE leads ADD COLUMN source TEXT NOT NULL DEFAULT 'contact';
ALTER TABLE leads ADD COLUMN page_url TEXT NOT NULL DEFAULT '';
-- Case studies on portfolio items
ALTER TABLE portfolio ADD COLUMN challenge TEXT NOT NULL DEFAULT '';
ALTER TABLE portfolio ADD COLUMN solution TEXT NOT NULL DEFAULT '';
-- Uploaded media index (files live in R2 bucket nexora-media)
CREATE TABLE IF NOT EXISTS media (
  key          TEXT PRIMARY KEY,
  content_type TEXT NOT NULL,
  size         INTEGER NOT NULL,
  created_at   TEXT NOT NULL DEFAULT (datetime('now'))
);
