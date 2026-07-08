// src/server/routes/postRecipe.ts — POST /api/recipes ハンドラ（技術計画v1 §4.2/§4.4/§3.1/§3.2/§2.3）
//
// ガード順は §4.2 に厳密対応:
//   Content-Length粗チェック → multipart parse → payload JSON parse → Turnstile
//   → circuit breaker → rate limit(post/global) → envelope検証 → strict zod
//   → 画像ヘッダ検査(cover/thumb・JPEG/WebP両受理) → NSFWフック → PBKDF2
//   → id/時刻/status決定 → R2 put → D1 insert → 201応答
// cover/thumb は任意（photoless 公開レシピが存在するため、両方欠落しても投稿は成立する）。
// iOS/デスクトップSafariは canvas.toBlob("image/webp") 非対応でPNGにフォールバックするため
// クライアントはJPEGを送ることがある。JPEG/WebP双方を受理する（§4.4）。

import type { Context } from "hono";
import type { Bindings } from "../bindings";
import { hashDeletePassword } from "../auth/password";
import { parseImageHeader, imageFormatMeta } from "../images/imageHeader";
import {
  checkAndIncrementRateLimit,
  dailyPeriod,
  hourlyPeriod,
  pruneOldRateLimits,
} from "../guards/rateLimit";
import { isCircuitOpen, openCircuitIfClosed } from "../guards/circuitBreaker";
import {
  getModerationMode,
  getNsfwScreening,
  getNumericSetting,
} from "../settings";
import {
  publishedRecipeStrictSchema,
  SCRIPTORIUM_SCHEMA_VERSION,
} from "@coat-codex/recipe-core";
import type { ModerationEvent } from "../moderation/events";

const PUBLIC_BASE_URL = "https://scriptorium.coat-codex.com";
const CORS_ORIGIN = "https://coat-codex.com";
const COARSE_MAX_BYTES = 640 * 1024;
const COVER_MAX_BYTES = 450 * 1024;
const COVER_MAX_EDGE = 1600;
const THUMB_MAX_BYTES = 80 * 1024;
const THUMB_MAX_EDGE = 400;
const HANDLE_MAX = 40;
const DELETE_PW_MIN = 8;

export interface PostRecipeDeps {
  verifyTurnstile: (
    token: string,
    secret: string,
    ip: string | null,
  ) => Promise<boolean>;
  screenImage?: (
    bytes: Uint8Array,
  ) => Promise<{ verdict: "pass" | "flag" | "unavailable" }>;
  now: () => Date;
  randomId: () => string; // 'scr_' + UUID 形式の完全な id を返す
  notify?: (event: ModerationEvent) => Promise<void>;
}

interface PostRecipePayload {
  handle?: unknown;
  lang?: unknown;
  recipe?: unknown;
  deletePassword?: unknown;
  turnstileToken?: unknown;
}

function corsHeaders(): Record<string, string> {
  return { "Access-Control-Allow-Origin": CORS_ORIGIN };
}

function jsonError(
  c: Context<{ Bindings: Bindings }>,
  status: 400 | 403 | 413 | 422 | 429 | 503,
  error: string,
): Response {
  return c.json({ error }, status, corsHeaders());
}

