// components/overview/ShareImagePreview.tsx — 合成候補カードの選択式プレビュー
// （技術計画v2.2 §4.2 T39・§3.4手順2 v2.3「選択式」・デザインdc.html セクション05 SHARE）
//
// 候補カード一覧（4:5・COVER/工程番号タグ）からチェックで最大4枚選択。
// 既定=先頭4枚選択済み・選択数表示・5枚目以降はdisabled。
// 生成中はプレースホルダ（対角縞）＋進行表示を出す（選択操作自体は生成完了まで
// disabled — 生成済みFileがなければ選択しても組み替える対象がないため）。
//
// 選択変更は生成済みFileの組み替えのみで、composeShareImagesの再実行はしない
// （呼び出し側=ShareDialogがtransient activation維持のため既に保持済みのFile[]を扱う）。
//
// FB-A（2026-07-04 iPhone実機フィードバック）: 各カードに個別「保存」ボタンを追加する
// （1タップ=1ファイルDL。旧一括DLボタンはShareDialog側で廃止済み）。選択チェックとは独立に
// A系統・B系統いずれでも常時表示する。タップ領域は選択チェックボックス（右上）と重ならないよう
// 保存ボタンを右下に配置し、モバイル44px規律（デザイン仕様書§a11y）を満たすため視覚サイズより
// 大きい不可視ヒット領域（::beforeパターン、ShareDialog.module.cssの.closeButton等と同趣旨）を
// 確保する。

import { useTranslation } from "react-i18next";
import { useEffect, useState } from "react";
import { resolvePhotoUrl } from "../../db/photoStore";
import type { ComposedShareImage } from "../../lib/sns/imageComposer";
import type { CropRect } from "@coat-codex/recipe-core";
import { CroppedPhoto } from "@coat-codex/recipe-ui";
import styles from "./ShareImagePreview.module.css";

export const SHARE_IMAGE_MAX_SELECTION = 4;

interface ShareImagePreviewProps {
  /** 生成中はtrue（プレースホルダ表示・選択操作は無効化） */
  generating: boolean;
  images: ComposedShareImage[];
  /** 選択中のindex（imagesに対するindex）集合。呼び出し側で既定=先頭4枚を設定する */
  selectedIndexes: number[];
  /** photoId→クロップ矩形（未設定はエントリなし）。RecipeDoc.photoCropsをそのまま渡す */
  photoCrops?: Record<string, CropRect>;
  onToggle: (index: number) => void;
  /** 個別「保存」ボタン押下時（imagesに対するindex指定。1タップ=1ファイルDL） */
  onDownload: (index: number) => void;
}

/**
 * 候補カード1枚分のカバー写真（wholeはphotoId、partはstepPhotoId）を解決して表示する。
 * photoId=null（summaryカードは写真を持たない）は常に対角縞プレースホルダ様式で表示する。
 */
