// @vitest-environment node
// src/server/routes/deleteRecipe.test.ts — DELETE /api/recipes/:id 統合テスト（技術計画v1 §4.2/§3.1/§4.5）

import { describe, expect, test } from "vitest";
import { Hono } from "hono";
import type { Bindings } from "../bindings";
import { handleDeleteRecipe, type DeleteRecipeDeps } from "./deleteRecipe";
import { hashDeletePassword } from "../auth/password";
import app from "../app";
import { FakeD1Database, type FakeRecipeRow } from "../../../tests/fakes/d1";
import { FakeR2Bucket } from "../../../tests/fakes/r2";

const NOW = new Date("2026-07-08T09:00:00Z");
const CORRECT_PW = "correct-pw";

function makeRow(overrides: Partial<FakeRecipeRow> = {}): FakeRecipeRow {
  return {
    id: "scr_target",
    status: "published",
    handle: "painter",
    title: "T",
    lang: "en",
    schema_version: 1,
    recipe_json: "{}",
    cover_key: null,
    thumb_key: null,
    delete_pw_hash: "",
    report_count: 0,
    ip_hash: "hash",
    created_at: "2026-07-01T00:00:00Z",
    published_at: "2026-07-01T00:00:00Z",
    deleted_at: null,
    ...overrides,
  };
}

async function makeEnv(
  rows: FakeRecipeRow[],
  settings: Record<string, string> = {},
) {
  const settingsMap = new Map(Object.entries(settings));
  const db = new FakeD1Database(rows, settingsMap);
  const bucket = new FakeR2Bucket();
  return {
    DB: db as unknown as D1Database,
    BUCKET: bucket as unknown as R2Bucket,
    TURNSTILE_SECRET: "test-secret",
    IP_HASH_SECRET: "test-ip-secret",
  } satisfies Bindings;
}

function makeStubDeps(
  overrides: Partial<DeleteRecipeDeps> = {},
): DeleteRecipeDeps {
  return {
    now: () => NOW,
    ...overrides,
  };
}

function buildTestApp(deps: DeleteRecipeDeps) {
  return new Hono<{ Bindings: Bindings }>().delete("/api/recipes/:id", (c) =>
    handleDeleteRecipe(c, deps),
  );
}

function deleteRequest(deletePassword: unknown) {
  return {
    method: "DELETE" as const,
    body: JSON.stringify({ deletePassword }),
    headers: { "Content-Type": "application/json" },
  };
}

