// lib/importFromScriptorium.test.ts — Scriptoriumインポートコアロジックのテスト
// （技術計画v1.3 §6-2/§7 ST-23）

import "fake-indexeddb/auto";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import {
  CURRENT_SCHEMA_VERSION,
  toPublishedRecipe,
  type PublishedRecipe,
  type RecipeDoc,
} from "@coat-codex/recipe-core";
import { db } from "../db/db";
import type { ImportResult } from "./importRecipe";
import {
  SCRIPTORIUM_ORIGIN,
  buildScriptoriumPageUrl,
  fetchCoverAsDataUrl,
  fetchPublishedDetail,
  findRecipeByScriptoriumId,
  parseImportUrl,
  runScriptoriumImport,
  type ScriptoriumDetail,
} from "./importFromScriptorium";

/** strict検証を通る最小の有効RecipeDoc（palette/tools/baseSteps/partsを持つ） */
function makeValidRecipeDoc(overrides?: Partial<RecipeDoc>): RecipeDoc {
  return {
    schemaVersion: CURRENT_SCHEMA_VERSION,
    id: "rcp_import_1",
    title: "Space Marine Captain",
    createdAt: "2026-07-01T00:00:00.000Z",
    updatedAt: "2026-07-02T00:00:00.000Z",
    overviewPhotoIds: [],
    palette: [
      {
        id: "col_1",
        source: "preset",
        brand: "Citadel",
        name: "Mephiston Red",
        presetId: "citadel:mephiston-red",
        hex: "#960F0F",
        chipPhotoId: null,
      },
    ],
    tools: [{ id: "tool_1", name: "エアブラシ", note: null }],
    baseSteps: [
      {
        id: "stp_base_1",
        technique: { presetKey: "prime", label: null },
        photoId: null,
        paints: [],
        mix: null,
        toolIds: ["tool_1"],
        memo: "",
      },
    ],
    parts: [
      {
        id: "part_1",
        name: "兜",
        steps: [
          {
            id: "stp_1",
            technique: { presetKey: "basecoat", label: null },
            photoId: null,
            paints: [{ colorId: "col_1" }],
            mix: null,
            toolIds: ["tool_1"],
            memo: "",
          },
        ],
      },
    ],
    photoCrops: {},
    source: null,
    ...overrides,
  };
}

function makeValidPublishedRecipe(): PublishedRecipe {
  return toPublishedRecipe(makeValidRecipeDoc());
}

