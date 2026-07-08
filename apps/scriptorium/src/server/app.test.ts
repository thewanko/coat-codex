// @vitest-environment node
// src/server/app.test.ts — Hono app の unit test（技術計画v1 §4.7）
//
// D1/R2 は tests/fakes の in-memory フェイクを注入する。vitest node 環境には
// `caches` グローバルが無いため、キャッシュなし経路（実際のハンドラロジック）を検証する。

import { describe, expect, test } from "vitest";
import app, { isAllowedImageKey } from "./app";
import { FakeD1Database, type FakeRecipeRow } from "../../tests/fakes/d1";
import { FakeR2Bucket } from "../../tests/fakes/r2";

const NOW = new Date("2026-07-07T12:00:00.000Z");
const isoMinusMinutes = (min: number) =>
  new Date(NOW.getTime() - min * 60_000).toISOString();

const TIE_PUBLISHED_AT = isoMinusMinutes(60 * 24 * 2);

function makeRow(overrides: Partial<FakeRecipeRow>): FakeRecipeRow {
  return {
    id: "scr_seed_x",
    status: "published",
    handle: "handle",
    title: "Title",
    lang: "en",
    schema_version: 1,
    recipe_json: JSON.stringify({
      scriptoriumSchemaVersion: 1,
      title: "Title",
      palette: [],
      tools: [],
      baseSteps: [],
      parts: [],
    }),
    cover_key: null,
    thumb_key: null,
    delete_pw_hash: "pbkdf2-sha256$100000$salt$hash",
    report_count: 0,
    ip_hash: "0".repeat(64),
    created_at: isoMinusMinutes(60 * 24 * 3),
    published_at: isoMinusMinutes(60 * 24 * 3),
    deleted_at: null,
    ...overrides,
  };
}

function seedRows(): FakeRecipeRow[] {
  return [
    makeRow({
      id: "scr_seed_wolf",
      handle: "wolfpainter",
      lang: "ja",
      title: "Timber Wolf Fur Study",
      status: "published",
      published_at: isoMinusMinutes(60 * 24 * 1),
      created_at: isoMinusMinutes(60 * 24 * 1),
      cover_key: "covers/scr_seed_wolf.webp",
      thumb_key: "thumbs/scr_seed_wolf.webp",
      recipe_json: JSON.stringify({
        scriptoriumSchemaVersion: 1,
        title: "Timber Wolf Fur Study",
        palette: [],
        tools: [],
        baseSteps: [],
        parts: [],
      }),
    }),
    makeRow({
      id: "scr_seed_plain",
      handle: "plainminis",
      lang: "en",
      title: "Plain Base Grey Test Mini",
      status: "published",
      published_at: TIE_PUBLISHED_AT,
      created_at: TIE_PUBLISHED_AT,
    }),
    makeRow({
      id: "scr_seed_grand",
      handle: "legionbuilder",
      lang: "en",
      title: "Grand Multi-Part Legion",
      status: "published",
      published_at: TIE_PUBLISHED_AT,
      created_at: TIE_PUBLISHED_AT,
    }),
    makeRow({
      id: "scr_seed_pending",
      handle: "newcomer",
      lang: "en",
      title: "Pending Review Miniature",
      status: "pending",
      published_at: null,
      created_at: isoMinusMinutes(30),
    }),
    makeRow({
      id: "scr_seed_flagged",
      handle: "reportedartist",
      lang: "en",
      title: "Flagged Content Sample",
      status: "flagged",
      published_at: isoMinusMinutes(60 * 24 * 5),
      created_at: isoMinusMinutes(60 * 24 * 5),
      report_count: 3,
    }),
  ];
}

function makeEnv() {
  const rows = seedRows();
  const bucket = new FakeR2Bucket();
  bucket.put("covers/scr_seed_wolf.webp", new Uint8Array([1, 2, 3]), {
    httpMetadata: { contentType: "image/webp" },
  });
  bucket.put("thumbs/scr_seed_wolf.webp", new Uint8Array([4, 5, 6]), {
    httpMetadata: { contentType: "image/webp" },
  });
  bucket.put("covers/scr_seed_jpeg.jpg", new Uint8Array([7, 8, 9]), {
    httpMetadata: { contentType: "image/jpeg" },
  });
  return {
    DB: new FakeD1Database(rows) as unknown as D1Database,
    BUCKET: bucket as unknown as R2Bucket,
  };
}

