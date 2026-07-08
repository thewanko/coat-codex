// src/server/app.ts — Hono アプリ本体（技術計画v1 §4.1/§4.2/§4.3）
//
// Bindings型はS3（本タスク）で使う分のみを宣言する（DB・BUCKET）。
// `functions/[[path]].ts` は `hono/cloudflare-pages` の `handle(app)` を呼ぶだけの薄いアダプタにする。

import { Hono } from "hono";
import type { Context } from "hono";
import { listFeed, getRecipeDetail } from "./routes/feed";
import { handlePostRecipe } from "./routes/postRecipe";
import { handleDeleteRecipe } from "./routes/deleteRecipe";
import { handleReportRecipe } from "./routes/report";
import {
  isAuthorizedAdminRequest,
  handleAdminListRecipes,
  handleAdminGetRecipe,
  handleAdminApproveRecipe,
  handleAdminRestoreRecipe,
  handleAdminDeleteRecipe,
  handleAdminGetSettings,
  handleAdminPutSettings,
} from "./routes/admin";
import { verifyTurnstile } from "./guards/turnstile";
import { createScreenImage } from "./moderation/screenImage";
import { createNotifier } from "./moderation/notifier";
import type { ModerationEvent } from "./moderation/events";
import { matchCache, putCache } from "./cache";
import type { Bindings } from "./bindings";

export type { Bindings } from "./bindings";

const CORS_ORIGIN = "https://coat-codex.com";
const FEED_CACHE_TTL_SECONDS = 60;
const IMG_CACHE_CONTROL = "public, max-age=31536000, immutable";

const ALLOWED_IMG_PREFIXES = ["covers/", "thumbs/"];

const app = new Hono<{ Bindings: Bindings }>();

/**
 * MAIL_API_KEY・NOTIFY_EMAIL_TO が揃っている環境（本番）でのみ notify 関数を生成する。
 * 未設定環境（ローカル test 等）では undefined を返し、呼び出し元ハンドラの
 * best-effort 分岐（notify 未注入時は何もしない）に委ねる（既存挙動不変）。
 * postRecipe（circuitOpen通知・ST-28）と report（flagged通知・ST-27）で共用する。
 */
function buildNotify(
  env: Bindings,
): ((event: ModerationEvent) => Promise<void>) | undefined {
  return env.MAIL_API_KEY && env.NOTIFY_EMAIL_TO
    ? createNotifier({
        fetch: globalThis.fetch.bind(globalThis),
        apiKey: env.MAIL_API_KEY,
        to: env.NOTIFY_EMAIL_TO,
        from: env.NOTIFY_EMAIL_FROM ?? "onboarding@resend.dev",
      })
    : undefined;
}

app.get("/api/recipes", async (c) => {
  const cached = await matchCache(c.req.raw);
  if (cached) return cached;

  const response = await listFeed(c);
  // エラー応答（400等）はキャッシュしない（cursor値ごとの枠消費・状態遷移の残留を避ける）
  if (response.status === 200) {
    await putCache(c.req.raw, response.clone(), FEED_CACHE_TTL_SECONDS);
  }
  return response;
});

app.get("/api/recipes/:id", async (c) => {
  const cached = await matchCache(c.req.raw);
  if (cached) return cached;

  const response = await getRecipeDetail(c);
  // 404をキャッシュすると pending→published 承認直後のレシピが最大60s 404残留するため200のみ
  if (response.status === 200) {
    await putCache(c.req.raw, response.clone(), FEED_CACHE_TTL_SECONDS);
  }
  return response;
});

app.post("/api/recipes", (c) =>
  handlePostRecipe(c, {
    verifyTurnstile: (token, secret, ip) =>
      verifyTurnstile(token, secret, ip, {
        fetch: globalThis.fetch.bind(globalThis),
      }),
    now: () => new Date(),
    randomId: () => "scr_" + crypto.randomUUID(),
    // AI バインディング未設定の環境（ローカル test 等）では undefined のままにし、
    // postRecipe.ts 側の fail-open 分岐（screening on かつフック未注入）に委ねる。
    screenImage: c.env.AI ? createScreenImage(c.env.AI) : undefined,
    notify: buildNotify(c.env),
  }),
);

app.delete("/api/recipes/:id", (c) =>
  handleDeleteRecipe(c, { now: () => new Date() }),
);

app.post("/api/recipes/:id/report", (c) =>
  handleReportRecipe(c, {
    verifyTurnstile: (token, secret, ip) =>
      verifyTurnstile(token, secret, ip, {
        fetch: globalThis.fetch.bind(globalThis),
      }),
    now: () => new Date(),
    notify: buildNotify(c.env),
  }),
);

app.use("/api/admin/*", async (c, next) => {
  if (!isAuthorizedAdminRequest(c.req.raw, c.env)) {
    return c.json({ error: "unauthorized" }, 401);
  }
  await next();
});

app.get("/api/admin/recipes", (c) => handleAdminListRecipes(c));
app.get("/api/admin/recipes/:id", (c) => handleAdminGetRecipe(c));
app.post("/api/admin/recipes/:id/approve", (c) =>
  handleAdminApproveRecipe(c, { now: () => new Date() }),
);
app.post("/api/admin/recipes/:id/restore", (c) =>
  handleAdminRestoreRecipe(c, { now: () => new Date() }),
);
app.post("/api/admin/recipes/:id/delete", (c) =>
  handleAdminDeleteRecipe(c, { now: () => new Date() }),
);
app.get("/api/admin/settings", (c) => handleAdminGetSettings(c));
app.put("/api/admin/settings", (c) => handleAdminPutSettings(c));

app.get(
  "/img/:key{.+}",
  async (c: Context<{ Bindings: Bindings }, "/img/:key">) => {
    const key = c.req.param("key");

    if (!isAllowedImageKey(key)) {
      return c.json({ error: "not found" }, 404);
    }

    const cached = await matchCache(c.req.raw);
    if (cached) return cached;

    const object = await c.env.BUCKET.get(key);
    if (!object) {
      return c.json({ error: "not found" }, 404);
    }

    const body = await object.arrayBuffer();
    const response = new Response(body, {
      status: 200,
      headers: {
        "Content-Type": resolveImageContentType(key, object.httpMetadata),
        "Cache-Control": IMG_CACHE_CONTROL,
        "X-Content-Type-Options": "nosniff",
        "Access-Control-Allow-Origin": CORS_ORIGIN,
      },
    });

    await putCache(c.req.raw, response.clone(), 31536000);
    return response;
  },
);

/** キーは `covers/`・`thumbs/` プレフィックスのみ許可。`..` を含むキーやそれ以外のプレフィックスは拒否する。 */
export function isAllowedImageKey(key: string): boolean {
  if (key.includes("..")) return false;
  return ALLOWED_IMG_PREFIXES.some((prefix) => key.startsWith(prefix));
}

/**
 * 配信レスポンスの Content-Type を決定する。R2 保存時の httpMetadata を優先し、
 * 無い場合はキー拡張子から推定する（JPEG/WebP 両受理・§4.4/§4.7）。
 */
export function resolveImageContentType(
  key: string,
  httpMetadata?: { contentType?: string },
): string {
  if (httpMetadata?.contentType) return httpMetadata.contentType;
  const lowerKey = key.toLowerCase();
  if (lowerKey.endsWith(".jpg") || lowerKey.endsWith(".jpeg")) {
    return "image/jpeg";
  }
  return "image/webp";
}

export default app;
