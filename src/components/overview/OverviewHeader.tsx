// components/overview/OverviewHeader.tsx — 代表写真表示
// （技術計画v2.2 §3.3・§4.2 T28）
//
// 代表写真＝overviewPhotoIds[0]（§3.2の代表写真規約）をresolvePhotoUrlで解決し、
// 読込中はSkeleton(photo)（D-5）を表示する。
//
// 2026-07-03: BASE工程表示はBaseStepOverlay（写真上のオーバーレイ帯）を廃止し、
// PARTSカードと同様の独立カードへ外出しした（RecipeOverviewPage側で合成partとして
// 組み立て、既存PartCardをそのまま利用）。そのためこのコンポーネントは代表写真の
// 表示のみを担当する。

import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { resolvePhotoUrl } from "../../db/photoStore";
import Skeleton from "../common/Skeleton";
import styles from "./OverviewHeader.module.css";

interface OverviewHeaderProps {
  representativePhotoId: string | null;
  onChangePhoto: () => void;
}

function OverviewHeader({
  representativePhotoId,
  onChangePhoto,
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
      </div>
      <button
        type="button"
        className={styles.changePhotoButton}
        onClick={onChangePhoto}
      >
        {representativePhotoId
          ? t("overview.changePhoto")
          : t("overview.addPhoto")}
      </button>
    </div>
  );
}

export default OverviewHeader;
