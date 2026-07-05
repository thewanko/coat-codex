// components/overview/OverviewPhotoStrip.tsx — 全体写真ストリップ（2枚目以降）
// （技術計画v2.2 §3.3・§4.2 T28）
//
// overviewPhotoIds[0]は代表写真としてOverviewHeaderが使用するため、本コンポーネントは
// overviewPhotoIds[1:]のみをサムネ横並び表示する。0〜1枚（＝2枚目以降が存在しない）なら
// 非表示（nullを返す）。読込中はSkeleton(photo)（D-5）。

import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { resolvePhotoUrl } from "../../db/photoStore";
import CroppedPhoto from "../common/CroppedPhoto";
import Skeleton from "../common/Skeleton";
import type { CropRect } from "../../models/recipe";
import styles from "./OverviewPhotoStrip.module.css";

interface OverviewPhotoStripProps {
  photoIds: string[];
  /** photoId→クロップ矩形（未設定はエントリなし）。RecipeDoc.photoCropsをそのまま渡す */
  photoCrops?: Record<string, CropRect>;
}

interface ThumbProps {
  photoId: string;
  crop: CropRect | null;
}

function StripThumb({ photoId, crop }: ThumbProps) {
  const { t } = useTranslation();
  const [url, setUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
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

  if (loading) {
    return (
      <li className={styles.item}>
        <Skeleton variant="photo" aria-label={t("photo.uploading")} />
      </li>
    );
  }

  return (
    <li className={styles.item}>
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
    </li>
  );
}

function OverviewPhotoStrip({
  photoIds,
  photoCrops = {},
}: OverviewPhotoStripProps) {
  const { t } = useTranslation();
  const restPhotoIds = photoIds.slice(1);

  if (restPhotoIds.length === 0) {
    return null;
  }

  return (
    <div className={styles.root} data-testid="overview-photo-strip">
      <ul className={styles.list}>
        {restPhotoIds.map((photoId) => (
          <StripThumb
            key={photoId}
            photoId={photoId}
            crop={photoCrops[photoId] ?? null}
          />
        ))}
      </ul>
      <span className={styles.count}>
        {t("overview.photoStripAllCount", { count: photoIds.length })}
      </span>
    </div>
  );
}

export default OverviewPhotoStrip;