function makeDetail(overrides?: Partial<ScriptoriumDetail>): ScriptoriumDetail {
  return {
    id: "scr_seed_wolf",
    handle: "painter_taro",
    publishedAt: "2026-07-08T00:00:00.000Z",
    coverUrl: null,
    recipe: makeValidPublishedRecipe(),
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// parseImportUrl
// ---------------------------------------------------------------------------

describe("parseImportUrl — 受理", () => {
  test("正規URL（randomUUID形式id）を受理する", () => {
    const id = "3fa85f64-5717-4562-b3fc-2c963f66afa6";
    const result = parseImportUrl(
      `https://scriptorium.coat-codex.com/api/recipes/${id}`,
    );
    expect(result).toEqual({ scriptoriumId: id });
  });

  test("正規URL（scr_seed_wolf形式id）を受理する", () => {
    const result = parseImportUrl(
      "https://scriptorium.coat-codex.com/api/recipes/scr_seed_wolf",
    );
    expect(result).toEqual({ scriptoriumId: "scr_seed_wolf" });
  });
});

describe("parseImportUrl — 拒否", () => {
  const rejectedCases: { label: string; url: string }[] = [
    {
      label: "http（非https）",
      url: "http://scriptorium.coat-codex.com/api/recipes/x",
    },
    { label: "別ホスト", url: "https://evil.com/api/recipes/x" },
    {
      label: "ホスト後方一致トリック",
      url: "https://scriptorium.coat-codex.com.evil.com/api/recipes/x",
    },
    {
      label: "userinfo付き",
      url: "https://scriptorium.coat-codex.com@evil.com/api/recipes/x",
    },
    {
      label: "port付き",
      url: "https://scriptorium.coat-codex.com:8443/api/recipes/x",
    },
    {
      label: "余分なパス段",
      url: "https://scriptorium.coat-codex.com/api/recipes/x/y",
    },
    {
      label: "id文字種違反(%2e含む)",
      url: "https://scriptorium.coat-codex.com/api/recipes/%2e%2e",
    },
    { label: "id空", url: "https://scriptorium.coat-codex.com/api/recipes/" },
    {
      label: "query付き",
      url: "https://scriptorium.coat-codex.com/api/recipes/x?y=1",
    },
    {
      label: "hash付き",
      url: "https://scriptorium.coat-codex.com/api/recipes/x#y",
    },
    { label: "URLでない文字列", url: "not a url" },
  ];

  for (const { label, url } of rejectedCases) {
    test(label, () => {
      expect(parseImportUrl(url)).toBeNull();
    });
  }
});

describe("buildScriptoriumPageUrl", () => {
  test("SCRIPTORIUM_ORIGIN配下の/r/<id>を組み立てる", () => {
    expect(buildScriptoriumPageUrl("scr_seed_wolf")).toBe(
      `${SCRIPTORIUM_ORIGIN}/r/scr_seed_wolf`,
    );
  });
});

// ---------------------------------------------------------------------------
// fetchPublishedDetail
// ---------------------------------------------------------------------------

describe("fetchPublishedDetail", () => {
  test("200正常: apiBase配下のURLで呼ばれ、envelopeを検証してdetailを返す（rawではなくidから再構築）", async () => {
    const detail = makeDetail();
    const fetchStub = vi.fn<typeof fetch>(async () => {
      return new Response(JSON.stringify(detail), { status: 200 });
    });

    const result = await fetchPublishedDetail("scr_seed_wolf", {
      fetch: fetchStub,
      apiBase: "https://api.example",
    });

    expect(fetchStub).toHaveBeenCalledTimes(1);
    expect(fetchStub.mock.calls[0][0]).toBe(
      "https://api.example/api/recipes/scr_seed_wolf",
    );
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.detail.id).toBe("scr_seed_wolf");
      expect(result.detail.handle).toBe("painter_taro");
    }
  });

  test("404 → notFound", async () => {
    const fetchStub = vi.fn<typeof fetch>(
      async () =>
        new Response(JSON.stringify({ error: "not found" }), { status: 404 }),
    );
    const result = await fetchPublishedDetail("scr_x", { fetch: fetchStub });
    expect(result).toMatchObject({ ok: false, code: "notFound" });
  });

  test("500 → network", async () => {
    const fetchStub = vi.fn<typeof fetch>(
      async () => new Response(null, { status: 500 }),
    );
    const result = await fetchPublishedDetail("scr_x", { fetch: fetchStub });
    expect(result).toMatchObject({ ok: false, code: "network" });
  });

  test("fetch reject → network", async () => {
    const fetchStub = vi.fn<typeof fetch>(async () => {
      throw new Error("offline");
    });
    const result = await fetchPublishedDetail("scr_x", { fetch: fetchStub });
    expect(result).toMatchObject({ ok: false, code: "network" });
  });

  test("envelope不正: handle欠落 → invalidData", async () => {
    const detail = makeDetail() as unknown as Record<string, unknown>;
    delete detail.handle;
    const fetchStub = vi.fn<typeof fetch>(
      async () => new Response(JSON.stringify(detail), { status: 200 }),
    );
    const result = await fetchPublishedDetail("scr_x", { fetch: fetchStub });
    expect(result).toMatchObject({ ok: false, code: "invalidData" });
  });

  test("envelope不正: recipe不正 → invalidData", async () => {
    const detail = { ...makeDetail(), recipe: { title: "broken" } };
    const fetchStub = vi.fn<typeof fetch>(
      async () => new Response(JSON.stringify(detail), { status: 200 }),
    );
    const result = await fetchPublishedDetail("scr_x", { fetch: fetchStub });
    expect(result).toMatchObject({ ok: false, code: "invalidData" });
  });

  test("envelope不正: coverUrlがhttps://evil.com/x → invalidData", async () => {
    const detail = makeDetail({ coverUrl: "https://evil.com/x" });
    const fetchStub = vi.fn<typeof fetch>(
      async () => new Response(JSON.stringify(detail), { status: 200 }),
    );
    const result = await fetchPublishedDetail("scr_x", { fetch: fetchStub });
    expect(result).toMatchObject({ ok: false, code: "invalidData" });
  });

  const rejectedCoverUrls: { label: string; coverUrl: string }[] = [
    { label: "traversal(../../x)", coverUrl: "/img/../../x" },
    { label: "二重スラッシュ", coverUrl: "/img/covers//x.jpg" },
    { label: "query混入", coverUrl: "/img/x?q=1" },
    { label: "hash混入", coverUrl: "/img/x#y" },
    { label: "改行混入", coverUrl: "/img/x\n" },
  ];

  for (const { label, coverUrl } of rejectedCoverUrls) {
    test(`envelope不正: coverUrlが${label} → invalidData`, async () => {
      const detail = makeDetail({ coverUrl });
      const fetchStub = vi.fn<typeof fetch>(
        async () => new Response(JSON.stringify(detail), { status: 200 }),
      );
      const result = await fetchPublishedDetail("scr_x", { fetch: fetchStub });
      expect(result).toMatchObject({ ok: false, code: "invalidData" });
    });
  }

  test("正規coverUrl（/img/covers/<id>.jpg形式）は受理する", async () => {
    const detail = makeDetail({
      coverUrl: "/img/covers/3fa85f64-5717-4562-b3fc-2c963f66afa6.jpg",
    });
    const fetchStub = vi.fn<typeof fetch>(
      async () => new Response(JSON.stringify(detail), { status: 200 }),
    );
    const result = await fetchPublishedDetail("scr_x", { fetch: fetchStub });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.detail.coverUrl).toBe(
        "/img/covers/3fa85f64-5717-4562-b3fc-2c963f66afa6.jpg",
      );
    }
  });
});