describe("GET /api/recipes", () => {
  test("published 3件のみ・wolf先頭・pending/flagged不在", async () => {
    const env = makeEnv();
    const res = await app.request("/api/recipes", {}, env);
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      items: { id: string; thumbUrl: string | null }[];
      nextCursor: string | null;
    };
    expect(body.items).toHaveLength(3);
    expect(body.items[0].id).toBe("scr_seed_wolf");
    expect(body.items[0].thumbUrl).toBe("/img/thumbs/scr_seed_wolf.webp");
    const ids = body.items.map((i) => i.id);
    expect(ids).not.toContain("scr_seed_pending");
    expect(ids).not.toContain("scr_seed_flagged");
  });

  test("keyset: limit=2 で nextCursor が返り、次ページで残り1件（重複・欠落なし）", async () => {
    const env = makeEnv();
    const page1 = await app.request("/api/recipes?limit=2", {}, env);
    expect(page1.status).toBe(200);
    const body1 = (await page1.json()) as {
      items: { id: string }[];
      nextCursor: string | null;
    };
    expect(body1.items).toHaveLength(2);
    expect(body1.nextCursor).not.toBeNull();

    const page2 = await app.request(
      `/api/recipes?limit=2&cursor=${encodeURIComponent(body1.nextCursor as string)}`,
      {},
      env,
    );
    expect(page2.status).toBe(200);
    const body2 = (await page2.json()) as {
      items: { id: string }[];
      nextCursor: string | null;
    };
    expect(body2.items).toHaveLength(1);
    expect(body2.nextCursor).toBeNull();

    const allIds = [...body1.items, ...body2.items].map((i) => i.id);
    expect(new Set(allIds).size).toBe(3);
    // id DESC: "scr_seed_plain" > "scr_seed_grand"（文字列比較。'p' > 'g'）
    expect(allIds).toEqual([
      "scr_seed_wolf",
      "scr_seed_plain",
      "scr_seed_grand",
    ]);
  });

  test("published_at同時刻タイの2件がid DESCで安定順序（重複・欠落なし）", async () => {
    const env = makeEnv();
    const res = await app.request("/api/recipes", {}, env);
    const body = (await res.json()) as { items: { id: string }[] };
    const tieIds = body.items
      .map((i) => i.id)
      .filter((id) => id === "scr_seed_plain" || id === "scr_seed_grand");
    // id DESC: "scr_seed_plain" > "scr_seed_grand"（文字列比較。'p' > 'g'）
    expect(tieIds).toEqual(["scr_seed_plain", "scr_seed_grand"]);
  });

  test("limit境界: 51は50へclamp（応答は3件のためitems件数では検証できず200のみ確認）", async () => {
    const env = makeEnv();
    const res = await app.request("/api/recipes?limit=51", {}, env);
    expect(res.status).toBe(200);
  });

  test("limit境界: 0/負/非数は既定(20)へフォールバック", async () => {
    const env = makeEnv();
    for (const limit of ["0", "-1", "abc"]) {
      const res = await app.request(`/api/recipes?limit=${limit}`, {}, env);
      expect(res.status).toBe(200);
      const body = (await res.json()) as { items: unknown[] };
      expect(body.items).toHaveLength(3);
    }
  });

  test("不正cursorは400", async () => {
    const env = makeEnv();
    const res = await app.request(
      "/api/recipes?cursor=not-valid-base64!!",
      {},
      env,
    );
    expect(res.status).toBe(400);
  });

  test("cursorの形式は正しいがpublished_at/idを含まない場合も400", async () => {
    const env = makeEnv();
    // "\n"（decodeCursorのセパレータ）を含まないbase64url文字列
    const badCursor = btoa("no-separator-here")
      .replace(/\+/g, "-")
      .replace(/\//g, "_")
      .replace(/=+$/, "");
    const res = await app.request(`/api/recipes?cursor=${badCursor}`, {}, env);
    expect(res.status).toBe(400);
  });
});

