// components/home/duplicateRecipe.ts — レシピ複製（技術計画v2.2 T33: RecipeCardメニュー「複製」）
//
// reassignRecipeIds（lib/importRecipe.ts・T30）で全ID新規採番・参照リマップした複製文書を作り、
// 当該レシピのphotosもphotoIdMapに沿って新IDで複製する（Blobはそのままコピー。§2.6）。
// Dexie rwトランザクションでrecipes.add＋photos.bulkAddをまとめ、失敗時はロールバックする
// （importRecipeの書き込み方針と同一）。

import { db, type PhotoRecord } from "../../db/db";
import { collectPhotosForExport } from "../../db/photoStore";
import { reassignRecipeIds } from "../../lib/importRecipe";
import type { RecipeDoc } from "@coat-codex/recipe-core";

/**
 * 指定レシピを複製する。新しいRecipeDoc（新ID・updatedAt=now）を返す。
 * 複製後のtitleは呼び出し側の意図（「（コピー）」等のsuffix付与）に委ねず、元タイトルを
 * そのまま引き継ぐ（reassignRecipeIdsはtitleを変更しないため、必要な場合は呼び出し側で
 * 返り値のrecipeを追加更新すること）。
 */
export async function duplicateRecipe(
  sourceRecipe: RecipeDoc,
): Promise<RecipeDoc> {
  const { recipe: reassigned, photoIdMap } = reassignRecipeIds(sourceRecipe);
  const now = new Date().toISOString();
  const newRecipe: RecipeDoc = { ...reassigned, updatedAt: now };

  await db.transaction("rw", db.recipes, db.photos, async () => {
    // 読み取り（写真一覧）をrwトランザクション内へ移動し、書き込みとread-writeスナップショットを
    // 共有する（tx外で読むと、読み取り〜書き込みの間に別操作が割り込みうる。M5レビューRound1修正4）。
    const sourcePhotos = await collectPhotosForExport(sourceRecipe.id);

    if (sourcePhotos.length > 0) {
      const records: PhotoRecord[] = sourcePhotos
        .filter((photo) => photoIdMap.has(photo.id))
        .map((photo) => {
          const newId = photoIdMap.get(photo.id);
          if (newId === undefined) {
            throw new Error(
              `duplicateRecipe: photoId ${photo.id} のリマップ先が見つかりません`,
            );
          }
          return {
            id: newId,
            recipeId: newRecipe.id,
            blob: photo.blob,
            createdAt: now,
          };
        });
      if (records.length > 0) {
        await db.photos.bulkAdd(records);
      }
    }
    await db.recipes.add(newRecipe);
  });

  return newRecipe;
}
