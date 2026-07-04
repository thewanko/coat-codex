// components/setup/OverviewPhotoUploader.tsx — Setup全体写真（技術計画v2.2 §4.2 T23）
//
// T18 PhotoUploaderをそのまま再利用する薄いラッパー。先頭=代表写真（COVERタグ）、
// 並び替え（PhotoUploader内の上下ボタン）で代表変更ができる（PhotoUploader自体の責務）。

import { useTranslation } from "react-i18next";
import PhotoUploader from "../common/PhotoUploader";
import styles from "./SetupSection.module.css";

interface OverviewPhotoUploaderProps {
  recipeId: string;
  value: string[];
  onChange: (photoIds: string[]) => void;
}

function OverviewPhotoUploader({
  recipeId,
  value,
  onChange,
}: OverviewPhotoUploaderProps) {
  const { t } = useTranslation();

  return (
    <section className={styles.section}>
      <h2 className={styles.heading}>{t("setup.photosLabel")}</h2>
      <p className={styles.note}>{t("setup.photosNote")}</p>
      <PhotoUploader recipeId={recipeId} value={value} onChange={onChange} />
    </section>
  );
}

export default OverviewPhotoUploader;
