// src/server/routes/admin.ts — /api/admin/* 管理APIハンドラ（技術計画v1 §4.2/§7 S7/ST-31）
//
// 認証: Cloudflare Access が edge で本認証を行う前提。Worker 側は
// `Cf-Access-Jwt-Assertion` ヘッダの存在のみを見る defense-in-depth 検証
// （JWKS 署名検証は不要・Access が既に検証済み）。app.ts 側で
// `app.use("/api/admin/*", ...)` として全 admin ルート一律に適用する。
//
// 承認/復帰/削除の一覧・詳細キャッシュ反映は TTL 失効に委ねる（§4.5）。
// feed/detail の GET キャッシュは短命TTL（60秒）のため、admin操作後の
// キャッシュ無効化コードは不要。

import type { Context } from "hono";
import type { Bindings } from "../bindings";

export interface AdminDeps {
  now: () => Date;
}

const RECIPE_STATUSES = ["published", "pending", "flagged", "deleted"] as const;
type RecipeStatus = (typeof RECIPE_STATUSES)[number];

const ENUM_SETTINGS: Record<string, readonly string[]> = {
  moderation_mode: ["auto", "approval"],
  circuit_breaker: ["closed", "open"],
  nsfw_screening: ["on", "off"],
};

const NUMERIC_SETTINGS = new Set([
  "report_threshold",
  "daily_post_limit",
  "hourly_global_limit",
]);

/**
 * `Cf-Access-Jwt-Assertion` ヘッダの存在（非空文字列）のみを検証する
 * defense-in-depth ガード。本認証は Cloudflare Access が edge で行う。
 * `ACCESS_DEV_BYPASS === "on"` はローカル `.dev.vars` 専用のバイパス
 * （本番Pagesの環境変数には絶対に設定しない）。
 */
export function isAuthorizedAdminRequest(req: Request, env: Bindings): boolean {
  if (env.ACCESS_DEV_BYPASS === "on") {
    return true;
  }
  const jwt = req.headers.get("Cf-Access-Jwt-Assertion");
  return typeof jwt === "string" && jwt.length > 0;
}

function jsonError(
  c: Context<{ Bindings: Bindings }>,
  status: 400 | 401 | 404 | 409,
  error: string,
): Response {
  return c.json({ error }, status);
}

interface AdminRecipeListRow {
  id: string;
  status: string;
  handle: string;
  title: string;
  lang: string | null;
  report_count: number;
  created_at: string;
  published_at: string | null;
  deleted_at: string | null;
  cover_key: string | null;
  thumb_key: string | null;
}

/** GET /api/admin/recipes?status=<s> */
export async function handleAdminListRecipes(
  c: Context<{ Bindings: Bindings }>,
): Promise<Response> {
  const status = c.req.query("status");
  if (!status || !RECIPE_STATUSES.includes(status as RecipeStatus)) {
    return jsonError(c, 400, "invalid status");
  }

  const { results } = await c.env.DB.prepare(
    "SELECT id, status, handle, title, lang, report_count, created_at, published_at, deleted_at, cover_key, thumb_key " +
      "FROM recipes WHERE status = ? ORDER BY created_at DESC LIMIT 100",
  )
    .bind(status)
    .all<AdminRecipeListRow>();

  return c.json({ recipes: results }, 200);
}

/** GET /api/admin/recipes/:id */
export async function handleAdminGetRecipe(
  c: Context<{ Bindings: Bindings }>,
): Promise<Response> {
  const id = c.req.param("id");
  // delete_pw_hash（PBKDF2ハッシュ）と ip_hash（PII）は admin UI に用途がなく
  // 応答へ含めない（データ最小化・review R1 M1）。
  const row = await c.env.DB.prepare(
    "SELECT id, status, handle, title, lang, schema_version, recipe_json, cover_key, thumb_key, report_count, created_at, published_at, deleted_at " +
      "FROM recipes WHERE id = ?",
  )
    .bind(id)
    .first();
  if (!row) {
    return jsonError(c, 404, "not found");
  }
  return c.json(row, 200);
}

/** POST /api/admin/recipes/:id/approve — pending → published */
export async function handleAdminApproveRecipe(
  c: Context<{ Bindings: Bindings }>,
  deps: AdminDeps,
): Promise<Response> {
  const id = c.req.param("id");
  const nowIso = deps.now().toISOString();

  const { meta } = await c.env.DB.prepare(
    "UPDATE recipes SET status = 'published', published_at = ? WHERE id = ? AND status = 'pending'",
  )
    .bind(nowIso, id)
    .run();

  if (meta.changes === 0) {
    return jsonError(c, 409, "not pending");
  }
  return c.json({ id, status: "published" }, 200);
}

