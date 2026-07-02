// components/overview/OverviewHeader.tsx — 代表写真＋BaseStepOverlay
// （技術計画v2.2 §3.3・§4.2 T28）
//
// 代表写真＝overviewPhotoIds[0]（§3.2の代表写真規約）をresolvePhotoUrlで解決し、
// 読込中はSkeleton(photo)（D-5）を表示する。写真未設定でもBaseStepOverlayの帯は
// 常に表示する（デザイン仕様書§4「写真なしでも帯は表示」）。

import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { resolvePhotoUrl } from "../../db/photoStore";
import Skeleton from "../common/Skeleton";
import BaseStepOverlay from "./BaseStepOverlay";
import type { Step } from "../../models/recipe";
import styles from "./OverviewHeader.module.css";

interface OverviewHeaderProps {
  representativePhotoId: string | null;
  baseSteps: Step[];
  onEditBaseSteps: () => void;
}

function OverviewHeader({
  representativePhotoId,
  baseSteps,
  onEditBaseSteps,
}: OverviewHeaderProps) {
  const { t } = useTranslation();
  const [photoUrl, setPhotoUrl] = useState<string | null>(null);
  const [photoLoading, setPhotoLoading] = useState(false);

  useEffect(() => {
    if (!representativePhotoId) {
      setPhotoUrl(null);
      return;
    }
    let cancelled = false;
    setPhotoLoading(true);
    void resolvePhotoUrl(representativePhotoId)
      .then((resolved) => {
        if (!cancelled) {
          setPhotoUrl(resolved);
        }
      })
      .finally(() => {
        if (!cancelled) {
          setPhotoLoading(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [representativePhotoId]);

  if (photoLoading) {
    return (
      <div className={styles.root}>
        <Skeleton variant="photo" aria-label={t("photo.uploading")} />
      </div>
    );
  }

  return (
    <div className={styles.root}>
      <div className={styles.photoFrame}>
        {photoUrl ? (
          <img className={styles.photo} src={photoUrl} alt="" />
        ) : (
          <span className={styles.photoPlaceholder} aria-hidden="true" />
        )}
        <BaseStepOverlay baseSteps={baseSteps} onEdit={onEditBaseSteps} />
      </div>
    </div>
  );
}

export default OverviewHeader;
