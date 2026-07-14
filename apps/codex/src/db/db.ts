// db/db.ts — Dexieテーブル定義（技術計画v2.6 §2.7）
//
// version()はインデックス構造の変更・新規テーブル追加専用（v2.6: userTools追加のため
// version(2)を追加）。文書内容の形状変更はRecipeDocのschemaVersion＋lazy migration
// （recipeStore.ts）で行う（全レコード一括書き換えのupgrade()は使わない。§2.7）。
// この使い分けは不変: インデックス構造変更＋テーブル追加＝version() ／
// 文書内容の形状変更＝schemaVersion。

import Dexie, { type Table } from "dexie";
import type { RecipeDoc } from "@coat-codex/recipe-core";

/** recipesテーブルのレコード形状。RecipeDoc（@coat-codex/recipe-core）をそのまま保存する */
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

/**
 * userToolsテーブルのレコード形状（v2.6新設・§2.8）。
 * レシピ横断でユーザーが使い回すツール（筆・スポンジ等）の端末ローカルライブラリ。
 * idは `utool_${crypto.randomUUID()}`（doc.tools側の `tool_` プレフィックスと
 * 衝突しないよう区別する）。
 */
export interface UserToolRecord {
  id: string;
  name: string;
  note: string | null;
  tags: string[];
  createdAt: string;
  updatedAt: string;
}

class CoatCodexDB extends Dexie {
  recipes!: Table<RecipeRecord, string>;
  photos!: Table<PhotoRecord, string>;
  meta!: Table<MetaRecord, string>;
  userTools!: Table<UserToolRecord, string>; // v2.6追加（§2.8）

  constructor() {
    super("coat-codex");
    this.version(1).stores({
      recipes: "id, updatedAt", // 主キー: id / 一覧ソート用インデックス: updatedAt
      photos: "id, recipeId", // 主キー: id / レシピ削除GC・エクスポート収集用: recipeId
      meta: "key", // 主キー: key（アプリ状態のKVストア）
    });
    this.version(2).stores({
      userTools: "id, updatedAt", // 主キー: id / 一覧ソート用インデックス: updatedAt（§2.8）
    });
  }
}

export const db = new CoatCodexDB();
