// lib/importRecipe.ts — インポートパイプライン: Dexie書き込み部（技術計画v2.2 §2.7・T30／v1 §1.4-2(d) ST-06）
//
// 3段検証（①ヘッダ検証 → ②migrate → ③フル検証）＋normalizeImport（正規化規則a〜e）の純ロジックは
// @coat-codex/recipe-core の exchange/importPipeline.ts（runImportPipeline）へ移設済み。
// 本ファイルはdataUrl→Blob変換とDexie rwトランザクション書き込みのみを担う。

import { db } from "../db/db";
import type { PhotoRecord } from "../db/db";
import {
  runImportPipeline,
  type RecipeDoc,
  type NormalizeImportDeps,
  type ImportFailure,
  type ImportIssue,
  type ImportFailureReason,
} from "@coat-codex/recipe-core";
import { loadBrandColorsResult } from "./paintPresets";

export type { ImportIssue, ImportFailureReason, ImportFailure };

/** インポート成功結果。書き込み済みの新しいRecipeDocを返す */
export interface ImportSuccess {
  ok: true;
  recipe: RecipeDoc;
}

export type ImportResult = ImportFailure | ImportSuccess;

function failure(
  reason: ImportFailureReason,
  message: string,
  issues: ImportIssue[] = [],
): ImportFailure {
  return { ok: false, reason, message, issues };
}

// ---------------------------------------------------------------------------
// dataUrl → Blob 変換（写真書き込み用）
// ---------------------------------------------------------------------------

/** `data:image/xxx;base64,...`形式のdataUrl文字列をBlobへ変換する */
async function dataUrlToBlob(dataUrl: string): Promise<Blob> {
  const res = await fetch(dataUrl);
  return res.blob();
}

// ---------------------------------------------------------------------------
// importRecipe — 3段検証 → 正規化（recipe-core） → Dexie rwトランザクション書き込み
// ---------------------------------------------------------------------------

/** importRecipeが依存する外部処理をテストから注入できるようにする束 */
export interface ImportRecipeDeps extends NormalizeImportDeps {
  /** dataUrl→Blob変換（省略時はfetch経由の本番実装） */
  dataUrlToBlob: (dataUrl: string) => Promise<Blob>;
}

const defaultImportRecipeDeps: ImportRecipeDeps = {
  loadBrandColorsResult,
  dataUrlToBlob,
};

/**
 * インポートパイプライン本体（§2.7）。JSON文字列を受け取り、3段検証→正規化→
 * Dexie rwトランザクション書き込みまでを行う。
 *
 * 1〜4. runImportPipeline（@coat-codex/recipe-core）: JSON.parse→ヘッダ検証→migrate→
 *       フル検証→normalizeImport（正規化規則a〜e）
 * 5. Dexie rwトランザクションで photos.bulkAdd → recipes.add（失敗時ロールバック）
 */
export async function importRecipe(
  jsonText: string,
  deps: ImportRecipeDeps = defaultImportRecipeDeps,
): Promise<ImportResult> {
  const pipelineResult = await runImportPipeline(jsonText, deps);
  if (!pipelineResult.ok) {
    return pipelineResult;
  }

  const { recipe, photos } = pipelineResult;

  // dataUrl→Blob変換はtxの外（前）で完了させる。deps.dataUrlToBlob（本番実装はfetch）は
  // Dexie管理外のPromiseであり、tx内でawaitするとDexieがtxを自動コミット・失効させ、続く
  // db.photos.bulkAddがTransactionInactiveError（"Transaction has already completed or
  // failed"）になる（Dexieはtxコールバック内で発行されたDexie操作のPromiseチェーンのみを
  // 追跡できるため）。ここでの失敗はDB書き込み前に発生するため、部分書き込みは起こらない。
  const records: PhotoRecord[] = [];
  try {
    for (const photo of photos) {
      records.push({
        id: photo.id,
        recipeId: recipe.id,
        blob: await deps.dataUrlToBlob(photo.dataUrl),
        createdAt: new Date().toISOString(),
      });
    }
  } catch (err) {
    return failure(
      "transaction-failed",
      err instanceof Error ? err.message : "インポートの保存に失敗しました",
    );
  }

  // Dexie rwトランザクション書き込み（失敗時ロールバック）。
  // コールバック内は純Dexie操作のみ（Dexie管理外のPromiseをawaitしない）。
  try {
    await db.transaction("rw", db.recipes, db.photos, async () => {
      if (records.length > 0) {
        await db.photos.bulkAdd(records);
      }
      await db.recipes.add(recipe);
    });
  } catch (err) {
    return failure(
      "transaction-failed",
      err instanceof Error ? err.message : "インポートの保存に失敗しました",
    );
  }

  return { ok: true, recipe };
}
