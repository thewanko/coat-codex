// lib/pendingPaints.ts — pending（未確定）塗料スロットの永続化防止基盤（技術計画v2.2 §2.3/§2.5）
//
// PaintSlotListが新規スロット追加時に発行する一時的なプレースホルダcolorId
// （`col_pending_`+uuid。色未確定のスロットを表す）を検出・除去するための純関数群。
// autosave直前にstripPendingPaintsを適用してpendingスロットが保存されないようにする
// 結線自体はここでは行わない（M4の結線タスクの責務。本ファイルは基盤のみ提供する）。

import type { MixState } from "@coat-codex/recipe-core";

/** pending（未確定）塗料スロットのcolorIdプレフィックス。PaintSlotListのhandleAddSlotと共有する単一情報源 */
export const PENDING_COLOR_PREFIX = "col_pending_";

/** colorIdがpending（未確定）スロットのものかどうかを判定する */
export function isPendingColorId(id: string): boolean {
  return id.startsWith(PENDING_COLOR_PREFIX);
}

/**
 * pendingスロットとその`mix`要素を除去した新しいMixStateを返す（引数は破壊しない）。
 * 除去後のmixはpaints長と整合させ、paints.length <= 1 の場合はnullにする
 * （INV-2: paints≥2 ⇒ mix非null／INV-4: paints≤1 ⇒ mix=null との整合）。
 */
export function stripPendingPaints(state: MixState): MixState {
  const keepIndices: number[] = [];
  const nextPaints = state.paints.filter((paint, index) => {
    const keep = !isPendingColorId(paint.colorId);
    if (keep) keepIndices.push(index);
    return keep;
  });

  if (nextPaints.length <= 1) {
    return { paints: nextPaints, mix: null };
  }

  const currentMix = state.mix;
  const nextMix =
    currentMix === null ? null : keepIndices.map((index) => currentMix[index]);

  return { paints: nextPaints, mix: nextMix };
}
