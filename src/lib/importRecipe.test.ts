// lib/importRecipe.test.ts — インポートパイプラインのテスト（技術計画v2.2 §2.7・T30）
//
// fake-indexeddbでグローバルのindexedDBをポリフィルし、Dexie(db.ts)を実DBのように動作させる。
// dataUrlToBlob/loadBrandColorsResultはImportRecipeDepsで注入し、fetch実体には依存しない。

import "fake-indexeddb/auto";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { db } from "../db/db";
import {
  importRecipe,
  normalizeImport,
  reassignRecipeIds,
  type ImportRecipeDeps,
} from "./importRecipe";
import { CURRENT_SCHEMA_VERSION } from "../models/migrations";
import type { RecipeDoc, RecipeExportFile } from "../models/recipe";

beforeEach(async () => {
  await db.recipes.clear();
  await db.photos.clear();
  await db.meta.clear();
});

afterEach(() => {
  vi.restoreAllMocks();
});

/** テスト用の最小RecipeDocビルダー。schemaVersionはCURRENT固定 */
function makeRecipe(overrides: Partial<RecipeDoc> = {}): RecipeDoc {
  const now = "2026-07-01T00:00:00.000Z";
  return {
    schemaVersion: CURRENT_SCHEMA_VERSION,
    id: "rcp_old",
    title: "テストレシピ",
    createdAt: now,
    updatedAt: now,
    overviewPhotoIds: [],
    palette: [],
    tools: [],
    baseSteps: [],
    parts: [],
    ...overrides,
  };
}

function makeExportFile(
  recipe: RecipeDoc,
  photos: { id: string; dataUrl: string }[] = [],
): RecipeExportFile {
  return {
    app: "coat-codex",
    kind: "recipe-export",
    schemaVersion: recipe.schemaVersion,
    exportedAt: "2026-07-01T00:00:00.000Z",
    recipe,
    photos,
  };
}

const PNG_DATA_URL =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=";

const noopDeps: ImportRecipeDeps = {
  loadBrandColorsResult: async () => ({ ok: false, reason: "unknown-brand" }),
  dataUrlToBlob: async () => new Blob(["fake"], { type: "image/png" }),
};

describe("importRecipe: 第1段ヘッダ検証", () => {
  test("JSONとして不正な文字列はinvalid-jsonで拒否する", async () => {
    const result = await importRecipe("{ not valid json", noopDeps);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toBe("invalid-json");
    }
    expect(await db.recipes.count()).toBe(0);
  });

  test("appフィールドが coat-codex でないファイルはinvalid-headerで拒否する", async () => {
    const json = JSON.stringify({
      app: "other-app",
      kind: "recipe-export",
      schemaVersion: 1,
    });
    const result = await importRecipe(json, noopDeps);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toBe("invalid-header");
      expect(result.issues.length).toBeGreaterThan(0);
    }
  });

  test("kindフィールドが recipe-export でないファイルはinvalid-headerで拒否する", async () => {
    const json = JSON.stringify({
      app: "coat-codex",
      kind: "other-kind",
      schemaVersion: 1,
    });
    const result = await importRecipe(json, noopDeps);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toBe("invalid-header");
    }
  });

  test("別kindのファイルはmigrateExportFile相当の処理へ進まない（ヘッダ段で中断する）", async () => {
    // kind不一致のファイルにrecipe前提のmigrateExportFileが実行されないことの回帰確認:
    // recipeフィールドが完全に欠落していてもinvalid-headerで止まりTypeErrorにならない
    const json = JSON.stringify({
      app: "coat-codex",
      kind: "some-other-kind",
      schemaVersion: 1,
    });
    const result = await importRecipe(json, noopDeps);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toBe("invalid-header");
    }
  });

  test("上位schemaVersionのファイルはunsupported-versionで拒否する", async () => {
    const recipe = makeRecipe({ schemaVersion: CURRENT_SCHEMA_VERSION + 1 });
    const file = makeExportFile(recipe);
    const json = JSON.stringify({
      ...file,
      schemaVersion: CURRENT_SCHEMA_VERSION + 1,
    });

    const result = await importRecipe(json, noopDeps);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toBe("unsupported-version");
    }
    expect(await db.recipes.count()).toBe(0);
  });
});

