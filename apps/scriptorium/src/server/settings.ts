// src/server/settings.ts — settings テーブル読み取り（技術計画v1 §3.1）
//
// D1Database はグローバル型（@cloudflare/workers-types。tsconfig.server.json の
// compilerOptions.types で取り込み）を型注釈のみで参照する。フェイクも同形の
// prepare().bind().first() を持つため本番/テストで同じ関数が通る。

/**
 * settings テーブルから単一の key に対応する value を取得する。
 * 行が無ければ null。
 */
export async function getSetting(
  db: D1Database,
  key: string,
): Promise<string | null> {
  const row = await db
    .prepare("SELECT value FROM settings WHERE key = ?")
    .bind(key)
    .first<{ value: string }>();
  return row ? row.value : null;
}

/** moderation_mode: "approval" 明示時のみ承認制、それ以外（auto・null）は自動公開。 */
export async function getModerationMode(
  db: D1Database,
): Promise<"auto" | "approval"> {
  const value = await getSetting(db, "moderation_mode");
  return value === "approval" ? "approval" : "auto";
}

/** nsfw_screening: "on" 明示時のみ有効、それ以外（off・null）は無効。 */
export async function getNsfwScreening(db: D1Database): Promise<"on" | "off"> {
  const value = await getSetting(db, "nsfw_screening");
  return value === "on" ? "on" : "off";
}

/** 数値系 settings（daily_post_limit・hourly_global_limit・report_threshold 等）。 */
export async function getNumericSetting(
  db: D1Database,
  key: string,
  fallback: number,
): Promise<number> {
  const value = await getSetting(db, key);
  if (value === null) {
    return fallback;
  }
  const parsed = Number.parseInt(value, 10);
  return Number.isNaN(parsed) ? fallback : parsed;
}
