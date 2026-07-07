// lib/coverComposer.ts — Scriptorium投稿用のcover/thumb画像生成
// （技術計画v1.3 §6-1「1: coverComposerがphotoCropsをcanvas焼込→長辺1600px WebP
// （品質二分探索で200–400KB）＋400pxサムネ」/ §3.2「cover長辺≤1600px・≤450KB／
// thumb長辺≤400px・≤80KB」/ ST-20表）。
//
// canvas 2Dはjsdomで動作しないため、DOM依存の処理（decode/encodeRegion）は
// CoverComposerDepsとして注入可能にし（省略時は既定のブラウザ実装＝canvas）、
// 純関数（computeCropPixelRect / findWebpQualityBlob）はテストから直接検証する。
//
// coverは「crop領域のアスペクト比を保ったまま長辺≤1600pxに縮小」する（固定アスペクトへの
// fitではない）。既存 sns/imageComposer.ts の computeCoverSourceRect は固定アスペクトの
// card用cover配置（destのアスペクトに合わせてsrcを中央クロップ）であり、本関数の要件
// （crop矩形そのもののアスペクトを保って単純に縮小するだけ）とは目的が異なるため再利用しない。
// また encodeFromSource（imageProcessing.ts）はquality 0.9固定のため、品質二分探索を行う
// 本モジュールでは使えず、canvas.toBlob(_, "image/webp", q)を直接呼ぶ。

import { calcTargetSize, decodeToBitmap } from "./imageProcessing";
import type { DecodedImageSource } from "./imageProcessing";
import type { CropRect } from "@coat-codex/recipe-core";

/** coverの長辺上限（px・§3.2） */
export const COVER_MAX_EDGE = 1600;
/** coverのファイルサイズ上限（bytes・§3.2の≤450KBを厳守） */
export const COVER_MAX_BYTES = 450 * 1024;
/** coverの目標サイズ下限（bytes・§6-1の200–400KB目標） */
export const COVER_TARGET_MIN_BYTES = 200 * 1024;
/** coverの目標サイズ上限（bytes・§6-1の200–400KB目標） */
export const COVER_TARGET_MAX_BYTES = 400 * 1024;
/** thumbの長辺上限（px・§3.2） */
export const THUMB_MAX_EDGE = 400;
/** thumbのファイルサイズ上限（bytes・§3.2） */
export const THUMB_MAX_BYTES = 80 * 1024;

/** crop矩形を焼き込む際のソース画素矩形（drawImageの9引数形式のsx/sy/sw/sh相当） */
export interface SourcePixelRect {
  sx: number;
  sy: number;
  sw: number;
  sh: number;
}

/**
 * crop（正規化[0,1]・undefined/nullは全面）をnaturalWidth×naturalHeightの
 * ソース画素矩形へ変換する純関数。
 * 値は[0, natural]にクランプし、sw/shは最低1pxを保証する。
 */
export function computeCropPixelRect(
  naturalWidth: number,
  naturalHeight: number,
  crop?: CropRect | null,
): SourcePixelRect {
  if (crop == null) {
    return { sx: 0, sy: 0, sw: naturalWidth, sh: naturalHeight };
  }

  const rawSx = crop.x * naturalWidth;
  const rawSy = crop.y * naturalHeight;
  const rawSw = crop.w * naturalWidth;
  const rawSh = crop.h * naturalHeight;

  const sx = Math.min(Math.max(0, rawSx), naturalWidth);
  const sy = Math.min(Math.max(0, rawSy), naturalHeight);
  const swClamped = Math.min(Math.max(0, rawSw), naturalWidth - sx);
  const shClamped = Math.min(Math.max(0, rawSh), naturalHeight - sy);

  return {
    sx,
    sy,
    sw: Math.max(1, swClamped),
    sh: Math.max(1, shClamped),
  };
}

/** findWebpQualityBlobの探索条件 */
export interface QualityBudget {
  /** これを超えないことを保証するバイト数上限（厳守） */
  maxBytes: number;
  /** これ未満だとq増加方向を優先する目標下限（省略時は下限チェックなし） */
  minBytes?: number;
  qMin?: number;
  qMax?: number;
  steps?: number;
}

const DEFAULT_Q_MIN = 0.3;
const DEFAULT_Q_MAX = 0.95;
const DEFAULT_STEPS = 7;

/**
 * encode(q)が返すBlobのサイズがmaxBytes以下になる最大のqを二分探索で見つけ、
 * そのBlobを返す。
 * - qMaxでもmaxBytes超なら、可能な限り小さいq（qMinまで下げても超える場合はqMinのBlob）を返す
 * - minBytes指定時、選んだBlobがminBytes未満でかつqを上げれば増やせる場合は上げる方向を優先する
 *   （ただしmaxBytesは厳守する）
 */