describe("importRecipe: 第3段フル検証", () => {
  test("不変条件違反（paints重複等）のファイルはinvalid-schemaでzod issue一覧を返す", async () => {
    const recipe = makeRecipe({
      palette: [
        {
          id: "col_1",
          source: "custom",
          brand: null,
          name: "赤",
          presetId: null,
          hex: "#ff0000",
          chipPhotoId: null,
        },
      ],
      baseSteps: [
        {
          id: "stp_1",
          technique: { presetKey: null, label: null },
          photoId: null,
          paints: [{ colorId: "col_1" }, { colorId: "col_1" }], // INV-7違反: colorId重複
          mix: [50, 50],
          toolIds: [],
          memo: "",
        },
      ],
    });
    const json = JSON.stringify(makeExportFile(recipe));

    const result = await importRecipe(json, noopDeps);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toBe("invalid-schema");
      expect(result.issues.length).toBeGreaterThan(0);
      expect(result.issues.some((i) => i.message.includes("INV-7"))).toBe(true);
    }
    expect(await db.recipes.count()).toBe(0);
  });
});

describe("reassignRecipeIds: 正規化規則a（全ID新規採番）", () => {
  test("recipe.id・palette[].id・tools[].id・parts[].id・全Step.idが旧IDと異なる新IDへ置き換わる", () => {
    const recipe = makeRecipe({
      id: "rcp_old",
      palette: [
        {
          id: "col_old",
          source: "custom",
          brand: null,
          name: "赤",
          presetId: null,
          hex: "#ff0000",
          chipPhotoId: null,
        },
      ],
      tools: [{ id: "tool_old", name: "筆", note: null }],
      baseSteps: [
        {
          id: "stp_old",
          technique: { presetKey: null, label: null },
          photoId: null,
          paints: [],
          mix: null,
          toolIds: [],
          memo: "",
        },
      ],
      parts: [{ id: "part_old", name: "パーツ", steps: [] }],
    });

    const { recipe: result } = reassignRecipeIds(recipe);

    expect(result.id).not.toBe("rcp_old");
    expect(result.id.startsWith("rcp_")).toBe(true);
    expect(result.palette[0].id).not.toBe("col_old");
    expect(result.palette[0].id.startsWith("col_")).toBe(true);
    expect(result.tools[0].id).not.toBe("tool_old");
    expect(result.tools[0].id.startsWith("tool_")).toBe(true);
    expect(result.baseSteps[0].id).not.toBe("stp_old");
    expect(result.baseSteps[0].id.startsWith("stp_")).toBe(true);
    expect(result.parts[0].id).not.toBe("part_old");
    expect(result.parts[0].id.startsWith("part_")).toBe(true);
  });

  test("同一ファイルを2回reassignすると異なるIDが払い出される（衝突有無に関わらず常に新規採番）", () => {
    const recipe = makeRecipe({ id: "rcp_same" });
    const first = reassignRecipeIds(recipe);
    const second = reassignRecipeIds(recipe);
    expect(first.recipe.id).not.toBe(second.recipe.id);
  });
});

describe("reassignRecipeIds: 正規化規則b（参照リマップ）", () => {
  test("colorId/toolIds/overviewPhotoIds/steps[].photoId/chipPhotoIdが新IDへ一括置換される", () => {
    const recipe = makeRecipe({
      overviewPhotoIds: ["ph_overview"],
      palette: [
        {
          id: "col_1",
          source: "custom",
          brand: null,
          name: "赤",
          presetId: null,
          hex: "#ff0000",
          chipPhotoId: "ph_chip",
        },
      ],
      tools: [{ id: "tool_1", name: "筆", note: null }],
      baseSteps: [
        {
          id: "stp_1",
          technique: { presetKey: null, label: null },
          photoId: "ph_step",
          paints: [{ colorId: "col_1" }],
          mix: null,
          toolIds: ["tool_1"],
          memo: "",
        },
      ],
    });

    const { recipe: result, photoIdMap } = reassignRecipeIds(recipe);

    const newColorId = result.palette[0].id;
    const newToolId = result.tools[0].id;
    const newOverviewPhotoId = photoIdMap.get("ph_overview");
    const newChipPhotoId = photoIdMap.get("ph_chip");
    const newStepPhotoId = photoIdMap.get("ph_step");

    expect(result.baseSteps[0].paints[0].colorId).toBe(newColorId);
    expect(result.baseSteps[0].toolIds[0]).toBe(newToolId);
    expect(result.overviewPhotoIds[0]).toBe(newOverviewPhotoId);
    expect(result.palette[0].chipPhotoId).toBe(newChipPhotoId);
    expect(result.baseSteps[0].photoId).toBe(newStepPhotoId);

    // 旧IDとは異なる
    expect(newColorId).not.toBe("col_1");
    expect(newToolId).not.toBe("tool_1");
    expect(newOverviewPhotoId).not.toBe("ph_overview");
    expect(newChipPhotoId).not.toBe("ph_chip");
    expect(newStepPhotoId).not.toBe("ph_step");
  });

  test("parts[].steps内の参照もリマップされる", () => {
    const recipe = makeRecipe({
      palette: [
        {
          id: "col_1",
          source: "custom",
          brand: null,
          name: "赤",
          presetId: null,
          hex: "#ff0000",
          chipPhotoId: null,
        },
      ],
      parts: [
        {
          id: "part_1",
          name: "パーツ",
          steps: [
            {
              id: "stp_part1",
              technique: { presetKey: null, label: null },
              photoId: null,
              paints: [{ colorId: "col_1" }],
              mix: null,
              toolIds: [],
              memo: "",
            },
          ],
        },
      ],
    });

    const { recipe: result } = reassignRecipeIds(recipe);
    const newColorId = result.palette[0].id;
    expect(result.parts[0].steps[0].paints[0].colorId).toBe(newColorId);
  });
});