// ---------------------------------------------------------------------------
// fetchCoverAsDataUrl
// ---------------------------------------------------------------------------

describe("fetchCoverAsDataUrl", () => {
  test("blob→dataUrl＋bytesへ変換する", async () => {
    // jsdom環境のResponseコンストラクタはBlobボディをString(blob)（"[object Blob]"）に
    // 変換してしまい実バイト数を再現できないため、res.blob()を直接差し替えたフェイクResponseを使う
    const blob = new Blob(["cover-bytes"], { type: "image/jpeg" });
    const fetchStub = vi.fn<typeof fetch>(async () => {
      return {
        ok: true,
        status: 200,
        blob: async () => blob,
      } as unknown as Response;
    });

    const result = await fetchCoverAsDataUrl("/img/cover_1.jpg", {
      fetch: fetchStub,
      apiBase: "https://api.example",
    });

    expect(fetchStub.mock.calls[0][0]).toBe(
      "https://api.example/img/cover_1.jpg",
    );
    expect(result).not.toBeNull();
    expect(result?.dataUrl.startsWith("data:")).toBe(true);
    expect(result?.bytes).toBe(blob.size);
  });

  test("404 → null", async () => {
    const fetchStub = vi.fn<typeof fetch>(
      async () => new Response(null, { status: 404 }),
    );
    const result = await fetchCoverAsDataUrl("/img/missing.jpg", {
      fetch: fetchStub,
    });
    expect(result).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// findRecipeByScriptoriumId
// ---------------------------------------------------------------------------

describe("findRecipeByScriptoriumId", () => {
  test("一致するdocを返す", async () => {
    const doc = makeValidRecipeDoc({
      id: "rcp_a",
      source: {
        scriptoriumId: "scr_x",
        author: "taro",
        importedAt: "2026-07-01T00:00:00.000Z",
      },
    });
    const result = await findRecipeByScriptoriumId("scr_x", {
      listRecipes: async () => [doc],
    });
    expect(result?.id).toBe("rcp_a");
  });

  test("不一致ならnull", async () => {
    const doc = makeValidRecipeDoc({
      id: "rcp_a",
      source: {
        scriptoriumId: "scr_other",
        author: "taro",
        importedAt: "2026-07-01T00:00:00.000Z",
      },
    });
    const result = await findRecipeByScriptoriumId("scr_x", {
      listRecipes: async () => [doc],
    });
    expect(result).toBeNull();
  });

  test("source未定義の旧文書が混在してもthrowせずスキップする", async () => {
    const legacyDoc = makeValidRecipeDoc({
      id: "rcp_legacy",
    }) as unknown as Record<string, unknown>;
    delete legacyDoc.source;
    const matchDoc = makeValidRecipeDoc({
      id: "rcp_match",
      source: {
        scriptoriumId: "scr_x",
        author: "taro",
        importedAt: "2026-07-01T00:00:00.000Z",
      },
    });

    const result = await findRecipeByScriptoriumId("scr_x", {
      listRecipes: async () => [legacyDoc as unknown as RecipeDoc, matchDoc],
    });
    expect(result?.id).toBe("rcp_match");
  });

  test("既定はdb.recipes.toArray()を使う", async () => {
    await db.recipes.clear();
    const doc = makeValidRecipeDoc({
      id: "rcp_real",
      source: {
        scriptoriumId: "scr_real",
        author: "taro",
        importedAt: "2026-07-01T00:00:00.000Z",
      },
    });
    await db.recipes.add(doc);

    const result = await findRecipeByScriptoriumId("scr_real");
    expect(result?.id).toBe("rcp_real");

    await db.recipes.clear();
  });
});

// ---------------------------------------------------------------------------
// runScriptoriumImport
// ---------------------------------------------------------------------------

describe("runScriptoriumImport", () => {
  test("scriptoriumId/author/importedAtがsourceへ渡り、coverDataUrlなしはphotos:[]", async () => {
    const importRecipeSpy = vi.fn<(jsonText: string) => Promise<ImportResult>>(
      async (jsonText) => {
        const parsed = JSON.parse(jsonText) as {
          recipe: { source: unknown; id: string; title: string };
        };
        return {
          ok: true,
          recipe: {
            ...(parsed.recipe as RecipeDoc),
          },
        };
      },
    );

    const detail = makeDetail({ handle: "painter_taro" });
    await runScriptoriumImport(
      { detail, scriptoriumId: "scr_seed_wolf" },
      {
        importRecipe: importRecipeSpy,
        now: () => new Date("2026-07-08T09:00:00.000Z"),
      },
    );

    expect(importRecipeSpy).toHaveBeenCalledTimes(1);
    const jsonText = importRecipeSpy.mock.calls[0][0];
    const parsed = JSON.parse(jsonText) as {
      recipe: {
        source: { scriptoriumId: string; author: string; importedAt: string };
      };
      photos: unknown[];
    };
    expect(parsed.recipe.source).toEqual({
      scriptoriumId: "scr_seed_wolf",
      author: "painter_taro",
      importedAt: "2026-07-08T09:00:00.000Z",
    });
    expect(parsed.photos).toEqual([]);
  });

  test("coverDataUrlあり: photos:[{id:'ph_cover',...}]＋overviewPhotoIds:['ph_cover']", async () => {
    const importRecipeSpy = vi.fn<(jsonText: string) => Promise<ImportResult>>(
      async (jsonText) => {
        const parsed = JSON.parse(jsonText) as { recipe: RecipeDoc };
        return { ok: true, recipe: parsed.recipe };
      },
    );

    const detail = makeDetail();
    await runScriptoriumImport(
      {
        detail,
        scriptoriumId: "scr_seed_wolf",
        coverDataUrl: "data:image/jpeg;base64,AAAA",
      },
      { importRecipe: importRecipeSpy },
    );

    const jsonText = importRecipeSpy.mock.calls[0][0];
    const parsed = JSON.parse(jsonText) as {
      recipe: { overviewPhotoIds: string[] };
      photos: { id: string; dataUrl: string }[];
    };
    expect(parsed.recipe.overviewPhotoIds).toEqual(["ph_cover"]);
    expect(parsed.photos).toEqual([
      { id: "ph_cover", dataUrl: "data:image/jpeg;base64,AAAA" },
    ]);
  });

  test("importRecipeの結果をそのままパススルーする", async () => {
    const failureResult: ImportResult = {
      ok: false,
      reason: "invalid-schema",
      message: "invalid",
      issues: [],
    };
    const importRecipeSpy = vi.fn<(jsonText: string) => Promise<ImportResult>>(
      async () => failureResult,
    );

    const result = await runScriptoriumImport(
      { detail: makeDetail(), scriptoriumId: "scr_seed_wolf" },
      { importRecipe: importRecipeSpy },
    );

    expect(result).toBe(failureResult);
  });
});

describe("runScriptoriumImport — 実importRecipe経由（fake-indexeddb）", () => {
  beforeEach(async () => {
    await db.recipes.clear();
    await db.photos.clear();
  });

  afterEach(async () => {
    await db.recipes.clear();
    await db.photos.clear();
  });

  test("実importRecipeでDexieへ書き込まれ、source.scriptoriumIdが保存される", async () => {
    const detail = makeDetail({ id: "scr_seed_wolf", handle: "painter_taro" });
    const result = await runScriptoriumImport({
      detail,
      scriptoriumId: "scr_seed_wolf",
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      const stored = await db.recipes.get(result.recipe.id);
      expect(stored?.source).toEqual(
        expect.objectContaining({
          scriptoriumId: "scr_seed_wolf",
          author: "painter_taro",
        }),
      );
    }
  });
});