export async function findWebpQualityBlob(
  encode: (quality: number) => Promise<Blob>,
  budget: QualityBudget,
): Promise<Blob> {
  const qMin = budget.qMin ?? DEFAULT_Q_MIN;
  const qMax = budget.qMax ?? DEFAULT_Q_MAX;
  const steps = budget.steps ?? DEFAULT_STEPS;
  const { maxBytes, minBytes } = budget;

  // qMin/qMaxの端点を先に確認する（全q超過・全q下限未満の境界ケースを単純化するため）。
  const minBlob = await encode(qMin);
  if (minBlob.size > maxBytes) {
    // qMinでも超過: これ以上下げる余地はないためqMinのBlobを返す
    return minBlob;
  }

  const maxBlob = await encode(qMax);
  if (maxBlob.size <= maxBytes) {
    // qMaxでもmaxBytes以下: 最大品質を採用できる
    if (minBytes !== undefined && maxBlob.size < minBytes) {
      // qMaxでもminBytes未満（=これ以上上げる余地がない）ため、そのまま返す
      return maxBlob;
    }
    return maxBlob;
  }

  // 二分探索: size<=maxBytesを満たす最大のqを探す
  let lowQ = qMin;
  let lowBlob = minBlob;
  let highQ = qMax;

  // 既にqMin/qMaxの2回encodeを消費しているため、残りsteps-2回で二分探索する
  const remainingSteps = Math.max(0, steps - 2);
  for (let i = 0; i < remainingSteps; i += 1) {
    const midQ = (lowQ + highQ) / 2;
    const midBlob = await encode(midQ);
    if (midBlob.size <= maxBytes) {
      lowQ = midQ;
      lowBlob = midBlob;
      if (minBytes !== undefined && midBlob.size < minBytes) {
        // まだ下限未満: qを上げる方向を優先して探索を続ける
        continue;
      }
    } else {
      highQ = midQ;
    }
  }

  return lowBlob;
}

/** composeCoverが必要とする依存（省略時は既定のブラウザ実装＝canvas） */
export interface CoverComposerDeps {
  /** Blobをデコードする（既定: decodeToBitmap） */
  decode?: (blob: Blob) => Promise<DecodedImageSource>;
  /**
   * ソース画像のsrcRect領域をdestWidth×destHeightへ焼き込み、指定qualityでWebPエンコードする。
   * 既定: canvas drawImage(9引数)+toBlob("image/webp", quality)
   */
  encodeRegion?: (
    source: DecodedImageSource,
    src: SourcePixelRect,
    destWidth: number,
    destHeight: number,
    quality: number,
  ) => Promise<Blob>;
}

/** composeCoverの生成結果 */
export interface ComposedCover {
  cover: Blob;
  thumb: Blob;
}

/** canvas 2Dでcrop領域を焼き込みWebPエンコードする既定実装 */
async function defaultEncodeRegion(
  source: DecodedImageSource,
  src: SourcePixelRect,
  destWidth: number,
  destHeight: number,
  quality: number,
): Promise<Blob> {
  const canvas = document.createElement("canvas");
  canvas.width = destWidth;
  canvas.height = destHeight;

  const ctx = canvas.getContext("2d");
  if (!ctx) {
    throw new Error("2d context取得に失敗しました");
  }

  ctx.drawImage(
    source,
    src.sx,
    src.sy,
    src.sw,
    src.sh,
    0,
    0,
    destWidth,
    destHeight,
  );

  return await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (result) => {
        if (result) {
          resolve(result);
        } else {
          reject(new Error("WebPエンコードに失敗しました"));
        }
      },
      "image/webp",
      quality,
    );
  });
}

/**
 * source画像をcrop焼き込みし、cover（長辺≤1600px WebP・品質二分探索で200–400KB目標・
 * ≤450KB厳守）とthumb（長辺≤400px WebP・≤80KB）を生成する（§6-1・§3.2）。
 */
export async function composeCover(
  source: Blob,
  crop: CropRect | null | undefined,
  deps?: CoverComposerDeps,
): Promise<ComposedCover> {
  const decode = deps?.decode ?? decodeToBitmap;
  const encodeRegion = deps?.encodeRegion ?? defaultEncodeRegion;

  const img = await decode(source);
  // DecodedImageSource（ImageBitmap|HTMLImageElement）はwidth/heightのみが両構成要素に
  // 共通するプロパティ（naturalWidth/naturalHeightはHTMLImageElement専用でImageBitmapには
  // 存在しないため使えない。既存imageProcessing.tsの使い方に合わせる）。
  const naturalWidth = img.width;
  const naturalHeight = img.height;

  const srcRect = computeCropPixelRect(naturalWidth, naturalHeight, crop);

  const coverTarget = calcTargetSize(srcRect.sw, srcRect.sh, COVER_MAX_EDGE);
  const cover = await findWebpQualityBlob(
    (q) => encodeRegion(img, srcRect, coverTarget.width, coverTarget.height, q),
    { maxBytes: COVER_TARGET_MAX_BYTES, minBytes: COVER_TARGET_MIN_BYTES },
  );

  const thumbTarget = calcTargetSize(srcRect.sw, srcRect.sh, THUMB_MAX_EDGE);
  const thumb = await findWebpQualityBlob(
    (q) => encodeRegion(img, srcRect, thumbTarget.width, thumbTarget.height, q),
    { maxBytes: THUMB_MAX_BYTES },
  );

  return { cover, thumb };
}