describe("normalizeImport: 正規化規則c（dangling photo除去）", () => {
  test("photos[]に実体がないphoto参照は文書から除去される", async () => {
    const recipe = makeRecipe({
      overviewPhotoIds: ["ph_missing"],
      baseSteps: [
        {
          id: "stp_1",
          technique: { presetKey: null, label: null },
          photoId: "ph_missing_step",
          paints: [],
          mix: null,
          toolIds: [],
          memo: "",
        },
      ],
    });
    const file = makeExportFile(recipe, []); // photos: [] = 実体なし

    const { recipe: result, photos } = await normalizeImport(file, noopDeps);

    expect(result.overviewPhotoIds).toEqual([]);
    expect(result.baseSteps[0].photoId).toBeNull();
    expect(photos).toEqual([]);
  });

  test("photos[]に実体があるphoto参照は保持され、新IDへリマップされたエントリが返る", async () => {
    const recipe = makeRecipe({
      overviewPhotoIds: ["ph_present"],
    });
    const file = makeExportFile(recipe, [
      { id: "ph_present", dataUrl: PNG_DATA_URL },
    ]);

    const { recipe: result, photos } = await normalizeImport(file, noopDeps);

    expect(result.overviewPhotoIds).toHaveLength(1);
    expect(photos).toHaveLength(1);
    expect(photos[0].id).toBe(result.overviewPhotoIds[0]);
    expect(photos[0].dataUrl).toBe(PNG_DATA_URL);
  });
});

