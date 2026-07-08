// @vitest-environment node
// src/server/worker.test.ts — `_worker.js` エントリのディスパッチ unit test（技術計画v1 §4.1/§4.2/§4.3/§4.7）
//
// ASSETS/DB/BUCKET をスタブ注入し、3分岐（/api→Hono応答・/r/:id→recipePage・
// それ以外→ASSETS素通し）のディスパッチを検証する。HTMLRewriter依存部
// （/r/:id の published 命中）は wrangler pages dev の結合確認で検証するため、
// ここでは pending（非命中）レシピで ASSETS 経由の分岐到達のみ確認する。

import { describe, expect, test, vi } from "vitest";
import worker from "./worker";
import { FakeD1Database, type FakeRecipeRow } from "../../tests/fakes/d1";
import { FakeR2Bucket } from "../../tests/fakes/r2";

const executionCtx = {
  waitUntil: vi.fn(),
  passThroughOnException: vi.fn(),
} as unknown as ExecutionContext;

const pendingRow: FakeRecipeRow = {
  id: "scr_seed_pending",
  status: "pending",
  handle: "newcomer",
  title: "Pending Review Miniature",
  lang: "en",
  schema_version: 1,
  recipe_json: "{}",
  cover_key: null,
  thumb_key: null,
  delete_pw_hash: "hash",
  report_count: 0,
  ip_hash: "iphash",
  created_at: "2026-07-07T00:00:00.000Z",
  published_at: null,
  deleted_at: null,
};

function makeEnv() {
  const assetsFetch = vi.fn(async (input: Request | string | URL) => {
    const url = input instanceof Request ? input.url : input.toString();
    return new Response(`asset:${new URL(url).pathname}`, {
      status: 200,
      headers: { "Content-Type": "text/html; charset=utf-8" },
    });
  });
  return {
    DB: new FakeD1Database([pendingRow]) as unknown as D1Database,
    BUCKET: new FakeR2Bucket() as unknown as R2Bucket,
    TURNSTILE_SECRET: "test-secret",
    IP_HASH_SECRET: "test-ip-secret",
    ASSETS: { fetch: assetsFetch },
  };
}

describe("_worker.js ディスパッチ", () => {
  test("/api/* は Hono アプリへ委譲される", async () => {
    const env = makeEnv();
    const request = new Request("https://scriptorium.example/api/recipes");

    const response = await worker.fetch(request, env, executionCtx);

    expect(response.status).toBe(200);
    expect(env.ASSETS.fetch).not.toHaveBeenCalled();
    const body = (await response.json()) as { items: unknown[] };
    expect(Array.isArray(body.items)).toBe(true);
  });

  test("GET /r/:id は recipePage ハンドラへ委譲される（非命中はASSETS経由で素通し）", async () => {
    const env = makeEnv();
    const request = new Request(
      "https://scriptorium.example/r/scr_seed_pending",
    );

    const response = await worker.fetch(request, env, executionCtx);

    expect(env.ASSETS.fetch).toHaveBeenCalledTimes(1);
    expect(await response.text()).toBe("asset:/");
    expect(response.headers.get("Content-Security-Policy")).not.toBeNull();
  });

  test("それ以外（/terms 等）は ASSETS.fetch へそのまま委譲され、CSPヘッダーが付与される", async () => {
    const env = makeEnv();
    const request = new Request("https://scriptorium.example/terms");

    const response = await worker.fetch(request, env, executionCtx);

    expect(env.ASSETS.fetch).toHaveBeenCalledTimes(1);
    expect(response.status).toBe(200);
    expect(await response.text()).toBe("asset:/terms");
    expect(response.headers.get("X-Content-Type-Options")).toBe("nosniff");
    expect(response.headers.get("Content-Security-Policy")).not.toBeNull();
  });

  test("POST /r/:id は recipePage 側にマッチせず ASSETS.fetch へ落ちる（メソッド保存）", async () => {
    const env = makeEnv();
    const request = new Request(
      "https://scriptorium.example/r/scr_seed_pending",
      { method: "POST" },
    );

    const response = await worker.fetch(request, env, executionCtx);

    expect(env.ASSETS.fetch).toHaveBeenCalledTimes(1);
    expect(await response.text()).toBe("asset:/r/scr_seed_pending");
    // request がそのまま渡ること（メソッドの伝搬）を検証する
    const passed = vi.mocked(env.ASSETS.fetch).mock.calls[0][0];
    expect(passed instanceof Request && passed.method).toBe("POST");
  });

  test("不正エンコードの /r/%ZZ は URIError にせず素のindexへ縮退する（500経路なし）", async () => {
    const env = makeEnv();
    // %ZZ は不正なパーセントシーケンス（URLパースは素通しし decodeURIComponent が throw する）
    const request = new Request("https://scriptorium.example/r/%ZZ");

    const response = await worker.fetch(request, env, executionCtx);

    expect(response.status).toBe(200);
    expect(await response.text()).toBe("asset:/");
  });
});
