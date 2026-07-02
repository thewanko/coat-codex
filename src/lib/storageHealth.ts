// lib/storageHealth.ts — ストレージ保全API（技術計画v2.2 §3.5・§2.7・D-2・T15）
//
// navigator.storage（persist/persisted/estimate）のラッパー、meta（db.ts）への記録、
// バックアップ鮮度・リマインダー表示条件の純関数を提供する。UIやReactには依存しない。

import { db } from "../db/db";

// ---------------------------------------------------------------------------
// ブラウザAPIラッパー（navigator.storage非対応環境は undefined を返す。例外を投げない）
// ---------------------------------------------------------------------------

/** navigator.storage.persist() のラッパー。API非対応環境ではundefinedを返す（§3.5・T15） */
export async function requestPersist(): Promise<boolean | undefined> {
  if (typeof navigator === "undefined" || !navigator.storage?.persist) {
    return undefined;
  }
  return navigator.storage.persist();
}

/** navigator.storage.persisted() のラッパー。API非対応環境ではundefinedを返す（§3.5・T15） */
export async function checkPersisted(): Promise<boolean | undefined> {
  if (typeof navigator === "undefined" || !navigator.storage?.persisted) {
    return undefined;
  }
  return navigator.storage.persisted();
}

/** navigator.storage.estimate() のラッパー。API非対応環境ではundefinedを返す（§3.5・T15） */
export async function estimateUsage(): Promise<
  { usage: number; quota: number } | undefined
> {
  if (typeof navigator === "undefined" || !navigator.storage?.estimate) {
    return undefined;
  }
  const { usage, quota } = await navigator.storage.estimate();
  return { usage: usage ?? 0, quota: quota ?? 0 };
}

// ---------------------------------------------------------------------------
// meta記録（db.tsのmetaテーブル。D-2の3キー: persist / recipeExport:<recipeId> /
// reminderSnoozedUntil）
// ---------------------------------------------------------------------------

const RECIPE_EXPORT_KEY_PREFIX = "recipeExport:";
const REMINDER_SNOOZE_KEY = "reminderSnoozedUntil";
const PERSIST_KEY = "persist";

/** meta.persist の値形状（§2.7・D-2） */
export interface PersistRecord {
  requestedAt: string;
  granted: boolean;
}

/** persist()要求結果をmeta.persistへ記録する（§3.5） */
export async function recordPersistResult(
  granted: boolean,
  requestedAt: string,
): Promise<void> {
  await db.meta.put({ key: PERSIST_KEY, value: { requestedAt, granted } });
}

/** meta.persistを読み出す。未記録ならundefined */
export async function readPersistRecord(): Promise<PersistRecord | undefined> {
  const record = await db.meta.get(PERSIST_KEY);
  if (record === undefined) {
    return undefined;
  }
  return record.value as PersistRecord;
}

/** 当該レシピの最終JSONエクスポート日時をmeta.recipeExport:<recipeId>へ記録する（§3.5） */
export async function recordRecipeExport(
  recipeId: string,
  exportedAt: string,
): Promise<void> {
  await db.meta.put({
    key: `${RECIPE_EXPORT_KEY_PREFIX}${recipeId}`,
    value: exportedAt,
  });
}

/** 当該レシピの最終JSONエクスポート日時を読み出す。未記録ならundefined */
export async function readRecipeExport(
  recipeId: string,
): Promise<string | undefined> {
  const record = await db.meta.get(`${RECIPE_EXPORT_KEY_PREFIX}${recipeId}`);
  if (record === undefined) {
    return undefined;
  }
  return record.value as string;
}

/**
 * 全レシピの最終エクスポート日時を`recipeExport:`プレフィックス走査で収集する
 * （§3.5「全レシピの`recipeExport:*`の最大値」の算出に使用）。
 * 戻り値はrecipeId→exportedAtのマップ。
 */
export async function readAllRecipeExports(): Promise<Record<string, string>> {
  const records = await db.meta
    .where("key")
    .startsWith(RECIPE_EXPORT_KEY_PREFIX)
    .toArray();

  const result: Record<string, string> = {};
  for (const record of records) {
    const recipeId = record.key.slice(RECIPE_EXPORT_KEY_PREFIX.length);
    result[recipeId] = record.value as string;
  }
  return result;
}

/** リマインダーを指定日時までスヌーズする（§3.5「あとで」7日スヌーズ） */
export async function snoozeReminder(until: string): Promise<void> {
  await db.meta.put({ key: REMINDER_SNOOZE_KEY, value: until });
}

/** リマインダーのスヌーズ期限を読み出す。未設定ならundefined */
export async function readReminderSnooze(): Promise<string | undefined> {
  const record = await db.meta.get(REMINDER_SNOOZE_KEY);
  if (record === undefined) {
    return undefined;
  }
  return record.value as string;
}

// ---------------------------------------------------------------------------
// 純関数（now等は引数で受ける。Date.now()を関数内で呼ばない）
// ---------------------------------------------------------------------------

/**
 * 当該レシピがバックアップ済みかどうかを判定する（§3.5「未バックアップレシピ」の否定）。
 * exportedAtが存在し、かつ updatedAt 以上であればバックアップ済み。
 */
export function isRecipeBackedUp(
  updatedAt: string,
  exportedAt: string | undefined,
): boolean {
  if (exportedAt === undefined) {
    return false;
  }
  return exportedAt >= updatedAt;
}

/**
 * エクスポートリマインダーを表示すべきかどうかを判定する（§3.5リマインダー対象条件）。
 * 未バックアップ かつ（(a)一度もエクスポートなし または (b)exportedAtからnowまで14日以上経過）
 * かつ スヌーズ中でない（now < snoozedUntil なら抑止）。
 */
export function shouldShowExportReminder(args: {
  updatedAt: string;
  exportedAt?: string;
  snoozedUntil?: string;
  now: string;
}): boolean {
  const { updatedAt, exportedAt, snoozedUntil, now } = args;

  if (isRecipeBackedUp(updatedAt, exportedAt)) {
    return false;
  }

  const staleEnough =
    exportedAt === undefined || daysBetween(exportedAt, now) >= 14;
  if (!staleEnough) {
    return false;
  }

  if (snoozedUntil !== undefined && now < snoozedUntil) {
    return false;
  }

  return true;
}

/** exportedAtからnowまでの経過日数（ミリ秒差分から算出。境界は等号込みで扱う） */
function daysBetween(from: string, to: string): number {
  const MS_PER_DAY = 24 * 60 * 60 * 1000;
  const diffMs = new Date(to).getTime() - new Date(from).getTime();
  return diffMs / MS_PER_DAY;
}

/**
 * persist()を要求してよいかどうかを判定する（§3.5「meta.persist未記録なら要求してよい」＋
 * 「未許可のままの場合は再要求してよい」）。
 * 未記録、または記録ありでもgranted=falseかつ現在の実許可状態(persisted)がtrueでなければtrue。
 */
export function shouldRequestPersist(
  record: PersistRecord | undefined,
  persisted: boolean | undefined,
): boolean {
  if (record === undefined) {
    return true;
  }
  return record.granted === false && persisted !== true;
}