function CandidatePhoto({
  photoId,
  crop,
}: {
  photoId: string | null;
  crop: CropRect | null;
}) {
  const [url, setUrl] = useState<string | null>(null);

  // resolvePhotoUrlが返すobjectURLはここでrevokeしない: photoStore側の共有キャッシュ
  // （複数コンポーネントから同一photoIdが参照されうる）にライフサイクル管理を委ねる設計のため。
  useEffect(() => {
    if (photoId === null) {
      setUrl(null);
      return;
    }
    let cancelled = false;
    void resolvePhotoUrl(photoId).then((resolved) => {
      if (!cancelled) {
        setUrl(resolved);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [photoId]);

  if (!url) {
    return (
      <span
        className={`${styles.photoPlaceholder} ${styles.diagonalStripes}`}
        aria-hidden="true"
      />
    );
  }
  return (
    <CroppedPhoto className={styles.photoImg} src={url} crop={crop} alt="" />
  );
}

function candidateTag(
  image: ComposedShareImage,
  index: number,
  t: (key: string) => string,
): string {
  if (image.spec.kind === "summary") {
    return t("share.summaryTag");
  }
  if (image.spec.kind === "part") {
    return image.spec.stepTag;
  }
  return index === 0 ? "COVER" : "";
}

/** summaryカードのphotoIdはnull（写真を持たない）。呼び出し側でnull分岐しプレースホルダを描く */
function candidatePhotoId(image: ComposedShareImage): string | null {
  if (image.spec.kind === "summary") {
    return null;
  }
  return image.spec.kind === "whole"
    ? image.spec.photoId
    : image.spec.stepPhotoId;
}

/** 候補カードの写真に対応するクロップ矩形を解決する（photoId不在ならnull） */
function candidatePhotoCrop(
  image: ComposedShareImage,
  photoCrops: Record<string, CropRect>,
): CropRect | null {
  const photoId = candidatePhotoId(image);
  return photoId ? (photoCrops[photoId] ?? null) : null;
}

function ShareImagePreview({
  generating,
  images,
  selectedIndexes,
  photoCrops = {},
  onToggle,
  onDownload,
}: ShareImagePreviewProps) {
  const { t } = useTranslation();
  const selectedSet = new Set(selectedIndexes);

  if (generating) {
    return (
      <div className={styles.root}>
        <div className={styles.grid} data-testid="share-image-grid">
          {Array.from({ length: 4 }, (_, index) => (
            <div
              key={index}
              className={`${styles.placeholderCard} ${styles.diagonalStripes}`}
              data-testid="share-image-placeholder"
            />
          ))}
        </div>
        <p className={styles.progressText} role="status">
          {t("share.generating")}
        </p>
      </div>
    );
  }

  if (images.length === 0) {
    return (
      <div className={styles.root}>
        <p className={styles.emptyText}>{t("share.noCandidates")}</p>
      </div>
    );
  }

  return (
    <div className={styles.root}>
      <div className={styles.grid} data-testid="share-image-grid">
        {images.map((image, index) => {
          const selected = selectedSet.has(index);
          const disabled =
            !selected && selectedIndexes.length >= SHARE_IMAGE_MAX_SELECTION;
          const tag = candidateTag(image, index, t);
          return (
            <label
              key={index}
              className={`${styles.card} ${selected ? styles.cardSelected : ""}`}
              data-testid="share-image-card"
              data-selected={selected}
            >
              <input
                type="checkbox"
                className={styles.checkbox}
                checked={selected}
                disabled={disabled}
                onChange={() => onToggle(index)}
                aria-label={t("share.selectImage", { index: index + 1 })}
              />
              <span className={styles.photoFrame}>
                <CandidatePhoto
                  photoId={candidatePhotoId(image)}
                  crop={candidatePhotoCrop(image, photoCrops)}
                />
                {tag && <span className={styles.tag}>{tag}</span>}
              </span>
              <button
                type="button"
                className={styles.downloadButton}
                data-testid="share-image-download-button"
                aria-label={t("share.downloadImage", { index: index + 1 })}
                onClick={(event) => {
                  // 親<label>へのクリックバブルでチェックボックスがトグルされるのを防ぐ
                  // （保存操作と選択トグルは独立した操作のため）
                  event.preventDefault();
                  event.stopPropagation();
                  onDownload(index);
                }}
              >
                {/* U+2193の素の下矢印を使う（装飾グリフU+2B73はiOSフォント未収録で
                    豆腐/バーガー状の代替表示になる実機報告あり 2026-07-04） */}
                <span aria-hidden="true">↓</span>
              </button>
            </label>
          );
        })}
      </div>
      <p
        className={styles.selectionCount}
        data-testid="share-image-selection-count"
      >
        {t("share.selectedCount", {
          count: selectedIndexes.length,
          max: SHARE_IMAGE_MAX_SELECTION,
        })}
      </p>
    </div>
  );
}

export default ShareImagePreview;
