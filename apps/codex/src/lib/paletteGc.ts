// lib/paletteGc.ts — 未使用palette色の自動GC（技術計画v2.3 §3.3・§4.2 M4必須事項③）
//
// Setupの使用カラー先行登録（PaletteEditor）廃止に伴い、色は工程のPaintPickerからのみ
// 追加される。参照0になったpalette色は保存時にこのモジュールで自動的に除去する
// （custom色のチップ写真Blobの回収はremovedChipPhotoIdsを介して呼び出し側=useRecipeStoreが行う）。
//
// 参照同一性（M4必須事項②）: 除去対象が1件もない場合は引数のdocをそのまま返す
// （updater規約と同様、不要な再生成でPaintPicker等のvalue再同期を巻き戻さないため）。

import type { RecipeDoc } from "../models/recipe";

/** baseSteps・全parts[].stepsを横断した全Stepの配列を返す（内部ヘルパー） */
function allSteps(doc: RecipeDoc): RecipeDoc["baseSteps"] {
  return [...doc.baseSteps, ...doc.parts.flatMap((part) => part.steps)];
}

export interface GcPaletteResult {
  /** GC後の文書。除去対象が無ければ引数と同一参照 */
  doc: RecipeDoc;
  /** 除去したpalette色のうちchipPhotoIdが非nullだったもののID一覧（Blob削除は呼び出し側の責務） */
  removedChipPhotoIds: string[];
}

/**
 * doc.palette のうち、baseSteps・全parts[].stepsのpaints[].colorIdから
 * どこからも参照されていない色を除去した新しい文書を返す（純関数）。
 * 参照ありの色は元の配列順を維持したまま保持する。除去が無い場合はdocを
 * そのまま返す（参照同一性）。
 */
export function gcUnusedPaletteColors(doc: RecipeDoc): GcPaletteResult {
  const usedColorIds = new Set<string>();
  for (const step of allSteps(doc)) {
    for (const paint of step.paints) {
      usedColorIds.add(paint.colorId);
    }
  }

  const removedChipPhotoIds: string[] = [];
  const nextPalette = doc.palette.filter((color) => {
    if (usedColorIds.has(color.id)) {
      return true;
    }
    if (color.chipPhotoId !== null) {
      removedChipPhotoIds.push(color.chipPhotoId);
    }
    return false;
  });

  if (nextPalette.length === doc.palette.length) {
    return { doc, removedChipPhotoIds: [] };
  }

  return {
    doc: { ...doc, palette: nextPalette },
    removedChipPhotoIds,
  };
}
