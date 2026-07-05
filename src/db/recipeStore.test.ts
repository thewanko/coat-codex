// db/recipeStore.test.ts — レシピCRUD・lazy migrationのテスト（技術計画v2.2 §2.7・D-8）
//
// fake-indexeddbでグローバルのindexedDBをポリフィルし、Dexie(db.ts)を実DBのように動作させる。

import "fake-indexeddb/auto";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { db } from "./db";
import {
  createDraft,
  CorruptRecipeError,
  deleteRecipe,
  listRecipes,
  loadRecipe,
  saveRecipe,
  UnsupportedSchemaError,
} from "./recipeStore";
import { CURRENT_SCHEMA_VERSION } from "../models/migrations";
import type { RecipeDoc } from "../models/recipe";

beforeEach(async () => {
  await db.recipes.clear();
  await db.photos.clear();
  await db.meta.clear();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("createDraft", () => {
  test("非空titleでD-8の初期形（空配列・ISO日時・rcp_プレフィックスID）を満たす文書を作成・保存する", async () => {
    const draft = await createDraft("無題のレシピ");

    expect(draft.title).toBe("無題のレシピ");
    expect(draft.id.startsWith("rcp_")).toBe(true);
    expect(draft.schemaVersion).toBe(CURRENT_SCHEMA_VERSION);
    expect(draft.overviewPhotoIds).toEqual([]);
    expect(draft.palette).toEqual([]);
    expect(draft.tools).toEqual([]);
    expect(draft.baseSteps).toEqual([]);
    expect(draft.parts).toEqual([]);
    expect(() => new Date(draft.createdAt).toISOString()).not.toThrow();
    expect(draft.createdAt).toBe(draft.updatedAt);

    const stored = await db.recipes.get(draft.id);
    expect(stored).toEqual(draft);
  });

  test("空文字titleはthrowし保存しない", async () => {
    await expect(createDraft("")).rejects.toThrow();
    await expect(createDraft("   ")).rejects.toThrow();
    expect(await db.recipes.count()).toBe(0);
  });
});

describe("saveRecipe / loadRecipe 往復", () => {
  test("createDraft → loadRecipe で同値の文書が読み出せる", async () => {
    const draft = await createDraft("test recipe");
    const loaded = await loadRecipe(draft.id);
    expect(loaded).toEqual(draft);
  });

  test("saveRecipeはupdatedAtを更新してputする", async () => {
    const draft = await createDraft("test recipe");
    await new Promise((resolve) => setTimeout(resolve, 2));

    const edited: RecipeDoc = { ...draft, title: "edited title" };
    const saved = await saveRecipe(edited);

    expect(saved.title).toBe("edited title");
    expect(saved.updatedAt).not.toBe(draft.updatedAt);
    expect(new Date(saved.updatedAt).getTime()).toBeGreaterThan(
      new Date(draft.updatedAt).getTime(),
    );

    const reloaded = await loadRecipe(draft.id);
    expect(reloaded).toEqual(saved);
  });
});

describe("listRecipes", () => {
  test("updatedAt降順で一覧を返す", async () => {
    const a = await createDraft("A");
    await new Promise((resolve) => setTimeout(resolve, 2));
    const b = await createDraft("B");
    await new Promise((resolve) => setTimeout(resolve, 2));
    const c = await createDraft("C");

    // Aを再保存して最新に押し上げる
    await new Promise((resolve) => setTimeout(resolve, 2));
    await saveRecipe(a);

    const list = await listRecipes();
    expect(list.map((r) => r.id)).toEqual([a.id, c.id, b.id]);
  });

  test("v1レコード（photoCrops欠落の生オブジェクト）はmigration適用済み（photoCrops:{}付き）で返る（B-4実機バグ対応）", async () => {
    const now = new Date().toISOString();
    const v1Doc = {
      schemaVersion: 1,
      id: "rcp_v1_list",
      title: "v1 recipe (list)",
      createdAt: now,
      updatedAt: now,
      overviewPhotoIds: [],
      palette: [],
      tools: [],
      baseSteps: [],
      parts: [],
      // photoCropsはv1では存在しない
    };
    await db.recipes.put(v1Doc as unknown as RecipeDoc);

    const list = await listRecipes();
    expect(list).toHaveLength(1);
    expect(list[0].schemaVersion).toBe(CURRENT_SCHEMA_VERSION);
    expect(list[0].photoCrops).toEqual({});

    // 一覧経路はDBへ書き戻さない（書き戻しはloadRecipeのtx内責務のまま）
    const stored = await db.recipes.get("rcp_v1_list");
    expect(stored?.schemaVersion).toBe(1);
  });

  test("未来バージョン（schemaVersion: 99）レコードはスキップされ、他のレコードは返る（console.warn記録）", async () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    const now = new Date().toISOString();

    const futureDoc = {
      schemaVersion: 99,
      id: "rcp_future_list",
      title: "future recipe (list)",
      createdAt: now,
      updatedAt: now,
      overviewPhotoIds: [],
      palette: [],
      tools: [],
      baseSteps: [],
      parts: [],
    };
    await db.recipes.put(futureDoc as unknown as RecipeDoc);
    const normal = await createDraft("normal recipe");

    const list = await listRecipes();
    expect(list.map((r) => r.id)).toEqual([normal.id]);
    expect(warnSpy).toHaveBeenCalledTimes(1);
    expect(warnSpy.mock.calls[0][0]).toContain("rcp_future_list");
  });

  test("破損文書（migration適用後もparse失敗）はスキップされ、他のレコードは返る", async () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    const corrupt = {
      schemaVersion: CURRENT_SCHEMA_VERSION,
      id: "rcp_corrupt_list",
      // title欠落 → recipeDocSchemaのparseに失敗する
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      overviewPhotoIds: [],
      palette: [],
      tools: [],
      baseSteps: [],
      parts: [],
      photoCrops: {},
    };
    await db.recipes.put(corrupt as unknown as RecipeDoc);
    const normal = await createDraft("normal recipe 2");

    const list = await listRecipes();
    expect(list.map((r) => r.id)).toEqual([normal.id]);
    expect(warnSpy).toHaveBeenCalledTimes(1);
    expect(warnSpy.mock.calls[0][0]).toContain("rcp_corrupt_list");
  });
});

