// components/common/croppedPhotoStyle.ts — CroppedPhotoの数値計算を担う純関数
// （実装計画B-3。react-refresh/only-export-components対応のためCroppedPhoto.tsxから分離。
// partSwatch.tsの前例に倣う）
//
// 2段構造のCSS coverでクロップ矩形（models/recipe.ts CropRect。元画像に対する0〜1正規化矩形）を
// 表示に反映するための、cropBox（中間要素）・img（実画像）それぞれへ適用するインラインstyleを
// 算出する。詳細な導出根拠はcomputeCroppedPhotoStyleのコメントを参照。

import type { CSSProperties } from "react";
import type { CropRect } from "../../models/recipe";

export interface NaturalSize {
  width: number;
  height: number;
}

export interface CroppedPhotoStyle {
  cropBoxStyle: CSSProperties;
  imgStyle: CSSProperties;
}

/**
 * クロップ矩形と元画像の実寸から、cropBox（中間要素）・img（実画像）それぞれに適用する
 * インラインstyleを算出する純関数。
 *
 * - CA（クロップ領域の実アスペクト） = (crop.w * naturalW) / (crop.h * naturalH)
 * - cropBoxはaspect-ratio: CAでラッパーをcover（min-width/height: 100%）
 * - imgはcropBox基準で width: 100%/crop.w・height: 100%/crop.h・
 *   left: -100%*crop.x/crop.w・top: -100%*crop.y/crop.h に配置する
 *   （imgボックス自体のアスペクトはCA*(crop.h/crop.w) = naturalW/naturalH = 元画像と同一になり、
 *   無歪みのままクロップ領域がcropBoxを過不足なく満たす）
 */
export function computeCroppedPhotoStyle(
  crop: CropRect,
  naturalSize: NaturalSize,
): CroppedPhotoStyle {
  const cropAspect =
    (crop.w * naturalSize.width) / (crop.h * naturalSize.height);

  const cropBoxStyle: CSSProperties = {
    position: "absolute",
    top: "50%",
    left: "50%",
    transform: "translate(-50%, -50%)",
    aspectRatio: `${cropAspect}`,
    minWidth: "100%",
    minHeight: "100%",
  };

  const imgStyle: CSSProperties = {
    position: "absolute",
    width: `calc(100% / ${crop.w})`,
    height: `calc(100% / ${crop.h})`,
    left: `calc(-100% * ${crop.x} / ${crop.w})`,
    top: `calc(-100% * ${crop.y} / ${crop.h})`,
    maxWidth: "none",
  };

  return { cropBoxStyle, imgStyle };
}
