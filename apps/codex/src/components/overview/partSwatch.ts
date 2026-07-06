// components/overview/partSwatch.ts — パーツ使用カラーのスウォッチhex解決（モバイル2段目）
//
// PartCard.tsxのモバイル3段組2段目（使用カラーの四角スウォッチ）から利用する純関数。
// react-refresh/only-export-components（コンポーネントファイルは非コンポーネントをexportしない）
// 対応のため独立ファイルに分離（同ディレクトリのexportSheetDrag.tsに倣う）。

import type { RecipeDoc, Step } from "@coat-codex/recipe-core";

/** モバイル2段目スウォッチの表示上限。超過分は「+N」で丸める */
export const SWATCH_LIMIT = 8;

/**
 * パーツで使用しているカラーのhexを出現順に重複除去して解決する（モバイル2段目スウォッチ用）。
 * - part.steps[].paints の colorId を出現順に走査し、初出のみ採用
 * - palette から hex を解決できない（id不在 or hexがnull）colorIdはスキップ
 * - 上限SWATCH_LIMIT件。返り値は最大SWATCH_LIMIT件のhex配列
 * - overflowCount（超過数。0なら「+N」表示なし）を併せて返す
 */
export function resolveSwatchHexes(
  steps: Step[],
  palette: RecipeDoc["palette"],
): { hexes: string[]; overflowCount: number } {
  const hexById = new Map<string, string>();
  for (const color of palette) {
    if (color.hex !== null) {
      hexById.set(color.id, color.hex);
    }
  }

  const seen = new Set<string>();
  const resolved: string[] = [];
  for (const step of steps) {
    for (const paint of step.paints) {
      if (seen.has(paint.colorId)) {
        continue;
      }
      seen.add(paint.colorId);
      const hex = hexById.get(paint.colorId);
      if (hex !== undefined) {
        resolved.push(hex);
      }
    }
  }

  const hexes = resolved.slice(0, SWATCH_LIMIT);
  const overflowCount = Math.max(0, resolved.length - SWATCH_LIMIT);
  return { hexes, overflowCount };
}