describe("DELETE /api/recipes/:id 正常系", () => {
  test("正しいPWで200・status=deleted・deleted_at非null・R2削除", async () => {
    const pwHash = await hashDeletePassword(CORRECT_PW);
    const row = makeRow({
      delete_pw_hash: pwHash,
      cover_key: "covers/scr_target.webp",
      thumb_key: "thumbs/scr_target.webp",
    });
    const env = await makeEnv([row]);
    const bucket = env.BUCKET as unknown as FakeR2Bucket;
    await bucket.put("covers/scr_target.webp", new Uint8Array([1, 2, 3]));
    await bucket.put("thumbs/scr_target.webp", new Uint8Array([4, 5, 6]));

    const testApp = buildTestApp(makeStubDeps());
    const res = await testApp.request(
      "/api/recipes/scr_target",
      deleteRequest(CORRECT_PW),
      env,
    );

    expect(res.status).toBe(200);
    const body = (await res.json()) as { id: string; status: string };
    expect(body).toEqual({ id: "scr_target", status: "deleted" });

    const db = env.DB as unknown as FakeD1Database;
    expect(db.rows[0].status).toBe("deleted");
    expect(db.rows[0].deleted_at).toBe(NOW.toISOString());

    expect(await bucket.get("covers/scr_target.webp")).toBeNull();
    expect(await bucket.get("thumbs/scr_target.webp")).toBeNull();
  });

  test("R2削除が失敗しても200・D1はstatus=deleted（best-effort）", async () => {
    const pwHash = await hashDeletePassword(CORRECT_PW);
    const row = makeRow({
      delete_pw_hash: pwHash,
      cover_key: "covers/scr_target.webp",
      thumb_key: "thumbs/scr_target.webp",
    });
    const env = await makeEnv([row]);
    const bucket = env.BUCKET as unknown as FakeR2Bucket;
    await bucket.put("covers/scr_target.webp", new Uint8Array([1, 2, 3]));
    await bucket.put("thumbs/scr_target.webp", new Uint8Array([4, 5, 6]));
    (bucket as unknown as { delete: () => Promise<void> }).delete =
      async () => {
        throw new Error("r2 down");
      };

    const testApp = buildTestApp(makeStubDeps());
    const res = await testApp.request(
      "/api/recipes/scr_target",
      deleteRequest(CORRECT_PW),
      env,
    );

    expect(res.status).toBe(200);
    const body = (await res.json()) as { id: string; status: string };
    expect(body).toEqual({ id: "scr_target", status: "deleted" });

    const db = env.DB as unknown as FakeD1Database;
    expect(db.rows[0].status).toBe("deleted");
  });

  test("cover/thumbなし行を正PWで削除→200・R2 delete呼ばずエラーなし", async () => {
    const pwHash = await hashDeletePassword(CORRECT_PW);
    const row = makeRow({ delete_pw_hash: pwHash });
    const env = await makeEnv([row]);

    const testApp = buildTestApp(makeStubDeps());
    const res = await testApp.request(
      "/api/recipes/scr_target",
      deleteRequest(CORRECT_PW),
      env,
    );

    expect(res.status).toBe(200);
    const db = env.DB as unknown as FakeD1Database;
    expect(db.rows[0].status).toBe("deleted");
  });
});

describe("DELETE /api/recipes/:id 失敗系", () => {
  test("誤PWで403・行のstatus不変・R2オブジェクト残存", async () => {
    const pwHash = await hashDeletePassword(CORRECT_PW);
    const row = makeRow({
      delete_pw_hash: pwHash,
      cover_key: "covers/scr_target.webp",
    });
    const env = await makeEnv([row]);
    const bucket = env.BUCKET as unknown as FakeR2Bucket;
    await bucket.put("covers/scr_target.webp", new Uint8Array([1, 2, 3]));

    const testApp = buildTestApp(makeStubDeps());
    const res = await testApp.request(
      "/api/recipes/scr_target",
      deleteRequest("wrong-pw"),
      env,
    );

    expect(res.status).toBe(403);
    const db = env.DB as unknown as FakeD1Database;
    expect(db.rows[0].status).toBe("published");
    expect(await bucket.get("covers/scr_target.webp")).not.toBeNull();
  });

  test("不存在idで404", async () => {
    const env = await makeEnv([]);
    const testApp = buildTestApp(makeStubDeps());
    const res = await testApp.request(
      "/api/recipes/nonexistent",
      deleteRequest(CORRECT_PW),
      env,
    );
    expect(res.status).toBe(404);
  });

  test("既にdeletedな行は404", async () => {
    const pwHash = await hashDeletePassword(CORRECT_PW);
    const row = makeRow({
      delete_pw_hash: pwHash,
      status: "deleted",
      deleted_at: "2026-07-02T00:00:00Z",
    });
    const env = await makeEnv([row]);
    const testApp = buildTestApp(makeStubDeps());
    const res = await testApp.request(
      "/api/recipes/scr_target",
      deleteRequest(CORRECT_PW),
      env,
    );
    expect(res.status).toBe(404);
  });

  test("rate limit: 同一ip+recipeIdで誤PW5回まで403・6回目429", async () => {
    const pwHash = await hashDeletePassword(CORRECT_PW);
    const row = makeRow({ delete_pw_hash: pwHash });
    const env = await makeEnv([row]);
    const testApp = buildTestApp(makeStubDeps());
    const headers = {
      "Content-Type": "application/json",
      "CF-Connecting-IP": "9.9.9.9",
    };

    for (let i = 0; i < 5; i += 1) {
      const res = await testApp.request(
        "/api/recipes/scr_target",
        {
          method: "DELETE",
          body: JSON.stringify({ deletePassword: "wrong-pw" }),
          headers,
        },
        env,
      );
      expect(res.status).toBe(403);
    }

    const res6 = await testApp.request(
      "/api/recipes/scr_target",
      {
        method: "DELETE",
        body: JSON.stringify({ deletePassword: "wrong-pw" }),
        headers,
      },
      env,
    );
    expect(res6.status).toBe(429);
  });

  test("body不正: JSONでない→400", async () => {
    const env = await makeEnv([]);
    const testApp = buildTestApp(makeStubDeps());
    const res = await testApp.request(
      "/api/recipes/scr_target",
      {
        method: "DELETE",
        body: "not-json{{{",
        headers: { "Content-Type": "application/json" },
      },
      env,
    );
    expect(res.status).toBe(400);
  });

  test("body不正: deletePassword欠落→400", async () => {
    const env = await makeEnv([]);
    const testApp = buildTestApp(makeStubDeps());
    const res = await testApp.request(
      "/api/recipes/scr_target",
      {
        method: "DELETE",
        body: JSON.stringify({}),
        headers: { "Content-Type": "application/json" },
      },
      env,
    );
    expect(res.status).toBe(400);
  });
});