describe("deleteRecipe", () => {
  test("レシピを削除する（photosには触れない）", async () => {
    const draft = await createDraft("to delete");
    await db.photos.put({
      id: "ph_1",
      recipeId: draft.id,
      blob: new Blob(["x"]),
      createdAt: new Date().toISOString(),
    });

    await deleteRecipe(draft.id);

    expect(await loadRecipe(draft.id)).toBeNull();
    // photosのGCはT14の責務なのでdeleteRecipeでは削除されない
    expect(await db.photos.get("ph_1")).toBeDefined();
  });
});

describe("loadRecipe: 存在しないid", () => {
  test("nullを返す", async () => {
    expect(await loadRecipe("rcp_does-not-exist")).toBeNull();
  });
});

describe("loadRecipe: lazy migration（下位バージョン）", () => {
  test("schemaVersion < CURRENTの文書はmigrateRecipeDocを適用し、書き戻してから返す", async () => {
    const migrationsModule = await import("../models/migrations");
    const spy = vi
      .spyOn(migrationsModule, "migrateRecipeDoc")
      .mockImplementation((raw) => ({
        ...(raw as object),
        schemaVersion: CURRENT_SCHEMA_VERSION,
        photoCrops: {},
      }));

    const now = new Date().toISOString();
    const legacyDoc = {
      schemaVersion: 0,
      id: "rcp_legacy",
      title: "legacy recipe",
      createdAt: now,
      updatedAt: now,
      overviewPhotoIds: [],
      palette: [],
      tools: [],
      baseSteps: [],
      parts: [],
    };
    // db.recipes.put は型上RecipeDoc(=schemaVersion:number)を要求するため as で許容する
    await db.recipes.put(legacyDoc as unknown as RecipeDoc);

    const loaded = await loadRecipe("rcp_legacy");
    expect(loaded).not.toBeNull();
    expect(loaded?.schemaVersion).toBe(CURRENT_SCHEMA_VERSION);
    expect(spy).toHaveBeenCalledTimes(1);

    // 書き戻り確認: DBを直接読んで更新済み（schemaVersion===CURRENT）であることを検証
    const stored = await db.recipes.get("rcp_legacy");
    expect(stored?.schemaVersion).toBe(CURRENT_SCHEMA_VERSION);
  });

  test("実DocMigrationRegistry: 保存済みv1文書のロードでphotoCrops:{}が付与されv2へ自動昇格する", async () => {
    const now = new Date().toISOString();
    const v1Doc = {
      schemaVersion: 1,
      id: "rcp_v1",
      title: "v1 recipe",
      createdAt: now,
      updatedAt: now,
      overviewPhotoIds: [],
      palette: [],
      tools: [],
      baseSteps: [],
      parts: [],
      // photoCropsはv1では存在しない
    };
    await db.recipes.put(v1Doc as unknown as RecipeDoc);

    const loaded = await loadRecipe("rcp_v1");
    expect(loaded).not.toBeNull();
    expect(loaded?.schemaVersion).toBe(CURRENT_SCHEMA_VERSION);
    expect(loaded?.photoCrops).toEqual({});

    const stored = await db.recipes.get("rcp_v1");
    expect(stored?.schemaVersion).toBe(CURRENT_SCHEMA_VERSION);
    expect((stored as unknown as RecipeDoc).photoCrops).toEqual({});
  });
});

describe("loadRecipe: 上位バージョン", () => {
  test("schemaVersion > CURRENTの文書はUnsupportedSchemaErrorをthrowする", async () => {
    const now = new Date().toISOString();
    const futureDoc = {
      schemaVersion: CURRENT_SCHEMA_VERSION + 1,
      id: "rcp_future",
      title: "future recipe",
      createdAt: now,
      updatedAt: now,
      overviewPhotoIds: [],
      palette: [],
      tools: [],
      baseSteps: [],
      parts: [],
    };
    await db.recipes.put(futureDoc as unknown as RecipeDoc);

    await expect(loadRecipe("rcp_future")).rejects.toThrow(
      UnsupportedSchemaError,
    );

    // 書き戻りが起きていないこと（削除も更新もされていない）
    const stored = await db.recipes.get("rcp_future");
    expect(stored?.schemaVersion).toBe(CURRENT_SCHEMA_VERSION + 1);
  });
});

describe("loadRecipe: 破損文書", () => {
  test("parse失敗時はCorruptRecipeErrorをthrowし、自動削除しない", async () => {
    const corrupt = {
      schemaVersion: CURRENT_SCHEMA_VERSION,
      id: "rcp_corrupt",
      // title欠落 → recipeDocSchemaのparseに失敗する
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      overviewPhotoIds: [],
      palette: [],
      tools: [],
      baseSteps: [],
      parts: [],
    };
    await db.recipes.put(corrupt as unknown as RecipeDoc);

    await expect(loadRecipe("rcp_corrupt")).rejects.toThrow(CorruptRecipeError);

    // 自動削除されないことを検証
    const stored = await db.recipes.get("rcp_corrupt");
    expect(stored).toBeDefined();
    expect(stored?.id).toBe("rcp_corrupt");
  });
});
