// src/server/routes/report.ts — POST /api/recipes/:id/report ハンドラ（技術計画v1 §4.2/§3.1）
//
// 処理順（deleteRecipe.tsと同型）:
//   body parse → Turnstile(fail-closed) → rate limit(report: 存在確認より前でid列挙抑止)
//   → フェッチ(published/flagged以外は一律404で存在秘匿) → INSERT OR IGNORE reports
//   （UNIQUE(recipe_id, ip_hash)で同一IP多重通報は黙って無視）→ distinct IP数カウント
//   → report_count同期 → 閾値到達時のみ status='flagged'（冪等・レース安全な条件付きUPDATE）
//   → 実際に遷移が起きたときのみ R2 cover/thumb を best-effort 削除（§8-11・S7 adminで
//   ステータス復帰は可能だが画像は戻らないトレードオフをユーザー裁定済み）→ notify を
//   best-effort 発火 → 200応答（flagged有無は漏らさない）

import type { Context } from "hono";
import type { Bindings } from "../bindings";
import {
  checkAndIncrementRateLimit,
  dailyPeriod,
  pruneOldRateLimits,
} from "../guards/rateLimit";
import { getNumericSetting } from "../settings";
import { hashIp } from "./postRecipe";
import type { ModerationEvent } from "../moderation/events";

const REPORT_DAILY_LIMIT = 10;
const DETAIL_MAX = 1000;
const VALID_REASONS = ["spam", "nsfw", "copyright", "other"] as const;
type ReportReason = (typeof VALID_REASONS)[number];

export interface ReportDeps {
  now: () => Date;
  verifyTurnstile: (
    token: string,
    secret: string,
    ip: string | null,
  ) => Promise<boolean>;
  notify?: (event: ModerationEvent) => Promise<void>;
}

interface ReportPayload {
  reason?: unknown;
  detail?: unknown;
  turnstileToken?: unknown;
}

interface ReportFetchRow {
  status: string;
  report_count: number;
  cover_key: string | null;
  thumb_key: string | null;
}

function isValidReason(value: unknown): value is ReportReason {
  return (
    typeof value === "string" &&
    (VALID_REASONS as readonly string[]).includes(value)
  );
}

function jsonError(
  c: Context<{ Bindings: Bindings }>,
  status: 400 | 403 | 404 | 429,
  error: string,
): Response {
  // 通報APIはscriptorium同一オリジンのUIからのみ呼ばれるためCORSヘッダは付けない
  // （postRecipe/deleteRecipeのCORSはcodexオリジン用で本APIには不要）。
  return c.json({ error }, status);
}

