// components/part-editor/StepPhotoStrip.tsx — 写真つき工程の番号付きサムネストリップ
// （技術計画v2.2 §4.2 T27・v2.2 §8-A反映）
//
// モバイルのみヘッダ直下に表示（CSSのメディアクエリでPC幅は非表示にする。表示条件自体は
// レイアウトの話でありReact側で分岐しない）。photoId非nullの工程のみ抽出し、番号は
// steps配列内でのSTEP n（1-based index、全工程通しの番号）を保つ。タップで該当StepCard
// （data-testid="step-card-{index}"）へscrollIntoViewする。写真0件なら非表示（nullを返す）。
// サムネ読込中はSkeleton(photo)（D-5）。

import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { resolvePhotoUrl } from "../../db/photoStore";
import CroppedPhoto from "../common/CroppedPhoto";
import Skeleton from "../common/Skeleton";
import type { CropRect, Step } from "../../models/recipe";
import styles from "./StepPhotoStrip.module.css";

interface StepPhotoStripProps {
  steps: Step[];
  /** タップ時に該当工程へスクロールするための要素id解決（既定はstep-card-{index}） */
  getStepElementId?: (index: number) => string;
  /** photoId→クロップ矩形（未設定はエントリなし）。RecipeDoc.photoCropsをそのまま渡す */
  photoCrops?: Record<string, CropRect>;
}

interface PhotoStepEntry {
  step: Step;
  index: number;
}

function defaultStepElementId(index: number): string {
  return `step-card-${index}`;
}

interface ThumbProps {
  entry: PhotoStepEntry;
  elementId: string;
  crop: CropRect | null;
}

function StripThumb({ entry, elementId, crop }: ThumbProps) {
  const { t } = useTranslation();
  const [url, setUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const photoId = entry.step.photoId;

  useEffect(() => {
    if (!photoId) {
      setUrl(null);
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    void resolvePhotoUrl(photoId)
      .then((resolved) => {
        if (!cancelled) {
          setUrl(resolved);
        }
      })
      .finally(() => {
        if (!cancelled) {
          setLoading(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [photoId]);

  function handleClick() {
    document.getElementById(elementId)?.scrollIntoView({ behavior: "smooth" });
  }

  const n = entry.index + 1;

  if (loading) {
    return (
      <li className={styles.item}>
        <Skeleton variant="photo" aria-label={t("photo.uploading")} />
      </li>
    );
  }

  return (
    <li className={styles.item}>
      <button
        type="button"
        className={styles.thumbButton}
        aria-label={t("editor.stepPhotoStripItemLabel", { n })}
        onClick={handleClick}
      >
        <span className={styles.stepTag}>{t("editor.stepLabel", { n })}</span>
        {url ? (
          <CroppedPhoto
            className={styles.thumbImg}
            src={url}
            crop={crop}
            alt=""
          />
        ) : (
          <span className={styles.thumbPlaceholder} aria-hidden="true" />
        )}
      </button>
    </li>
  );
}

function StepPhotoStrip({
  steps,
  getStepElementId = defaultStepElementId,
  photoCrops = {},
}: StepPhotoStripProps) {
  const { t } = useTranslation();

  const entries: PhotoStepEntry[] = steps
    .map((step, index) => ({ step, index }))
    .filter((entry) => entry.step.photoId !== null);

  if (entries.length === 0) {
    return null;
  }

  return (
    <nav className={styles.root} aria-label={t("editor.stepPhotoStripLabel")}>
      <ul className={styles.list}>
        {entries.map((entry) => (
          <StripThumb
            key={entry.step.id}
            entry={entry}
            elementId={getStepElementId(entry.index)}
            crop={
              entry.step.photoId
                ? (photoCrops[entry.step.photoId] ?? null)
                : null
            }
          />
        ))}
      </ul>
    </nav>
  );
}

export default StepPhotoStrip;
