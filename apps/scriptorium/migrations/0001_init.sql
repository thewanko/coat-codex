-- 0001_init.sql — D1初期スキーマ（技術計画v1 §3.1 SQL全文を逐語で反映）

CREATE TABLE recipes (
  id             TEXT PRIMARY KEY,                 -- 'scr_' + UUID
  status         TEXT NOT NULL DEFAULT 'published'
                 CHECK (status IN ('published','pending','flagged','deleted')),
  handle         TEXT NOT NULL,                    -- 自己申告ハンドル
  title          TEXT NOT NULL,                    -- 一覧表示用に非正規化
  lang           TEXT,                             -- 'en'|'ja'|NULL（表示ヒント）
  schema_version INTEGER NOT NULL DEFAULT 1,       -- scriptoriumSchemaVersion
  recipe_json    TEXT NOT NULL,                    -- PublishedRecipe 丸ごと（平均 ~10KB）
  cover_key      TEXT,                             -- R2: covers/<id>.webp
  thumb_key      TEXT,                             -- R2: thumbs/<id>.webp
  delete_pw_hash TEXT NOT NULL,                    -- 'pbkdf2-sha256$<iter>$<saltB64>$<hashB64>'
  report_count   INTEGER NOT NULL DEFAULT 0,
  ip_hash        TEXT NOT NULL,                    -- HMAC-SHA256(ip, IP_HASH_SECRET)
  created_at     TEXT NOT NULL,
  published_at   TEXT,                             -- pending 中は NULL
  deleted_at     TEXT
);
CREATE INDEX idx_recipes_feed ON recipes(status, published_at DESC); -- 一覧 keyset
CREATE INDEX idx_recipes_ip   ON recipes(ip_hash);                   -- abuse 追跡

CREATE TABLE reports (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  recipe_id  TEXT NOT NULL REFERENCES recipes(id),
  reason     TEXT NOT NULL CHECK (reason IN ('spam','nsfw','copyright','other')),
  detail     TEXT,
  ip_hash    TEXT NOT NULL,
  created_at TEXT NOT NULL,
  UNIQUE (recipe_id, ip_hash)                       -- 同一IPの多重通報を無効化
);
CREATE INDEX idx_reports_recipe ON reports(recipe_id);

CREATE TABLE settings ( key TEXT PRIMARY KEY, value TEXT NOT NULL );
-- 初期値: moderation_mode='auto' | circuit_breaker='closed' | report_threshold='3'
--        daily_post_limit='5' | hourly_global_limit='30' | nsfw_screening='off'

CREATE TABLE rate_limits (
  bucket TEXT NOT NULL,   -- 'post:<ip_hash>' | 'report:<ip_hash>' | 'del:<ip_hash>:<recipeId>' | 'global-post'
  period TEXT NOT NULL,   -- '2026-07-06'（日次）| '2026-07-06T14'（時間次: global）
  count  INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (bucket, period)
);

INSERT OR IGNORE INTO settings (key, value) VALUES ('moderation_mode', 'auto');
INSERT OR IGNORE INTO settings (key, value) VALUES ('circuit_breaker', 'closed');
INSERT OR IGNORE INTO settings (key, value) VALUES ('report_threshold', '3');
INSERT OR IGNORE INTO settings (key, value) VALUES ('daily_post_limit', '5');
INSERT OR IGNORE INTO settings (key, value) VALUES ('hourly_global_limit', '30');
INSERT OR IGNORE INTO settings (key, value) VALUES ('nsfw_screening', 'off');
