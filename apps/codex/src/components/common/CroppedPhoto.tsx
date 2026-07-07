// components/common/CroppedPhoto.tsx — 非破壊クロップ矩形を反映した写真表示共通部品
// （実装計画B-3 CroppedPhoto）
//
// 2段構造のCSS coverでクロップ矩形（@coat-codex/recipe-core CropRect。元画像に対する0〜1正規化矩形）を
// 表示に反映する。ラッパー（className経由で既存サイトの寸法指定を受ける）は
// position: relative; overflow: hiddenのまま、中間要素cropBoxをクロップ領域の実アスペクトで
// ラッパーをcoverさせ、その内側にimgをクロップ領域がcropBoxを正確に満たす無歪みサイズ・位置で
// 配置する（数値導出はcomputeCroppedPhotoStyle。詳細は同関数のコメント参照）。
//
// crop未設定（null/undefined）時は現行同一の`object-fit: cover`シンプルimgにフォールバックする
// （B-3方針: クロップ未設定時の見た目は完全同一であること）。
// crop設定時はnaturalWidth/Height取得（onLoad）までの間、誤ったクロップ位置のフラッシュを
// 避けるためimgをvisibility: hiddenにする。

import { useState } from "react";
import type { SyntheticEvent } from "react";
import type { CropRect } from "@coat-codex/recipe-core";
import {
  computeCroppedPhotoStyle,
  type NaturalSize,
} from "./croppedPhotoStyle";
import styles from "./CroppedPhoto.module.css";

interface CroppedPhotoProps {
  src: string;
  crop: CropRect | null | undefined;
  alt: string;
  className?: string;
}

function CroppedPhoto({ src, crop, alt, className }: CroppedPhotoProps) {
  // naturalSizeは取得元srcとセットで保持し、描画時に現srcと照合する。
  // src差し替え直後に旧画像の寸法でクロップ数式を計算する誤クロップフラッシュを防ぐ
  // （effectでのリセットは1レンダー分stale表示が残るため、導出照合方式を採る。レビューM-1）
  const [loaded, setLoaded] = useState<{
    src: string;
    size: NaturalSize;
  } | null>(null);
  const naturalSize =
    loaded !== null && loaded.src === src ? loaded.size : null;

  function handleLoad(event: SyntheticEvent<HTMLImageElement>) {
    const img = event.currentTarget;
    setLoaded({
      src,
      size: { width: img.naturalWidth, height: img.naturalHeight },
    });
  }

  if (!crop) {
    return (
      <span className={`${styles.wrapper} ${className ?? ""}`}>
        <img className={styles.plainImg} src={src} alt={alt} />
      </span>
    );
  }

  const resolvedStyle = naturalSize
    ? computeCroppedPhotoStyle(crop, naturalSize)
    : null;

  return (
    <span className={`${styles.wrapper} ${className ?? ""}`}>
      <span
        className={styles.cropBox}
        style={resolvedStyle?.cropBoxStyle}
        data-testid="cropped-photo-cropbox"
      >
        <img
          className={styles.croppedImg}
          src={src}
          alt={alt}
          onLoad={handleLoad}
          style={
            resolvedStyle
              ? { ...resolvedStyle.imgStyle, visibility: "visible" }
              : { visibility: "hidden" }
          }
        />
      </span>
    </span>
  );
}

export default CroppedPhoto;
