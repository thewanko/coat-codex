// src/server/routes/deleteRecipe.ts — DELETE /api/recipes/:id ハンドラ（技術計画v1 §4.2/§3.1/§4.5）
//
// 本人削除: {deletePassword} を PBKDF2 で照合（定数時間比較）→ status='deleted'・
// deleted_at 更新 → R2 cover/thumb 削除（best-effort）。
// 処理順:
//   body parse → rate limit(del: 存在確認より前でPWブルートフォース抑止) → フェッチ
//   → PBKDF2照合 → D1更新 → R2削除 → 200応答
// 削除反映のキャッシュ無効化は不要（§4.5・TTL失効に委ねる）。

import type { Context } from "hono";
import type { Bindings } from "../bindings";
import { verifyDeletePassword } from "../auth/password";
import {
  checkAndIncrementRateLimit,
  dailyPeriod,
  pruneOldRateLimits,
} from "../guards/rateLimit";
import { hashIp } from "./postRecipe";

const CORS_ORIGIN = "https://coat-codex.com";
const DEL_DAILY_LIMIT = 5;

export interface DeleteRecipeDeps {
  now: () => Date;
}

interface DeleteRecipePayload {
  deletePassword?: unknown;
}

interface DeleteRecipeRow {
  id: string;
  status: string;
  delete_pw_hash: string;
  cover_key: string | null;
  thumb_key: string | null;
}

function corsHeaders(): Record<string, string> {
  return { "Access-Control-Allow-Origin": CORS_ORIGIN };
}

function jsonError(
  c: Context<{ Bindings: Bindings }>,
  status: 400 | 403 | 404 | 429,
  error: string,
): Response {
  return c.json({ error }, status, corsHeaders());
}

export async function handleDeleteRecipe(
  c: Context<{ Bindings: Bindings }>,
  deps: DeleteRecipeDeps,
): Promise<Response> {
  const recipeId = c.req.param("id");

  // 1. body parse
  let payload: DeleteRecipePayload;
  try {
    payload = (await c.req.json()) as DeleteRecipePayload;
  } catch {
    return jsonError(c, 400, "invalid payload json");
  }
  const { deletePassword } = payload;
  if (typeof deletePassword !== "string" || deletePassword.length < 1) {
    return jsonError(c, 400, "invalid deletePassword");
  }

  // 2. ip/時刻
  const ip = c.req.header("CF-Connecting-IP") ?? "unknown";
  const ipHash = await hashIp(ip, c.env.IP_HASH_SECRET);
  const nowIso = deps.now().toISOString();

  // 3. rate limit（PW照合ブルートフォース抑止・存在確認より前）
  await pruneOldRateLimits(c.env.DB, dailyPeriod(nowIso));
  const rateResult = await checkAndIncrementRateLimit(
    c.env.DB,
    "del:" + ipHash + ":" + recipeId,
    dailyPeriod(nowIso),
    DEL_DAILY_LIMIT,
  );
  if (!rateResult.allowed) {
    return jsonError(c, 429, "rate limit exceeded");
  }

  // 4. フェッチ
  const row = await c.env.DB.prepare(
    "SELECT id, status, delete_pw_hash, cover_key, thumb_key FROM recipes WHERE id = ?",
  )
    .bind(recipeId)
    .first<DeleteRecipeRow>();
  if (!row || row.status === "deleted") {
    return jsonError(c, 404, "not found");
  }

  // 5. PBKDF2 照合
  const passwordOk = await verifyDeletePassword(
    deletePassword,
    row.delete_pw_hash,
  );
  if (!passwordOk) {
    return jsonError(c, 403, "incorrect password");
  }

  // 6. D1 更新
  await c.env.DB.prepare(
    "UPDATE recipes SET status = 'deleted', deleted_at = ? WHERE id = ?",
  )
    .bind(nowIso, recipeId)
    .run();

  // 7. R2 削除（best-effort。失敗しても孤児は許容＝削除の本体は D1 更新で達成済み・id不可推測）
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

  // 8. 200 応答
  return c.json({ id: recipeId, status: "deleted" }, 200, corsHeaders());
}
