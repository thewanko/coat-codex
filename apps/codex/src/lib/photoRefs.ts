// lib/photoRefs.ts — 文書内で参照されている写真Blob（step/overview）のID集合抽出（T49）
//
// overviewPhotoIds・baseSteps[].photoId・parts[].steps[].photoIdを集約する純関数。
// 工程削除（handleStepDelete）・photoCrops GC（gcUnusedPhotoCrops）双方から共通利用する。

import type { RecipeDoc } from "@coat-codex/recipe-core";

/**
 * doc内で参照されている写真（overviewPhotoIds＋baseSteps/parts全stepのphotoId）のID集合を返す。
 * photoIdがnullのstepは除外する。
 *
 * 注意: palette[].chipPhotoId（塗料チップ写真）は意図的に含めない＝この集合はstep/overview
 * 写真限定であり、chip写真の削除判定への流用は禁止（chip写真は別UUID空間のため実害は
 * ないが、誤用を防ぐため明記する）。
 */
export function collectReferencedPhotoIds(doc: RecipeDoc): Set<string> {
  const referencedPhotoIds = new Set<string>(doc.overviewPhotoIds);
  for (const step of [
    ...doc.baseSteps,
    ...doc.parts.flatMap((part) => part.steps),
  ]) {
    if (step.photoId !== null) {
      referencedPhotoIds.add(step.photoId);
    }
  }
  return referencedPhotoIds;
}