/** IP アドレスを HMAC-SHA256 でハッシュ化し hex 文字列にする（生 IP は保存しない）。 */
export async function hashIp(ip: string, secret: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign(
    "HMAC",
    key,
    new TextEncoder().encode(ip),
  );
  return Array.from(new Uint8Array(signature))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

export async function handlePostRecipe(
  c: Context<{ Bindings: Bindings }>,
  deps: PostRecipeDeps,
): Promise<Response> {
  // 1. Content-Length 粗チェック（parse前に合計上限超過を拒否。§4.4 二段検査の一段目）
  const contentLength = Number(c.req.header("content-length"));
  if (Number.isFinite(contentLength) && contentLength > COARSE_MAX_BYTES) {
    return jsonError(c, 413, "payload too large");
  }

  // 2. multipart parse
  let body: Awaited<ReturnType<typeof c.req.parseBody>>;
  try {
    body = await c.req.parseBody();
  } catch {
    return jsonError(c, 400, "invalid multipart body");
  }
  const rawPayload = body.payload;
  if (typeof rawPayload !== "string") {
    return jsonError(c, 400, "missing payload");
  }
  const cover = body.cover instanceof File ? body.cover : undefined;
  const thumb = body.thumb instanceof File ? body.thumb : undefined;

  // 3. payload JSON parse
  let payload: PostRecipePayload;
  try {
    payload = JSON.parse(rawPayload) as PostRecipePayload;
  } catch {
    return jsonError(c, 400, "invalid payload json");
  }
  const { handle, lang, recipe, deletePassword, turnstileToken } = payload;

  // 4. Turnstile
  const ip = c.req.header("CF-Connecting-IP") ?? null;
  const turnstileOk = await deps.verifyTurnstile(
    String(turnstileToken ?? ""),
    c.env.TURNSTILE_SECRET,
    ip,
  );
  if (!turnstileOk) {
    return jsonError(c, 403, "turnstile verification failed");
  }

  // 5. circuit breaker
  if (await isCircuitOpen(c.env.DB)) {
    return jsonError(c, 503, "posting temporarily disabled");
  }

  // 6. rate limit
  const nowIso = deps.now().toISOString();
  const ipHash = await hashIp(ip ?? "unknown", c.env.IP_HASH_SECRET);
  await pruneOldRateLimits(c.env.DB, dailyPeriod(nowIso));

  const limitPost = await getNumericSetting(c.env.DB, "daily_post_limit", 5);
  const postResult = await checkAndIncrementRateLimit(
    c.env.DB,
    "post:" + ipHash,
    dailyPeriod(nowIso),
    limitPost,
  );
  const limitGlobal = await getNumericSetting(
    c.env.DB,
    "hourly_global_limit",
    30,
  );
  const globalResult = await checkAndIncrementRateLimit(
    c.env.DB,
    "global-post",
    hourlyPeriod(nowIso),
    limitGlobal,
  );
  if (!postResult.allowed || !globalResult.allowed) {
    if (!globalResult.allowed) {
      // global-post バケット（全体レート）の超過のみサーキットを開放する対象。
      // per-IP日次超過（postResult）は個別IPの問題でありサーキット全体を開く理由にならない。
      const opened = await openCircuitIfClosed(c.env.DB);
      if (opened) {
        // 実際に closed→open の遷移が起きたときのみ通知（best-effort。応答は不変）
        try {
          await deps.notify?.({
            type: "circuitOpen",
            count: globalResult.count,
            period: hourlyPeriod(nowIso),
          });
        } catch {
          console.warn("moderation notify failed (best-effort)");
        }
      }
    }
    return jsonError(c, 429, "rate limit exceeded");
  }

  // 7. envelope 検証
  if (
    typeof handle !== "string" ||
    handle.length < 1 ||
    handle.length > HANDLE_MAX
  ) {
    return jsonError(c, 400, "invalid handle");
  }
  if (lang !== "en" && lang !== "ja" && lang !== null && lang !== undefined) {
    return jsonError(c, 400, "invalid lang");
  }
  const normalizedLang: "en" | "ja" | null =
    lang === "en" || lang === "ja" ? lang : null;
  if (
    typeof deletePassword !== "string" ||
    deletePassword.length < DELETE_PW_MIN
  ) {
    return jsonError(c, 400, "invalid deletePassword");
  }

  // 8. strict zod
  const parsed = publishedRecipeStrictSchema.safeParse(recipe);
  if (!parsed.success) {
    return jsonError(c, 400, "invalid recipe");
  }
  const validRecipe = parsed.data;

  // 9. 画像検査（cover/thumb が存在する場合のみ。任意添付＝photoless公開レシピが存在する）
  let coverBytes: Uint8Array | undefined;
  let coverFormat: "webp" | "jpeg" | undefined;
  if (cover) {
    coverBytes = new Uint8Array(await cover.arrayBuffer());
    const header = parseImageHeader(coverBytes);
    if (!header) {
      return jsonError(c, 400, "invalid cover image");
    }
    if (Math.max(header.width, header.height) > COVER_MAX_EDGE) {
      return jsonError(c, 400, "cover image too large (dimensions)");
    }
    if (coverBytes.length > COVER_MAX_BYTES) {
      return jsonError(c, 413, "cover image too large (bytes)");
    }
    coverFormat = header.format;
  }

  let thumbBytes: Uint8Array | undefined;
  let thumbFormat: "webp" | "jpeg" | undefined;
  if (thumb) {
    thumbBytes = new Uint8Array(await thumb.arrayBuffer());
    const header = parseImageHeader(thumbBytes);
    if (!header) {
      return jsonError(c, 400, "invalid thumb image");
    }
    if (Math.max(header.width, header.height) > THUMB_MAX_EDGE) {
      return jsonError(c, 400, "thumb image too large (dimensions)");
    }
    if (thumbBytes.length > THUMB_MAX_BYTES) {
      return jsonError(c, 413, "thumb image too large (bytes)");
    }
    thumbFormat = header.format;
  }

  // 10. NSFW フック（screening off または cover 無しはスキップ。unavailable は fail-open）
  const screening = await getNsfwScreening(c.env.DB);
  if (screening === "on" && deps.screenImage && coverBytes) {
    const { verdict } = await deps.screenImage(coverBytes);
    if (verdict === "flag") {
      return jsonError(c, 422, "image flagged by nsfw screening");
    }
    if (verdict === "unavailable") {
      console.warn("nsfw screening unavailable; fail-open");
    }
  }

  // 11. PBKDF2
  const pwHash = await hashDeletePassword(deletePassword);

  // 12. id/時刻/status
  const id = deps.randomId();
  const createdAt = nowIso;
  const mode = await getModerationMode(c.env.DB);
  const status = mode === "approval" ? "pending" : "published";
  const publishedAt = status === "published" ? nowIso : null;

  // 13. R2 put（cover/thumb ありのときのみ。拡張子/content-typeは検出したformatから導出）
  const coverKey =
    cover && coverFormat
      ? "covers/" + id + imageFormatMeta(coverFormat).ext
      : null;
  const thumbKey =
    thumb && thumbFormat
      ? "thumbs/" + id + imageFormatMeta(thumbFormat).ext
      : null;
  if (coverKey && coverBytes && coverFormat) {
    await c.env.BUCKET.put(coverKey, coverBytes, {
      httpMetadata: { contentType: imageFormatMeta(coverFormat).contentType },
    });
  }
  if (thumbKey && thumbBytes && thumbFormat) {
    await c.env.BUCKET.put(thumbKey, thumbBytes, {
      httpMetadata: { contentType: imageFormatMeta(thumbFormat).contentType },
    });
  }

  // 14. D1 insert（列は seed.mjs と一致・§3.1）
  await c.env.DB.prepare(
    "INSERT INTO recipes (id, status, handle, title, lang, schema_version, recipe_json, cover_key, thumb_key, delete_pw_hash, report_count, ip_hash, created_at, published_at, deleted_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
  )
    .bind(
      id,
      status,
      handle,
      validRecipe.title,
      normalizedLang,
      SCRIPTORIUM_SCHEMA_VERSION,
      JSON.stringify(validRecipe),
      coverKey,
      thumbKey,
      pwHash,
      0,
      ipHash,
      createdAt,
      publishedAt,
      null,
    )
    .run();

  // 15. 201 応答
  return c.json(
    { id, url: PUBLIC_BASE_URL + "/r/" + id, status },
    201,
    corsHeaders(),
  );
}
