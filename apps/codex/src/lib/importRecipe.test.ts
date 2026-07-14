// lib/importRecipe.test.ts — インポートパイプライン: Dexie書き込み部のテスト（技術計画v2.2 §2.7・T30／v1 §1.4-2(d) ST-06）
//
// fake-indexeddbでグローバルのindexedDBをポリフィルし、Dexie(db.ts)を実DBのように動作させる。
// dataUrlToBlob/loadBrandColorsResultはImportRecipeDepsで注入し、fetch実体には依存しない。
// 3段検証（第1段ヘッダ検証・第3段フル検証）・reassignRecipeIds・normalizeImportの純ロジック部の
// テストは @coat-codex/recipe-core の exchange/importPipeline.test.ts へ移設済み
// （node環境で完結。fake-indexeddb/jsdom非依存）。本ファイルはDexie tx書き込み・tx罠・
// importRecipe統合のテストのみを持つ。

import "fake-indexeddb/auto";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { db } from "../db/db";
import { importRecipe, type ImportRecipeDeps } from "./importRecipe";
import { CURRENT_SCHEMA_VERSION } from "@coat-codex/recipe-core";
import type { RecipeDoc, RecipeExportFile } from "@coat-codex/recipe-core";

beforeEach(async () => {
  await db.recipes.clear();
  await db.photos.clear();
  await db.meta.clear();
  await db.userTools.clear();
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
    photoCrops: {},
    source: null,
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

  test("回帰: レシピのJSONインポートはツールライブラリへ自動登録しない（技術計画v2.6 §2.8）", async () => {
    const recipe = makeRecipe({
      tools: [{ id: "tool_1", name: "エアブラシ", note: null }],
    });
    const json = JSON.stringify(makeExportFile(recipe));

    const result = await importRecipe(json, noopDeps);

    expect(result.ok).toBe(true);
    expect(await db.userTools.count()).toBe(0);
  });
});