describe("DELETE /api/recipes/:id CORS", () => {
  test("正常系レスポンスにACAOヘッダ", async () => {
    const pwHash = await hashDeletePassword(CORRECT_PW);
    const row = makeRow({ delete_pw_hash: pwHash });
    const env = await makeEnv([row]);
    const testApp = buildTestApp(makeStubDeps());
    const res = await testApp.request(
      "/api/recipes/scr_target",
      deleteRequest(CORRECT_PW),
      env,
    );
    expect(res.status).toBe(200);
    expect(res.headers.get("Access-Control-Allow-Origin")).toBe(
      "https://coat-codex.com",
    );
  });

  test("失敗系(403)レスポンスにもACAOヘッダ", async () => {
    const pwHash = await hashDeletePassword(CORRECT_PW);
    const row = makeRow({ delete_pw_hash: pwHash });
    const env = await makeEnv([row]);
    const testApp = buildTestApp(makeStubDeps());
    const res = await testApp.request(
      "/api/recipes/scr_target",
      deleteRequest("wrong-pw"),
      env,
    );
    expect(res.status).toBe(403);
    expect(res.headers.get("Access-Control-Allow-Origin")).toBe(
      "https://coat-codex.com",
    );
  });

  test("失敗系(404)レスポンスにもACAOヘッダ", async () => {
    const env = await makeEnv([]);
    const testApp = buildTestApp(makeStubDeps());
    const res = await testApp.request(
      "/api/recipes/nonexistent",
      deleteRequest(CORRECT_PW),
      env,
    );
    expect(res.status).toBe(404);
    expect(res.headers.get("Access-Control-Allow-Origin")).toBe(
      "https://coat-codex.com",
    );
  });

  test("失敗系(400)レスポンスにもACAOヘッダ", async () => {
    const env = await makeEnv([]);
    const testApp = buildTestApp(makeStubDeps());
    const res = await testApp.request(
      "/api/recipes/scr_target",
      {
        method: "DELETE",
        body: "not-json{{{",
        headers: { "Content-Type": "application/json" },
      },
      env,
    );
    expect(res.status).toBe(400);
    expect(res.headers.get("Access-Control-Allow-Origin")).toBe(
      "https://coat-codex.com",
    );
  });
});

describe("app.ts 結線確認", () => {
  test("本番appにDELETE /api/recipes/:idが結線され404を返す（route解決の確認）", async () => {
    const env = await makeEnv([]);
    const res = await app.request(
      "/api/recipes/nonexistent",
      deleteRequest("x"),
      env,
    );
    expect(res.status).toBe(404);
  });
});