export async function handleReportRecipe(
  c: Context<{ Bindings: Bindings }>,
  deps: ReportDeps,
): Promise<Response> {
  const recipeId = c.req.param("id");
  if (!recipeId) {
    return jsonError(c, 404, "not found");
  }

  // 1. body parse
  let payload: ReportPayload;
  try {
    payload = (await c.req.json()) as ReportPayload;
  } catch {
    return jsonError(c, 400, "invalid payload json");
  }
  const { reason, detail, turnstileToken } = payload;

  if (!isValidReason(reason)) {
    return jsonError(c, 400, "invalid reason");
  }
  let normalizedDetail: string | null = null;
  if (detail !== undefined && detail !== null) {
    if (typeof detail !== "string") {
      return jsonError(c, 400, "invalid detail");
    }
    const trimmed = detail.trim();
    if (trimmed.length > DETAIL_MAX) {
      return jsonError(c, 400, "detail too long");
    }
    normalizedDetail = trimmed.length > 0 ? trimmed : null;
  }
  if (typeof turnstileToken !== "string" || turnstileToken.length < 1) {
    return jsonError(c, 400, "missing turnstileToken");
  }

  // 2. Turnstile（fail-closed）
  const ip = c.req.header("CF-Connecting-IP") ?? null;
  const turnstileOk = await deps.verifyTurnstile(
    turnstileToken,
    c.env.TURNSTILE_SECRET,
    ip,
  );
  if (!turnstileOk) {
    return jsonError(c, 403, "turnstile verification failed");
  }

  // 3. rate limit（存在確認より前＝id列挙抑止・deleteRecipe.tsと同型）
  const ipHash = await hashIp(ip ?? "unknown", c.env.IP_HASH_SECRET);
  const nowIso = deps.now().toISOString();
  await pruneOldRateLimits(c.env.DB, dailyPeriod(nowIso));
  const rateResult = await checkAndIncrementRateLimit(
    c.env.DB,
    "report:" + ipHash,
    dailyPeriod(nowIso),
    REPORT_DAILY_LIMIT,
  );
  if (!rateResult.allowed) {
    return jsonError(c, 429, "rate limit exceeded");
  }

  // 4. フェッチ（published/flagged以外は一律404で存在秘匿）
  const row = await c.env.DB.prepare(
    "SELECT status, report_count, cover_key, thumb_key FROM recipes WHERE id = ?",
  )
    .bind(recipeId)
    .first<ReportFetchRow>();
  if (!row || (row.status !== "published" && row.status !== "flagged")) {
    return jsonError(c, 404, "not found");
  }

  // 5. INSERT OR IGNORE（UNIQUE(recipe_id, ip_hash)により同一IP多重通報は黙って無視）
  await c.env.DB.prepare(
    "INSERT OR IGNORE INTO reports (recipe_id, reason, detail, ip_hash, created_at) VALUES (?, ?, ?, ?, ?)",
  )
    .bind(recipeId, reason, normalizedDetail, ipHash, nowIso)
    .run();

  // 6. distinct IP数カウント（UNIQUE制約により行数=distinct IP数）
  const countRow = await c.env.DB.prepare(
    "SELECT COUNT(*) AS cnt FROM reports WHERE recipe_id = ?",
  )
    .bind(recipeId)
    .first<{ cnt: number }>();
  const cnt = countRow?.cnt ?? 0;

  // 7. report_count同期（非正規化列）
  // 注: このUPDATEと直後の8.のUPDATEは非トランザクション（D1は単文コミット）。
  // 中間状態（report_count更新後・flagged未遷移）が観測される可能性はあるが、
  // report_countは次回通報時にCOUNT再計算で自己修復し、flagged遷移は条件付き
  // UPDATE（WHERE status='published'）で冪等なため許容する。
  // まとめて原子化するならD1のbatch()を使う。
  await c.env.DB.prepare("UPDATE recipes SET report_count = ? WHERE id = ?")
    .bind(cnt, recipeId)
    .run();

  // 8. 閾値到達時のみ flagged へ遷移（条件付きUPDATE＝冪等・レース安全）
  const threshold = await getNumericSetting(c.env.DB, "report_threshold", 3);
  if (cnt >= threshold) {
    const updateResult = await c.env.DB.prepare(
      "UPDATE recipes SET status = 'flagged' WHERE id = ? AND status = 'published'",
    )
      .bind(recipeId)
      .run();
    if (updateResult.meta?.changes && updateResult.meta.changes > 0) {
      // 実際に行が変わった（=このリクエストで遷移が起きた）ときのみ R2 削除（best-effort）。
      // §8-11: flagged はS7 adminで復帰可能だが画像は戻らないトレードオフをユーザー裁定済み。
      try {
        if (row.cover_key) {
          await c.env.BUCKET.delete(row.cover_key);
        }
        if (row.thumb_key) {
          await c.env.BUCKET.delete(row.thumb_key);
        }
      } catch {
        console.warn(
          "R2 object deletion failed (best-effort); orphan retained",
        );
      }

      // 実際に行が変わった（=このリクエストで遷移が起きた）ときのみ通知（best-effort）
      try {
        await deps.notify?.({
          type: "flagged",
          recipeId,
          reportCount: cnt,
        });
      } catch {
        console.warn("moderation notify failed (best-effort)");
      }
    }
  }

  // 9. 200応答（flagged遷移の有無は応答で漏らさない）
  return c.json({ ok: true }, 200);
}