describe("normalizeImport: 正規化規則d（presetKey/presetId降格）", () => {
  test("マスタ外のtechnique.presetKeyは{presetKey:null, label:<旧キー>}へ降格する", async () => {
    const recipe = makeRecipe({
      baseSteps: [
        {
          id: "stp_1",
          technique: { presetKey: "unknown-legacy-technique", label: null },
          photoId: null,
          paints: [],
          mix: null,
          toolIds: [],
          memo: "",
        },
      ],
    });
    const file = makeExportFile(recipe);

    const { recipe: result } = await normalizeImport(file, noopDeps);

    expect(result.baseSteps[0].technique.presetKey).toBeNull();
    expect(result.baseSteps[0].technique.label).toBe(
      "unknown-legacy-technique",
    );
  });

  test("マスタ内のtechnique.presetKeyは降格されない", async () => {
    const recipe = makeRecipe({
      baseSteps: [
        {
          id: "stp_1",
          technique: { presetKey: "basecoat", label: null },
          photoId: null,
          paints: [],
          mix: null,
          toolIds: [],
          memo: "",
        },
      ],
    });
    const file = makeExportFile(recipe);

    const { recipe: result } = await normalizeImport(file, noopDeps);

    expect(result.baseSteps[0].technique.presetKey).toBe("basecoat");
    expect(result.baseSteps[0].technique.label).toBeNull();
  });

  test("マスタ外のpalette[].presetIdはsource=customかつpresetId=nullへ降格する", async () => {
    const recipe = makeRecipe({
      palette: [
        {
          id: "col_1",
          source: "preset",
          brand: "Citadel",
          name: "廃盤カラー",
          presetId: "citadel:discontinued-color",
          hex: "#123456",
          chipPhotoId: null,
        },
      ],
    });
    const file = makeExportFile(recipe);

    const deps: ImportRecipeDeps = {
      loadBrandColorsResult: async (brandId) =>
        brandId === "citadel"
          ? { ok: true, colors: [{ id: "citadel:mephiston-red" }] }
          : { ok: false, reason: "unknown-brand" },
      dataUrlToBlob: noopDeps.dataUrlToBlob,
    };

    const { recipe: result } = await normalizeImport(file, deps);

    expect(result.palette[0].source).toBe("custom");
    expect(result.palette[0].presetId).toBeNull();
  });

  test("マスタ内のpalette[].presetIdは降格されない", async () => {
    const recipe = makeRecipe({
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
    });
    const file = makeExportFile(recipe);

    const deps: ImportRecipeDeps = {
      loadBrandColorsResult: async (brandId) =>
        brandId === "citadel"
          ? { ok: true, colors: [{ id: "citadel:mephiston-red" }] }
          : { ok: false, reason: "unknown-brand" },
      dataUrlToBlob: noopDeps.dataUrlToBlob,
    };

    const { recipe: result } = await normalizeImport(file, deps);

    expect(result.palette[0].source).toBe("preset");
    expect(result.palette[0].presetId).toBe("citadel:mephiston-red");
  });

  test("裁定規則a: ブランドがindexに存在しない場合は降格する（例: 旧AK）", async () => {
    const recipe = makeRecipe({
      palette: [
        {
          id: "col_1",
          source: "preset",
          brand: "AK",
          name: "旧 AK カラー",
          presetId: "ak:old-color",
          hex: "#654321",
          chipPhotoId: null,
        },
      ],
    });
    const file = makeExportFile(recipe);

    const deps: ImportRecipeDeps = {
      loadBrandColorsResult: async () => ({
        ok: false,
        reason: "unknown-brand",
      }),
      dataUrlToBlob: noopDeps.dataUrlToBlob,
    };

    const { recipe: result } = await normalizeImport(file, deps);

    expect(result.palette[0].source).toBe("custom");
    expect(result.palette[0].presetId).toBeNull();
  });

  test("裁定規則b: ブランドはindexに存在するが色一覧fetchがネットワーク起因で失敗した場合は降格せずpresetを維持する", async () => {
    const recipe = makeRecipe({
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
    });
    const file = makeExportFile(recipe);

    const deps: ImportRecipeDeps = {
      loadBrandColorsResult: async () => ({
        ok: false,
        reason: "fetch-failed",
      }),
      dataUrlToBlob: noopDeps.dataUrlToBlob,
    };

    const { recipe: result } = await normalizeImport(file, deps);

    expect(result.palette[0].source).toBe("preset");
    expect(result.palette[0].presetId).toBe("citadel:mephiston-red");
  });

  test("裁定規則c: index自体が取得不能な場合は降格処理全体をスキップする（インポートは続行）", async () => {
    const recipe = makeRecipe({
      palette: [
        {
          id: "col_1",
          source: "preset",
          brand: "Citadel",
          name: "廃盤カラー",
          presetId: "citadel:discontinued-color",
          hex: "#123456",
          chipPhotoId: null,
        },
        {
          id: "col_2",
          source: "custom",
          brand: null,
          name: "自由入力カラー",
          presetId: null,
          hex: "#abcdef",
          chipPhotoId: null,
        },
      ],
    });
    const file = makeExportFile(recipe);

    const deps: ImportRecipeDeps = {
      loadBrandColorsResult: async () => ({
        ok: false,
        reason: "index-unavailable",
      }),
      dataUrlToBlob: noopDeps.dataUrlToBlob,
    };

    const { recipe: result } = await normalizeImport(file, deps);

    // index不能時は降格処理全体をスキップ: preset色はsource/presetIdとも変化しない
    expect(result.palette[0].source).toBe("preset");
    expect(result.palette[0].presetId).toBe("citadel:discontinued-color");
    // custom色も無関係に素通りする（インポート自体は続行）
    expect(result.palette[1].source).toBe("custom");
  });
});

describe("normalizeImport: 正規化規則e（schemaVersion/createdAt/updatedAt）", () => {
  test("schemaVersion=CURRENT・createdAtは保持・updatedAtは現在時刻へ更新される", async () => {
    const recipe = makeRecipe({
      createdAt: "2020-01-01T00:00:00.000Z",
      updatedAt: "2020-01-01T00:00:00.000Z",
    });
    const file = makeExportFile(recipe);

    const before = Date.now();
    const { recipe: result } = await normalizeImport(file, noopDeps);
    const after = Date.now();

    expect(result.schemaVersion).toBe(CURRENT_SCHEMA_VERSION);
    expect(result.createdAt).toBe("2020-01-01T00:00:00.000Z");
    expect(result.updatedAt).not.toBe("2020-01-01T00:00:00.000Z");
    const updatedAtMs = new Date(result.updatedAt).getTime();
    expect(updatedAtMs).toBeGreaterThanOrEqual(before);
    expect(updatedAtMs).toBeLessThanOrEqual(after);
  });
});

