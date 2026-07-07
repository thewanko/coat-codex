// src/server/app.ts — Hono アプリ本体（技術計画v1 §4.1/§4.2/§4.3）
//
// Bindings型はS3（本タスク）で使う分のみを宣言する（DB・BUCKET）。
// `functions/[[path]].ts` は `hono/cloudflare-pages` の `handle(app)` を呼ぶだけの薄いアダプタにする。

import { Hono } from "hono";
import type { Context } from "hono";
import { listFeed, getRecipeDetail } from "./routes/feed";
import { matchCache, putCache } from "./cache";
import type { Bindings } from "./bindings";

export type { Bindings } from "./bindings";

const CORS_ORIGIN = "https://coat-codex.com";
const FEED_CACHE_TTL_SECONDS = 60;
const IMG_CACHE_CONTROL = "public, max-age=31536000, immutable";

const ALLOWED_IMG_PREFIXES = ["covers/", "thumbs/"];

const app = new Hono<{ Bindings: Bindings }>();

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
        "Content-Type": "image/webp",
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

export default app;
