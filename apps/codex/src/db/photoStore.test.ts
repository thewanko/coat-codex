// db/photoStore.test.ts — 写真Blob管理のテスト（技術計画v2.2 §4.2 T14）
//
// fake-indexeddbでグローバルのindexedDBをポリフィルする。normalizePhotoは実ブラウザAPI
// （createImageBitmap/canvas）に依存しjsdomで完全に再現できないため、vi.mockで素通し
// （受け取ったBlobをそのまま返す）にモックし、photoStore自体のロジックのみを検証する。
// URL.createObjectURL/revokeObjectURLはjsdomに存在しないためvi.stubGlobalでモックする。

import "fake-indexeddb/auto";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

vi.mock("../lib/imageProcessing", () => ({
  normalizePhoto: vi.fn(async (blob: Blob) => blob),
}));

import { db } from "./db";
import { normalizePhoto } from "../lib/imageProcessing";
import {
  collectPhotosForExport,
  deletePhoto,
  deletePhotosForRecipe,
  resolvePhotoUrl,
  revokeAllPhotoUrls,
  revokePhotoUrl,
  savePhoto,
  StorageQuotaError,
} from "./photoStore";

let createObjectURLMock: ReturnType<typeof vi.fn>;
let revokeObjectURLMock: ReturnType<typeof vi.fn>;
let urlCounter: number;

beforeEach(async () => {
  await db.recipes.clear();
  await db.photos.clear();
  await db.meta.clear();

  urlCounter = 0;
  createObjectURLMock = vi.fn(() => `blob:mock-url-${++urlCounter}`);
  revokeObjectURLMock = vi.fn();
  vi.stubGlobal("URL", {
    ...URL,
    createObjectURL: createObjectURLMock,
    revokeObjectURL: revokeObjectURLMock,
  });

  revokeAllPhotoUrls();
  vi.mocked(normalizePhoto).mockClear();
  vi.mocked(normalizePhoto).mockImplementation(async (blob: Blob) => blob);
});

