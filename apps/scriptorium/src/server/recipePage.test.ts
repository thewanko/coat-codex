// @vitest-environment node
// src/server/recipePage.test.ts — handleRecipePage の unit test（技術計画v1 §4.2/§4.6/§4.7）
//
// HTMLRewriter を使う injectOgp 呼び出し自体は Workers ランタイムグローバル依存のため
// ここでは検証しない（wrangler pages dev の結合確認で検証する。ogp.test.ts と同じ流儀）。
// 「D1参照〜行判定〜メタ組み立て（injectOgp直前まで）」は resolveOgpMeta を直接呼んで
// 検証し、handleRecipePage 側では ASSETS.fetch のスタブ注入で「非命中→素通し」
// 「D1例外→素通し」の分岐（published命中はHTMLRewriter依存のため対象外）を検証する。

import { describe, expect, test, vi } from "vitest";
import {
  extractRecipeId,
  handleRecipePage,
  resolveOgpMeta,
} from "./recipePage";
import { FakeD1Database, type FakeRecipeRow } from "../../tests/fakes/d1";

function makeAssetsStub(html = "<html><head></head><body>root</body></html>") {
  return {
    fetch: vi.fn(async () => new Response(html, { status: 200 })),
  };
}

const baseRow: FakeRecipeRow = {
  id: "scr_seed_wolf",
  status: "published",
  handle: "wolfpainter",
  title: "Timber Wolf Fur Study",
  lang: "en",
  schema_version: 1,
  recipe_json: "{}",
  cover_key: "covers/scr_seed_wolf.webp",
  thumb_key: "thumbs/scr_seed_wolf.webp",
  delete_pw_hash: "hash",
  report_count: 0,
  ip_hash: "iphash",
  created_at: "2026-07-01T00:00:00.000Z",
  published_at: "2026-07-01T00:00:00.000Z",
  deleted_at: null,
};

describe("extractRecipeId", () => {
  test("/r/:id からidを抽出する", () => {
    expect(extractRecipeId("/r/scr_seed_wolf")).toBe("scr_seed_wolf");
  });

  test("末尾スラッシュも許容する", () => {
    expect(extractRecipeId("/r/scr_seed_wolf/")).toBe("scr_seed_wolf");
  });

  test("マッチしないパスはnull", () => {
    expect(extractRecipeId("/")).toBeNull();
    expect(extractRecipeId("/terms")).toBeNull();
    expect(extractRecipeId("/r/")).toBeNull();
    expect(extractRecipeId("/r/a/b")).toBeNull();
  });
});

describe("resolveOgpMeta", () => {
  test("published レシピ命中: D1を参照しOGPメタタグ配列を返す（injectOgp直前まで到達）", async () => {
    const db = new FakeD1Database([baseRow]);

    const tags = await resolveOgpMeta(
      "scr_seed_wolf",
      { DB: db as unknown as D1Database },
      "https://scriptorium.example",
    );

    expect(tags).not.toBeNull();
    const byKey = (key: string) => tags!.find((t) => t.key === key);
    expect(byKey("og:title")?.content).toBe(
      "Timber Wolf Fur Study | Coat Scriptorium",
    );
    expect(byKey("og:image")?.content).toBe(
      "https://scriptorium.example/img/covers/scr_seed_wolf.webp",
    );
  });

  test("非published（pending）: null を返す", async () => {
    const pendingRow: FakeRecipeRow = { ...baseRow, status: "pending" };
    const db = new FakeD1Database([pendingRow]);

    const tags = await resolveOgpMeta(
      "scr_seed_wolf",
      { DB: db as unknown as D1Database },
      "https://scriptorium.example",
    );

    expect(tags).toBeNull();
  });

  test("D1例外: null を返す（500にしない）", async () => {
    const throwingDb = {
      prepare: () => {
        throw new Error("D1 unavailable");
      },
    };

    const tags = await resolveOgpMeta(
      "scr_seed_wolf",
      { DB: throwingDb as unknown as D1Database },
      "https://scriptorium.example",
    );

    expect(tags).toBeNull();
  });
});

describe("handleRecipePage", () => {
  test("非published（idなし）: ASSETS.fetch の結果をそのまま返す", async () => {
    const db = new FakeD1Database([baseRow]);
    const assets = makeAssetsStub();
    const request = new Request("https://scriptorium.example/r/");

    const response = await handleRecipePage(request, {
      DB: db as unknown as D1Database,
      BUCKET: {} as R2Bucket,
      TURNSTILE_SECRET: "test-secret",
      IP_HASH_SECRET: "test-ip-secret",
      ASSETS: assets,
    });

    expect(assets.fetch).toHaveBeenCalledTimes(1);
    expect(await response.text()).toBe(
      "<html><head></head><body>root</body></html>",
    );
  });

  test("非命中（pending等）: D1を参照した上で素のindex.htmlを返す", async () => {
    const pendingRow: FakeRecipeRow = { ...baseRow, status: "pending" };
    const db = new FakeD1Database([pendingRow]);
    const assets = makeAssetsStub();
    const request = new Request("https://scriptorium.example/r/scr_seed_wolf");

    const response = await handleRecipePage(request, {
      DB: db as unknown as D1Database,
      BUCKET: {} as R2Bucket,
      TURNSTILE_SECRET: "test-secret",
      IP_HASH_SECRET: "test-ip-secret",
      ASSETS: assets,
    });

    expect(await response.text()).toBe(
      "<html><head></head><body>root</body></html>",
    );
  });

  test("D1例外: 素のindex.htmlへ縮退する（500にしない）", async () => {
    const throwingDb = {
      prepare: () => {
        throw new Error("D1 unavailable");
      },
    };
    const assets = makeAssetsStub();
    const request = new Request("https://scriptorium.example/r/scr_seed_wolf");

    const response = await handleRecipePage(request, {
      DB: throwingDb as unknown as D1Database,
      BUCKET: {} as R2Bucket,
      TURNSTILE_SECRET: "test-secret",
      IP_HASH_SECRET: "test-ip-secret",
      ASSETS: assets,
    });

    expect(response.status).toBe(200);
    expect(await response.text()).toBe(
      "<html><head></head><body>root</body></html>",
    );
  });
});
