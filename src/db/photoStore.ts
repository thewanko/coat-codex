// db/photoStore.ts — 写真Blob管理（技術計画v2.2 §4.2 T14）
//
// savePhoto（T13 normalizePhoto経由でBlob保存）・resolvePhotoUrl（objectURL解決・
// 欠損時null→UIプレースホルダ。§2.6「photoId欠損時フォールバック」）・レシピ削除時GC・
// エクスポート用収集を提供する。QuotaExceededError系はStorageQuotaErrorへ変換する。

import { db, type PhotoRecord } from "./db";
import { normalizePhoto } from "../lib/imageProcessing";

/**
 * 保存時にQuotaExceeded系例外（DOMException.name === "QuotaExceededError"、または
 * Dexieがラップした同種例外）を捕捉した場合にthrowする。i18nキーはmessageKeyプロパティで
 * 保持し、UI側でt(messageKey)してToast表示する（errors.storageQuota）。
 */
export class StorageQuotaError extends Error {
  readonly messageKey = "errors.storageQuota";

  constructor() {
    super("容量不足です");
    this.name = "StorageQuotaError";
  }
}

/** DOMException/DexieのエラーがQuotaExceeded系かどうかを判定する */
function isQuotaExceededError(err: unknown): boolean {
  if (err instanceof DOMException && err.name === "QuotaExceededError") {
    return true;
  }
  // Dexieはbulk操作等でエラーをラップすることがあるため、nameプロパティのみで判定する
  // （instanceof DOMExceptionが成立しないラップ済み例外にも対応）
  if (
    typeof err === "object" &&
    err !== null &&
    "name" in err &&
    (err as { name?: unknown }).name === "QuotaExceededError"
  ) {
    return true;
  }
  return false;
}

/** resolvePhotoUrlが生成したobjectURLのキャッシュ（同一photoIdの再解決はここから返す） */
const objectUrlCache = new Map<string, string>();

/**
 * 写真を保存する。T13 normalizePhotoで正規化したBlobをphotosテーブルへputし、
 * `ph_`+crypto.randomUUID()の新規photoIdを返す。mimeフィールドは持たない（Blob.typeが正。§2.6）。
 */
export async function savePhoto(file: Blob, recipeId: string): Promise<string> {
  const normalized = await normalizePhoto(file);
  const id = `ph_${crypto.randomUUID()}`;
  const record: PhotoRecord = {
    id,
    recipeId,
    blob: normalized,
    createdAt: new Date().toISOString(),
  };

  try {
    await db.photos.put(record);
  } catch (err) {
    if (isQuotaExceededError(err)) {
      throw new StorageQuotaError();
    }
    throw err;
  }

  return id;
}

/**
 * photoIdからBlobを取得しobjectURLへ解決する。同一photoIdの再解決はキャッシュを返す。
 * 欠損時はnullを返す（自動削除・自動修復はしない。UIは「写真なし」プレースホルダを表示。§2.6）。
 */
export async function resolvePhotoUrl(photoId: string): Promise<string | null> {
  const cached = objectUrlCache.get(photoId);
  if (cached !== undefined) {
    return cached;
  }

  const record = await db.photos.get(photoId);
  if (record === undefined) {
    return null;
  }

  const url = URL.createObjectURL(record.blob);
  objectUrlCache.set(photoId, url);
  return url;
}

/** 指定photoIdのobjectURLキャッシュを解放する。キャッシュがなければ何もしない */
export function revokePhotoUrl(photoId: string): void {
  const cached = objectUrlCache.get(photoId);
  if (cached === undefined) {
    return;
  }
  URL.revokeObjectURL(cached);
  objectUrlCache.delete(photoId);
}

/** 生成済みの全objectURLキャッシュを解放する */
export function revokeAllPhotoUrls(): void {
  for (const url of objectUrlCache.values()) {
    URL.revokeObjectURL(url);
  }
  objectUrlCache.clear();
}

/**
 * レシピ削除時のGC。recipeIdインデックスで該当写真を検索し、DBから削除しつつ
 * objectURLキャッシュも解放する。削除件数を返す。
 */
export async function deletePhotosForRecipe(recipeId: string): Promise<number> {
  const records = await db.photos.where("recipeId").equals(recipeId).toArray();

  for (const record of records) {
    revokePhotoUrl(record.id);
  }

  await db.photos.where("recipeId").equals(recipeId).delete();

  return records.length;
}

/** エクスポート用: 指定レシピに紐づく写真レコード一覧を収集する（§2.2） */
export async function collectPhotosForExport(
  recipeId: string,
): Promise<PhotoRecord[]> {
  return db.photos.where("recipeId").equals(recipeId).toArray();
}
