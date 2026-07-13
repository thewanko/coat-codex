// db/toolStore.test.ts — ツールライブラリCRUDと version(1)→(2) 昇格のテスト
// （技術計画v2.6 §2.7・§2.8）
//
// fake-indexeddbでグローバルのindexedDBをポリフィルし、Dexie(db.ts)を実DBのように動作させる。

import "fake-indexeddb/auto";
import Dexie from "dexie";
import { beforeEach, describe, expect, test } from "vitest";
import { db } from "./db";
import {
  deleteUserTool,
  findUserToolByName,
  listUserTools,
  registerUserTool,
  toolNameKey,
  updateUserToolTags,
} from "./toolStore";

beforeEach(async () => {
  await db.recipes.clear();
  await db.photos.clear();
  await db.meta.clear();
  await db.userTools.clear();
});

describe("toolNameKey", () => {
  test("NFC正規化・trim・小文字化を行う", () => {
    expect(toolNameKey("  Brush ")).toBe("brush");
    expect(toolNameKey("筆")).toBe(toolNameKey("筆"));
  });
});

describe("CRUD往復", () => {
  test("register→list（name昇順）→updateUserToolTags→get反映→delete→list空", async () => {
    await registerUserTool({ name: "スポンジ" });
    await registerUserTool({ name: "エアブラシ" });
    await registerUserTool({ name: "筆" });

    const listed = await listUserTools();
    const names = listed.map((tool) => tool.name);
    const expectedOrder = [...names].sort((a, b) => a.localeCompare(b));
    expect(names).toEqual(expectedOrder);
    expect(listed).toHaveLength(3);

    const target = listed.find((tool) => tool.name === "筆");
    expect(target).toBeDefined();
    if (!target) throw new Error("unreachable");

    await updateUserToolTags(target.id, ["細筆", "面相筆"]);
    const found = await findUserToolByName("筆");
    expect(found?.tags).toEqual(["細筆", "面相筆"]);

    await deleteUserTool(target.id);
    const afterDelete = await listUserTools();
    expect(afterDelete.map((tool) => tool.name)).not.toContain("筆");

    await deleteUserTool((await findUserToolByName("スポンジ"))!.id);
    await deleteUserTool((await findUserToolByName("エアブラシ"))!.id);
    expect(await listUserTools()).toEqual([]);
  });
});

describe("register重複", () => {
  test.each([
    ["筆 ", "筆"],
    ["Brush", "brush"],
    ["ガラス棒", "ガラス棒"], // NFC差（結合文字カ+濁点 → ガ の正規化）
  ])(
    "同名（%s / %s）は created:false・既存toolを返し行数増えない",
    async (a, b) => {
      const first = await registerUserTool({ name: a });
      expect(first.created).toBe(true);

      const second = await registerUserTool({ name: b });
      expect(second.created).toBe(false);
      expect(second.tool.id).toBe(first.tool.id);

      const listed = await listUserTools();
      expect(listed).toHaveLength(1);
    },
  );

  test("空文字・空白のみのnameはthrowする", async () => {
    await expect(registerUserTool({ name: "" })).rejects.toThrow();
    await expect(registerUserTool({ name: "   " })).rejects.toThrow();
    expect(await db.userTools.count()).toBe(0);
  });
});

describe("updatedAt更新", () => {
  test("updateUserToolTagsでupdatedAtが進む", async () => {
    const { tool } = await registerUserTool({ name: "筆" });
    await new Promise((resolve) => setTimeout(resolve, 2));

    await updateUserToolTags(tool.id, ["新タグ"]);
    const found = await findUserToolByName("筆");
    expect(found).toBeDefined();
    expect(found!.updatedAt).not.toBe(tool.updatedAt);
    expect(new Date(found!.updatedAt).getTime()).toBeGreaterThan(
      new Date(tool.updatedAt).getTime(),
    );
  });
});

describe("version(1)→version(2)昇格", () => {
  test("version(1)相当のDBに既存データを入れた後、本番dbで開き直しても無傷＋userToolsが使える", async () => {
    // 本番db singletonへの最初のアクセス前にv1セットアップを終える必要があるため、
    // このテストケースの冒頭でのみ別インスタンスを作りcloseする。
    // 他のdescribeブロックのbeforeEachで既に本番dbはopen済みなので、いったんcloseする。
    await db.close();

    class LegacyDB extends Dexie {
      constructor() {
        super("coat-codex");
        this.version(1).stores({
          recipes: "id, updatedAt",
          photos: "id, recipeId",
          meta: "key",
        });
      }
    }

    const legacyDb = new LegacyDB();
    await legacyDb.open();

    const recipeRow = {
      id: "rcp_legacy",
      title: "legacy recipe",
      schemaVersion: 1,
      updatedAt: new Date().toISOString(),
    };
    const photoRow = { id: "ph_legacy", recipeId: "rcp_legacy" };
    const metaRow = {
      key: "reminderSnoozedUntil",
      value: "2026-01-01T00:00:00.000Z",
    };

    await legacyDb.table("recipes").put(recipeRow);
    await legacyDb.table("photos").put(photoRow);
    await legacyDb.table("meta").put(metaRow);

    legacyDb.close();

    // 本番db（version(1)+version(2)を宣言済みのsingleton）で開き直す。
    await db.open();

    const storedRecipe = await db.recipes.get("rcp_legacy");
    const storedPhoto = await db.photos.get("ph_legacy");
    const storedMeta = await db.meta.get("reminderSnoozedUntil");
    expect(storedRecipe).toEqual(recipeRow);
    expect(storedPhoto).toEqual(photoRow);
    expect(storedMeta).toEqual(metaRow);

    const { created } = await registerUserTool({ name: "昇格後ツール" });
    expect(created).toBe(true);
    const listed = await listUserTools();
    expect(listed.map((tool) => tool.name)).toContain("昇格後ツール");

    // 後続テストのbeforeEachが期待する状態へ戻す。
    await db.recipes.clear();
    await db.photos.clear();
    await db.meta.clear();
    await db.userTools.clear();
  });
});