describe("importRecipe: Dexie rwトランザクション書き込み", () => {
  test("正常系: recipes.add・photos.bulkAddの両方が書き込まれる", async () => {
    const recipe = makeRecipe({ overviewPhotoIds: ["ph_1"] });
    const file = makeExportFile(recipe, [
      { id: "ph_1", dataUrl: PNG_DATA_URL },
    ]);
    const json = JSON.stringify(file);

    const result = await importRecipe(json, noopDeps);

    expect(result.ok).toBe(true);
    if (result.ok) {
      const stored = await db.recipes.get(result.recipe.id);
      expect(stored).toBeDefined();
      expect(stored?.id).toBe(result.recipe.id);

      const storedPhotoId = result.recipe.overviewPhotoIds[0];
      const storedPhoto = await db.photos.get(storedPhotoId);
      expect(storedPhoto).toBeDefined();
      expect(storedPhoto?.recipeId).toBe(result.recipe.id);
    }
  });

  test("同一ファイルを2回importすると2レシピになる（上書きインポートしない）", async () => {
    const recipe = makeRecipe();
    const json = JSON.stringify(makeExportFile(recipe));

    const first = await importRecipe(json, noopDeps);
    const second = await importRecipe(json, noopDeps);

    expect(first.ok).toBe(true);
    expect(second.ok).toBe(true);
    if (first.ok && second.ok) {
      expect(first.recipe.id).not.toBe(second.recipe.id);
    }
    expect(await db.recipes.count()).toBe(2);
  });

  test("tx失敗時はロールバックし、recipes/photosどちらにも書き込みが残らない", async () => {
    const recipe = makeRecipe({ overviewPhotoIds: ["ph_1"] });
    const file = makeExportFile(recipe, [
      { id: "ph_1", dataUrl: PNG_DATA_URL },
    ]);
    const json = JSON.stringify(file);

    // photos.bulkAddは成功するが、後続のrecipes.addで失敗させてロールバックを誘発する
    vi.spyOn(db.recipes, "add").mockRejectedValueOnce(
      new Error("simulated recipes.add failure"),
    );

    const result = await importRecipe(json, noopDeps);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toBe("transaction-failed");
    }
    expect(await db.recipes.count()).toBe(0);
    expect(await db.photos.count()).toBe(0);
  });

  test("tx失敗時（photos書き込み失敗）もロールバックし、recipesに書き込みが残らない", async () => {
    const recipe = makeRecipe({ overviewPhotoIds: ["ph_1"] });
    const file = makeExportFile(recipe, [
      { id: "ph_1", dataUrl: PNG_DATA_URL },
    ]);
    const json = JSON.stringify(file);

    vi.spyOn(db.photos, "bulkAdd").mockRejectedValueOnce(
      new Error("simulated photos.bulkAdd failure"),
    );

    const result = await importRecipe(json, noopDeps);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toBe("transaction-failed");
    }
    expect(await db.recipes.count()).toBe(0);
    expect(await db.photos.count()).toBe(0);
  });

  test("回帰: dataUrlToBlobがマクロタスク境界を跨いでも写真2枚以上のインポートが成功する（tx内でDexie管理外Promiseをawaitしない）", async () => {
    // dataUrlToBlobがsetTimeoutでマクロタスク境界を跨ぐ（=fetch同様、Dexieのzone-lessな
    // Promiseパッチが追跡できないPromiseになる）実装を注入する。tx内でこれをawaitすると
    // Dexieがtxを自動コミット・失効させ、後続のbulkAddがTransactionInactiveErrorになる。
    const recipe = makeRecipe({
      overviewPhotoIds: ["ph_1", "ph_2"],
    });
    const file = makeExportFile(recipe, [
      { id: "ph_1", dataUrl: PNG_DATA_URL },
      { id: "ph_2", dataUrl: PNG_DATA_URL },
    ]);
    const json = JSON.stringify(file);

    const deps: ImportRecipeDeps = {
      loadBrandColorsResult: noopDeps.loadBrandColorsResult,
      dataUrlToBlob: async (dataUrl) => {
        await new Promise((resolve) => setTimeout(resolve, 0));
        return new Blob([dataUrl], { type: "image/png" });
      },
    };

    const result = await importRecipe(json, deps);

    expect(result.ok).toBe(true);
    if (result.ok) {
      const stored = await db.recipes.get(result.recipe.id);
      expect(stored).toBeDefined();
      const photoCount = await db.photos
        .where("recipeId")
        .equals(result.recipe.id)
        .count();
      expect(photoCount).toBe(2);
    }
  });
});