/**
 * POST /api/admin/recipes/:id/restore — flagged → published
 * ST-38 で flagged 化時に R2 cover/thumb は削除済みのため、復帰後は
 * cover_key/thumb_key が空のまま published へ戻る（仕様 §8-11）。
 */
export async function handleAdminRestoreRecipe(
  c: Context<{ Bindings: Bindings }>,
  deps: AdminDeps,
): Promise<Response> {
  const id = c.req.param("id");
  const nowIso = deps.now().toISOString();

  const { meta } = await c.env.DB.prepare(
    "UPDATE recipes SET status = 'published', published_at = COALESCE(published_at, ?) WHERE id = ? AND status = 'flagged'",
  )
    .bind(nowIso, id)
    .run();

  if (meta.changes === 0) {
    return jsonError(c, 409, "not flagged");
  }
  return c.json({ id, status: "published" }, 200);
}

interface AdminDeleteFetchRow {
  status: string;
  cover_key: string | null;
  thumb_key: string | null;
}

/** POST /api/admin/recipes/:id/delete — 任意status → deleted（R2 cover/thumb同時削除・best-effort） */
export async function handleAdminDeleteRecipe(
  c: Context<{ Bindings: Bindings }>,
  deps: AdminDeps,
): Promise<Response> {
  const id = c.req.param("id");

  const row = await c.env.DB.prepare(
    "SELECT status, cover_key, thumb_key FROM recipes WHERE id = ?",
  )
    .bind(id)
    .first<AdminDeleteFetchRow>();

  if (!row || row.status === "deleted") {
    return jsonError(c, 404, "not found");
  }

  const nowIso = deps.now().toISOString();
  const { meta } = await c.env.DB.prepare(
    "UPDATE recipes SET status = 'deleted', deleted_at = ? WHERE id = ? AND status != 'deleted'",
  )
    .bind(nowIso, id)
    .run();

  if (meta.changes > 0) {
    try {
      if (row.cover_key) {
        await c.env.BUCKET.delete(row.cover_key);
      }
      if (row.thumb_key) {
        await c.env.BUCKET.delete(row.thumb_key);
      }
    } catch {
      console.warn("R2 object deletion failed (best-effort); orphan retained");
    }
  }

  return c.json({ id, status: "deleted" }, 200);
}

/** GET /api/admin/settings */
export async function handleAdminGetSettings(
  c: Context<{ Bindings: Bindings }>,
): Promise<Response> {
  const { results } = await c.env.DB.prepare(
    "SELECT key, value FROM settings",
  ).all<{ key: string; value: string }>();

  const settings: Record<string, string> = {};
  for (const row of results) {
    settings[row.key] = row.value;
  }
  return c.json({ settings }, 200);
}

interface PutSettingsPayload {
  key?: unknown;
  value?: unknown;
}

/** value が key の allowlist（enum/数値）に適合するか検証する。 */
function isValidSettingValue(key: string, value: string): boolean {
  const enumValues = ENUM_SETTINGS[key];
  if (enumValues) {
    return enumValues.includes(value);
  }
  if (NUMERIC_SETTINGS.has(key)) {
    if (!/^\d+$/.test(value)) {
      return false;
    }
    const parsed = Number.parseInt(value, 10);
    return parsed >= 1 && parsed <= 10000;
  }
  return false;
}

/** PUT /api/admin/settings — body {key, value}（allowlist検証） */
export async function handleAdminPutSettings(
  c: Context<{ Bindings: Bindings }>,
): Promise<Response> {
  let payload: PutSettingsPayload;
  try {
    payload = (await c.req.json()) as PutSettingsPayload;
  } catch {
    return jsonError(c, 400, "invalid payload json");
  }

  const { key, value } = payload;
  if (typeof key !== "string" || typeof value !== "string") {
    return jsonError(c, 400, "invalid key or value");
  }
  if (!isValidSettingValue(key, value)) {
    return jsonError(c, 400, "invalid key or value");
  }

  // 数値設定は "05" 等の先頭ゼロを正規化して保存する（消費側の文字列比較との不整合防止・review R1 L2）
  const normalized = NUMERIC_SETTINGS.has(key)
    ? String(Number.parseInt(value, 10))
    : value;

  await c.env.DB.prepare(
    "INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value",
  )
    .bind(key, normalized)
    .run();

  return c.json({ key, value: normalized }, 200);
}
