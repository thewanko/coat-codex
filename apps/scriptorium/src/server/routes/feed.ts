// src/server/routes/feed.ts — 公開一覧・詳細ハンドラ実体（技術計画v1 §4.2/§4.3）
//
// GET /api/recipes（keyset cursor）・GET /api/recipes/:id を Hono の Context 経由で処理する。
// D1 は Bindings.DB（本番）または tests/fakes/d1.ts の FakeD1Database（unit test）。

import type { Context } from "hono";
import type { Bindings } from "../bindings";

export interface FeedItem {
  id: string;
  title: string;
  handle: string;
  lang: string | null;
  publishedAt: string;
  thumbUrl: string | null;
}

export interface FeedResponse {
  items: FeedItem[];
  nextCursor: string | null;
}

interface RecipeRow {
  id: string;
  status: string;
  handle: string;
  title: string;
  lang: string | null;
  schema_version: number;
  recipe_json: string;
  cover_key: string | null;
  thumb_key: string | null;
  published_at: string | null;
}

const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 50;

/** limit クエリパラメータの解決。既定20・不正値（0以下・非数）は既定へフォールバック・51以上は50へclamp。 */
export function resolveLimit(rawLimit: string | undefined): number {
  if (rawLimit === undefined) return DEFAULT_LIMIT;
  const parsed = Number(rawLimit);
  if (!Number.isFinite(parsed) || !Number.isInteger(parsed) || parsed <= 0) {
    return DEFAULT_LIMIT;
  }
  return Math.min(parsed, MAX_LIMIT);
}

/** cursor = base64url(published_at + "\n" + id) のエンコード。 */
export function encodeCursor(publishedAt: string, id: string): string {
  const raw = `${publishedAt}\n${id}`;
  return base64UrlEncode(raw);
}

/** cursor のデコード。不正な形式は null を返す（呼び出し側で400にする）。 */
export function decodeCursor(
  cursor: string,
): { publishedAt: string; id: string } | null {
  let raw: string;
  try {
    raw = base64UrlDecode(cursor);
  } catch {
    return null;
  }
  const separatorIndex = raw.indexOf("\n");
  if (separatorIndex < 0) return null;
  const publishedAt = raw.slice(0, separatorIndex);
  const id = raw.slice(separatorIndex + 1);
  if (!publishedAt || !id) return null;
  return { publishedAt, id };
}

function base64UrlEncode(value: string): string {
  const base64 = btoa(unescape(encodeURIComponent(value)));
  return base64.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function base64UrlDecode(value: string): string {
  const padded = value.replace(/-/g, "+").replace(/_/g, "/");
  const pad =
    padded.length % 4 === 0 ? "" : "=".repeat(4 - (padded.length % 4));
  return decodeURIComponent(escape(atob(padded + pad)));
}

function thumbUrlFor(row: Pick<RecipeRow, "thumb_key">): string | null {
  return row.thumb_key ? `/img/${row.thumb_key}` : null;
}

/** GET /api/recipes — 応答本体を組み立てる（cursor不正時はこの関数自身が400を返す）。 */
export async function listFeed(
  c: Context<{ Bindings: Bindings }, "/api/recipes">,
): Promise<Response> {
  const rawLimit = c.req.query("limit");
  const limit = resolveLimit(rawLimit);

  const rawCursor = c.req.query("cursor");
  let cursorValue: { publishedAt: string; id: string } | null = null;
  if (rawCursor) {
    cursorValue = decodeCursor(rawCursor);
    if (!cursorValue) {
      return c.json({ error: "invalid cursor" }, 400);
    }
  }

  const baseSql =
    "SELECT id, status, handle, title, lang, schema_version, recipe_json, cover_key, thumb_key, published_at FROM recipes WHERE status = 'published'";

  let rows: RecipeRow[];
  if (cursorValue) {
    const sql = `${baseSql} AND (published_at < ? OR (published_at = ? AND id < ?)) ORDER BY published_at DESC, id DESC LIMIT ?`;
    const stmt = c.env.DB.prepare(sql).bind(
      cursorValue.publishedAt,
      cursorValue.publishedAt,
      cursorValue.id,
      limit + 1,
    );
    const result = await stmt.all<RecipeRow>();
    rows = result.results;
  } else {
    const sql = `${baseSql} ORDER BY published_at DESC, id DESC LIMIT ?`;
    const stmt = c.env.DB.prepare(sql).bind(limit + 1);
    const result = await stmt.all<RecipeRow>();
    rows = result.results;
  }

  const hasMore = rows.length > limit;
  const pageRows = hasMore ? rows.slice(0, limit) : rows;

  const items: FeedItem[] = pageRows.map((row) => ({
    id: row.id,
    title: row.title,
    handle: row.handle,
    lang: row.lang,
    publishedAt: row.published_at as string,
    thumbUrl: thumbUrlFor(row),
  }));

  const lastRow = pageRows[pageRows.length - 1];
  const nextCursor =
    hasMore && lastRow
      ? encodeCursor(lastRow.published_at as string, lastRow.id)
      : null;

  const body: FeedResponse = { items, nextCursor };
  return c.json(body, 200);
}

/** GET /api/recipes/:id — published のみ200。pending/flagged/deleted/不存在は一律404（存在秘匿）。 */
export async function getRecipeDetail(
  c: Context<{ Bindings: Bindings }, "/api/recipes/:id">,
): Promise<Response> {
  const id = c.req.param("id");
  const sql =
    "SELECT id, status, handle, title, lang, schema_version, recipe_json, cover_key, thumb_key, published_at FROM recipes WHERE id = ? AND status = 'published'";
  const row = await c.env.DB.prepare(sql).bind(id).first<RecipeRow>();

  if (!row) {
    return c.json({ error: "not found" }, 404);
  }

  const body = {
    id: row.id,
    handle: row.handle,
    lang: row.lang,
    publishedAt: row.published_at,
    coverUrl: row.cover_key ? `/img/${row.cover_key}` : null,
    thumbUrl: thumbUrlFor(row),
    recipe: JSON.parse(row.recipe_json),
  };

  c.header("Access-Control-Allow-Origin", "https://coat-codex.com");
  return c.json(body, 200);
}
