// logic/cropGeometry.ts — PhotoCropDialogの座標計算を担う純関数群（実装計画B-2）
//
// 全て0〜1正規化座標系で扱う（元画像の実ピクセルサイズに依存しない）。
// PhotoCropDialog（Pointer Events由来の生座標）からはこのモジュールの関数のみを通して
// CropRectを算出させ、DOM/Reactに依存しないユニットテストを可能にする。

import type { CropRect } from "../schema/recipe";

/** クロップ矩形の最小辺長（各辺10%。計画B-2） */
export const MIN_CROP_SIZE = 0.1;

/** cropRectSchemaのEPSILON許容と対にする丸め桁数（保存前に小数6桁へ丸める） */
const ROUND_DECIMALS = 6;

/** 四隅ハンドルの識別子 */
export type ResizeHandle = "nw" | "ne" | "sw" | "se";

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

function round6(value: number): number {
  const factor = 10 ** ROUND_DECIMALS;
  return Math.round(value * factor) / factor;
}

/**
 * 矩形を丸める（保存直前用）。cropRectSchemaのEPSILON許容と併せた二重防御として、
 * 小数6桁に丸めたうえで[0,1]・最小サイズ制約を再度クランプし、常に有効な矩形を返す。
 */
export function roundCropRect(rect: CropRect): CropRect {
  return clampCropRect(
    {
      x: round6(rect.x),
      y: round6(rect.y),
      w: round6(rect.w),
      h: round6(rect.h),
    },
    MIN_CROP_SIZE,
  );
}

/**
 * 矩形を[0,1]内・最小サイズ以上へクランプする。
 * - w,hはminSize以上、1以下
 * - x,yは0以上、(1 - w/h)以下（x+w<=1, y+h<=1を保つ）
 */
export function clampCropRect(rect: CropRect, minSize: number): CropRect {
  const w = clamp(rect.w, minSize, 1);
  const h = clamp(rect.h, minSize, 1);
  const x = clamp(rect.x, 0, 1 - w);
  const y = clamp(rect.y, 0, 1 - h);
  return { x, y, w, h };
}

/**
 * ドラッグ移動: 開始時の矩形startRectに正規化差分(dx, dy)を加え、[0,1]内へクランプする
 * （サイズは変えない。移動のみ）。
 */
export function moveCropRect(
  startRect: CropRect,
  dx: number,
  dy: number,
): CropRect {
  const x = clamp(startRect.x + dx, 0, 1 - startRect.w);
  const y = clamp(startRect.y + dy, 0, 1 - startRect.h);
  return { ...startRect, x, y };
}

/**
 * 四隅ハンドルによるリサイズ: 対角の固定点を基準に、動かした角の位置を
 * (dx, dy)分だけ移動させた新しい矩形を返す。最小サイズ・[0,1]範囲を守る。
 */
export function resizeCropRect(
  startRect: CropRect,
  handle: ResizeHandle,
  dx: number,
  dy: number,
  minSize: number,
): CropRect {
  const left = startRect.x;
  const top = startRect.y;
  const right = startRect.x + startRect.w;
  const bottom = startRect.y + startRect.h;

  let nextLeft = left;
  let nextTop = top;
  let nextRight = right;
  let nextBottom = bottom;

  if (handle === "nw" || handle === "sw") {
    nextLeft = clamp(left + dx, 0, right - minSize);
  } else {
    nextRight = clamp(right + dx, left + minSize, 1);
  }

  if (handle === "nw" || handle === "ne") {
    nextTop = clamp(top + dy, 0, bottom - minSize);
  } else {
    nextBottom = clamp(bottom + dy, top + minSize, 1);
  }

  return {
    x: nextLeft,
    y: nextTop,
    w: nextRight - nextLeft,
    h: nextBottom - nextTop,
  };
}

/** 矢印キー移動量（通常） */
export const ARROW_STEP = 0.01;
/** Shift+矢印キー移動量 */
export const ARROW_STEP_LARGE = 0.05;
