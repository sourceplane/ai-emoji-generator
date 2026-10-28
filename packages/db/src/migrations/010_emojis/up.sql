-- The emojis: the template's Emoji model (prisma/schema.prisma — MySQL on
-- PlanetScale) on D1's SQLite. Times are ISO 8601 text, booleans 0/1; the
-- image columns hold the site's own paths (/api/images/<key>) into the R2
-- bucket, where the template kept Vercel Blob URLs.
-- Owner: app
CREATE TABLE IF NOT EXISTS emojis (
  id TEXT PRIMARY KEY,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  prompt TEXT NOT NULL,
  is_flagged INTEGER NOT NULL DEFAULT 0,
  is_featured INTEGER NOT NULL DEFAULT 0,
  original_url TEXT,
  no_background_url TEXT,
  safety_rating INTEGER NOT NULL,
  error TEXT
);
-- The template's @@index([isFlagged, originalUrl, noBackgroundUrl]), and the
-- order the grid and the sitemap read in.
CREATE INDEX IF NOT EXISTS emojis_valid_idx ON emojis (is_flagged, original_url, no_background_url);
CREATE INDEX IF NOT EXISTS emojis_created_at_idx ON emojis (created_at);
-- The template's @@fulltext([prompt]): a full-text index of the prompts that
-- the "related emojis" grid ranks by (bm25). The app writes a row beside each
-- emoji it creates (src/server/emojis.ts); a prompt never changes.
CREATE VIRTUAL TABLE IF NOT EXISTS emojis_fts USING fts5(id UNINDEXED, prompt);