describe("GET /api/recipes/:id", () => {
  test("wolf は200・envelope構造（coverUrl/thumbUrl/recipe）", async () => {
    const env = makeEnv();
    const res = await app.request("/api/recipes/scr_seed_wolf", {}, env);
    expect(res.status).toBe(200);
    expect(res.headers.get("Access-Control-Allow-Origin")).toBe(
      "https://coat-codex.com",
    );
    const body = (await res.json()) as {
      id: string;
      handle: string;
      lang: string;
      publishedAt: string;
      coverUrl: string | null;
      thumbUrl: string | null;
      recipe: { title: string };
    };
    expect(body.id).toBe("scr_seed_wolf");
    expect(body.handle).toBe("wolfpainter");
    expect(body.coverUrl).toBe("/img/covers/scr_seed_wolf.webp");
    expect(body.thumbUrl).toBe("/img/thumbs/scr_seed_wolf.webp");
    expect(body.recipe.title).toBe("Timber Wolf Fur Study");
  });

  test.each(["scr_seed_pending", "scr_seed_flagged", "scr_seed_nonexistent"])(
    "%s は404",
    async (id) => {
      const env = makeEnv();
      const res = await app.request(`/api/recipes/${id}`, {}, env);
      expect(res.status).toBe(404);
    },
  );
});

describe("GET /img/:key", () => {
  test("covers/配下は200・Content-Type/Cache-Control/nosniffヘッダ", async () => {
    const env = makeEnv();
    const res = await app.request("/img/covers/scr_seed_wolf.webp", {}, env);
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toBe("image/webp");
    expect(res.headers.get("Cache-Control")).toBe(
      "public, max-age=31536000, immutable",
    );
    expect(res.headers.get("X-Content-Type-Options")).toBe("nosniff");
    expect(res.headers.get("Access-Control-Allow-Origin")).toBe(
      "https://coat-codex.com",
    );
  });

  test("thumbs/配下は200", async () => {
    const env = makeEnv();
    const res = await app.request("/img/thumbs/scr_seed_wolf.webp", {}, env);
    expect(res.status).toBe(200);
  });

  test("jpeg保存オブジェクトの配信はContent-Type: image/jpegを返す", async () => {
    const env = makeEnv();
    const res = await app.request("/img/covers/scr_seed_jpeg.jpg", {}, env);
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toBe("image/jpeg");
  });

  test("許可外プレフィックス secrets/x.webp は404", async () => {
    const env = makeEnv();
    const res = await app.request("/img/secrets/x.webp", {}, env);
    expect(res.status).toBe(404);
  });

  test("パストラバーサル covers/../x.webp は404", async () => {
    const env = makeEnv();
    const res = await app.request("/img/covers/../x.webp", {}, env);
    expect(res.status).toBe(404);
  });

  // app.request()経由はWHATWG URL正規化が `..` を折り畳むため、`..` 拒否分岐は
  // 関数直接呼び出しでのみ検証できる（上のテストは「covers/前置きなしキーの404」を見ている）
  test("isAllowedImageKey: `..` 含みキーは正規化を経ずとも拒否される", () => {
    expect(isAllowedImageKey("covers/../secrets/x.webp")).toBe(false);
    expect(isAllowedImageKey("thumbs/..")).toBe(false);
    expect(isAllowedImageKey("covers/ok.webp")).toBe(true);
    expect(isAllowedImageKey("thumbs/ok.webp")).toBe(true);
    expect(isAllowedImageKey("coversX/ok.webp")).toBe(false);
  });

  test("R2に無いキー（許可プレフィックスだが不存在）は404", async () => {
    const env = makeEnv();
    const res = await app.request("/img/covers/does-not-exist.webp", {}, env);
    expect(res.status).toBe(404);
  });
});
