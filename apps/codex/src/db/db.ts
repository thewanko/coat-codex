// db/db.ts — Dexieテーブル定義（技術計画v2.2 §2.7）
//
// recipes / photos / meta の3テーブル。version()はインデックス構造の変更専用で、
// 文書内容の形状変更はRecipeDocのschemaVersion＋lazy migration（recipeStore.ts）で行う
// （全レコード一括書き換えのupgrade()は使わない。§2.7）。

import Dexie, { type Table } from "dexie";
import type { RecipeDoc } from "../models/recipe";

/** recipesテーブルのレコード形状。RecipeDoc（models/recipe.ts）をそのまま保存する */
export type RecipeRecord = RecipeDoc;

/**
 * photosテーブルのレコード形状。
 * mimeフィールドは持たない（Blob.typeで取得。アップロード時正規化でpng/jpeg/webpのいずれかに
 * 保証される。§2.6）
 */
export interface PhotoRecord {
  id: string;
  recipeId: string;
  blob: Blob;
  createdAt: string;
}

/**
 * metaテーブルのレコード形状（§2.7・D-2）。レシピ文書に属さないアプリ状態のKVストア。
 * キーは `persist` / `recipeExport:<recipeId>` / `reminderSnoozedUntil` の3種のみ（§2.7・§3.5）。
 */
export interface MetaRecord {
  key: string;
  value: string | { requestedAt: string; granted: boolean };
}

class CoatCodexDB extends Dexie {
  recipes!: Table<RecipeRecord, string>;
  photos!: Table<PhotoRecord, string>;
  meta!: Table<MetaRecord, string>;

  constructor() {
    super("coat-codex");
    this.version(1).stores({
      recipes: "id, updatedAt", // 主キー: id / 一覧ソート用インデックス: updatedAt
      photos: "id, recipeId", // 主キー: id / レシピ削除GC・エクスポート収集用: recipeId
      meta: "key", // 主キー: key（アプリ状態のKVストア）
    });
  }
}

export const db = new CoatCodexDB();
