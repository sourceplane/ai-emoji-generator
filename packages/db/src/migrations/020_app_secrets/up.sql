-- The site's API secret, generated once per database and never typed: it
-- signs the short-lived tokens the generate form carries for the rate limit
-- (src/server/secrets.ts reads it; an API_SECRET Worker secret wins). The
-- template asked its owner to generate one by hand. INSERT OR IGNORE, so a
-- re-run never rotates it.
-- Owner: app
CREATE TABLE IF NOT EXISTS app_secrets (name TEXT PRIMARY KEY, value TEXT NOT NULL);
INSERT OR IGNORE INTO app_secrets (name, value) VALUES ('api', lower(hex(randomblob(32))));