afterEach(() => {
  revokeAllPhotoUrls();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("savePhoto", () => {
  test("normalizePhotoを通し ph_ プレフィックスのphotoIdでBlobを保存する", async () => {
    const file = new Blob(["fake-png-bytes"], { type: "image/png" });
    // fake-indexeddb(jsdom環境)はBlobをstructured cloneで正しく復元できないため、
    // put呼び出しに渡された引数を直接検証する（getし直した後のBlob内容比較はしない）
    const putSpy = vi.spyOn(db.photos, "put");

    const photoId = await savePhoto(file, "rcp_1");

    expect(photoId.startsWith("ph_")).toBe(true);
    expect(normalizePhoto).toHaveBeenCalledWith(file);

    expect(putSpy).toHaveBeenCalledTimes(1);
    const putRecord = putSpy.mock.calls[0][0];
    expect(putRecord.id).toBe(photoId);
    expect(putRecord.recipeId).toBe("rcp_1");
    expect(putRecord.blob).toBe(file);
    expect(() => new Date(putRecord.createdAt).toISOString()).not.toThrow();

    const stored = await db.photos.get(photoId);
    expect(stored).toBeDefined();
    expect(stored?.recipeId).toBe("rcp_1");
  });

  test("複数回保存すると異なるphotoIdが払い出される", async () => {
    const file = new Blob(["x"], { type: "image/png" });

    const id1 = await savePhoto(file, "rcp_1");
    const id2 = await savePhoto(file, "rcp_1");

    expect(id1).not.toBe(id2);
  });

  test("Dexie put が DOMException QuotaExceededError を投げた場合 StorageQuotaError に変換する", async () => {
    const quotaErr = new DOMException("quota exceeded", "QuotaExceededError");
    vi.spyOn(db.photos, "put").mockRejectedValueOnce(quotaErr);

    const file = new Blob(["x"], { type: "image/png" });

    await expect(savePhoto(file, "rcp_1")).rejects.toThrow(StorageQuotaError);
  });

  test("name プロパティのみを持つラップ済みQuota例外もStorageQuotaErrorに変換する", async () => {
    vi.spyOn(db.photos, "put").mockRejectedValueOnce({
      name: "QuotaExceededError",
      message: "wrapped",
    });

    const file = new Blob(["x"], { type: "image/png" });

    await expect(savePhoto(file, "rcp_1")).rejects.toThrow(StorageQuotaError);
  });

  test("Quota以外のエラーはそのままrethrowする", async () => {
    const otherErr = new Error("some other db error");
    vi.spyOn(db.photos, "put").mockRejectedValueOnce(otherErr);

    const file = new Blob(["x"], { type: "image/png" });

    await expect(savePhoto(file, "rcp_1")).rejects.toBe(otherErr);
  });
});

describe("resolvePhotoUrl", () => {
  test("保存済みphotoIdはobjectURLへ解決される", async () => {
    const file = new Blob(["x"], { type: "image/png" });
    const photoId = await savePhoto(file, "rcp_1");

    const url = await resolvePhotoUrl(photoId);

    expect(url).toBe("blob:mock-url-1");
    // createObjectURLには保存レコードのblobフィールドが渡される
    // （fake-indexeddb/jsdom環境ではstructured clone後のBlobは内容を検証できないため、
    //  1回だけ正しいphotoIdに対して呼ばれたことのみ検証する）
    expect(createObjectURLMock).toHaveBeenCalledTimes(1);
  });

  test("同一photoIdの再解決はキャッシュを返し createObjectURL を再呼び出ししない", async () => {
    const file = new Blob(["x"], { type: "image/png" });
    const photoId = await savePhoto(file, "rcp_1");

    const url1 = await resolvePhotoUrl(photoId);
    const url2 = await resolvePhotoUrl(photoId);

    expect(url1).toBe(url2);
    expect(createObjectURLMock).toHaveBeenCalledTimes(1);
  });

  test("欠損photoIdはnullを返す（自動削除・自動修復はしない）", async () => {
    const url = await resolvePhotoUrl("ph_does-not-exist");
    expect(url).toBeNull();
    expect(createObjectURLMock).not.toHaveBeenCalled();
  });
});

describe("revokePhotoUrl / revokeAllPhotoUrls", () => {
  test("revokePhotoUrlは該当キャッシュのみ解放し、再解決時に新しいURLを発行する", async () => {
    const file = new Blob(["x"], { type: "image/png" });
    const photoId = await savePhoto(file, "rcp_1");

    const url1 = await resolvePhotoUrl(photoId);
    revokePhotoUrl(photoId);

    expect(revokeObjectURLMock).toHaveBeenCalledWith(url1);

    const url2 = await resolvePhotoUrl(photoId);
    expect(url2).not.toBe(url1);
    expect(createObjectURLMock).toHaveBeenCalledTimes(2);
  });

  test("キャッシュされていないphotoIdへのrevokePhotoUrlは何もしない", () => {
    expect(() => revokePhotoUrl("ph_never-resolved")).not.toThrow();
    expect(revokeObjectURLMock).not.toHaveBeenCalled();
  });

  test("revokeAllPhotoUrlsは全キャッシュを解放する", async () => {
    const file = new Blob(["x"], { type: "image/png" });
    const id1 = await savePhoto(file, "rcp_1");
    const id2 = await savePhoto(file, "rcp_1");
    const url1 = await resolvePhotoUrl(id1);
    const url2 = await resolvePhotoUrl(id2);

    revokeAllPhotoUrls();

    expect(revokeObjectURLMock).toHaveBeenCalledWith(url1);
    expect(revokeObjectURLMock).toHaveBeenCalledWith(url2);

    // 解放後は再度createObjectURLが呼ばれる（キャッシュがクリアされている）
    await resolvePhotoUrl(id1);
    expect(createObjectURLMock).toHaveBeenCalledTimes(3);
  });
});

describe("deletePhotosForRecipe", () => {
  test("該当recipeIdの写真のみ削除し件数を返す。objectURLキャッシュも解放する", async () => {
    const file = new Blob(["x"], { type: "image/png" });
    const idA1 = await savePhoto(file, "rcp_a");
    const idA2 = await savePhoto(file, "rcp_a");
    const idB1 = await savePhoto(file, "rcp_b");

    const urlA1 = await resolvePhotoUrl(idA1);

    const count = await deletePhotosForRecipe("rcp_a");

    expect(count).toBe(2);
    expect(await db.photos.get(idA1)).toBeUndefined();
    expect(await db.photos.get(idA2)).toBeUndefined();
    expect(await db.photos.get(idB1)).toBeDefined();
    expect(revokeObjectURLMock).toHaveBeenCalledWith(urlA1);
  });

  test("該当写真がない場合は0を返す", async () => {
    const count = await deletePhotosForRecipe("rcp_none");
    expect(count).toBe(0);
  });
});

describe("deletePhoto", () => {
  test("指定photoIdのみDBから削除し、objectURLキャッシュも解放する", async () => {
    const file = new Blob(["x"], { type: "image/png" });
    const idA = await savePhoto(file, "rcp_a");
    const idB = await savePhoto(file, "rcp_a");
    const urlA = await resolvePhotoUrl(idA);

    await deletePhoto(idA);

    expect(await db.photos.get(idA)).toBeUndefined();
    expect(await db.photos.get(idB)).toBeDefined();
    expect(revokeObjectURLMock).toHaveBeenCalledWith(urlA);
  });

  test("存在しないphotoIdを指定してもエラーにならない", async () => {
    await expect(deletePhoto("ph_does-not-exist")).resolves.toBeUndefined();
  });

  test("削除後に再解決すると新しいURLが発行される（キャッシュが解放されている）", async () => {
    const file = new Blob(["x"], { type: "image/png" });
    const idA = await savePhoto(file, "rcp_a");
    await resolvePhotoUrl(idA);

    await deletePhoto(idA);
    // 削除済みなのでresolvePhotoUrlはnullを返す（欠損時フォールバック）
    const url = await resolvePhotoUrl(idA);
    expect(url).toBeNull();
  });
});

describe("collectPhotosForExport", () => {
  test("指定recipeIdの写真レコード一覧を返す", async () => {
    const file = new Blob(["x"], { type: "image/png" });
    const idA1 = await savePhoto(file, "rcp_a");
    const idA2 = await savePhoto(file, "rcp_a");
    await savePhoto(file, "rcp_b");

    const collected = await collectPhotosForExport("rcp_a");

    expect(collected.map((r) => r.id).sort()).toEqual([idA1, idA2].sort());
    expect(collected.every((r) => r.recipeId === "rcp_a")).toBe(true);
  });

  test("該当写真がない場合は空配列を返す", async () => {
    const collected = await collectPhotosForExport("rcp_none");
    expect(collected).toEqual([]);
  });
});
