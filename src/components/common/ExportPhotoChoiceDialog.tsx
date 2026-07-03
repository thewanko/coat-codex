// components/common/ExportPhotoChoiceDialog.tsx — JSONエクスポートの写真あり/なし選択
// （技術計画v2.2 §4.2 T33「写真あり・なし選択ダイアログ」）
//
// ConfirmDialogと同じDialog骨格（backdrop --color-bg-backdrop・本体--color-bg・
// role="dialog" aria-modal・Esc/backdropクリックで閉じる・フォーカス管理）を踏襲した
// 専用の小ダイアログ。JSONエクスポート実行時に「写真を含める/含めない」を選択させる
// （ExportActionBar・RecipeCardメニューの両方から共用）。

import { useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";
import styles from "./ExportPhotoChoiceDialog.module.css";

interface ExportPhotoChoiceDialogProps {
  open: boolean;
  onChoose: (includePhotos: boolean) => void;
  onCancel: () => void;
}

function ExportPhotoChoiceDialog({
  open,
  onChoose,
  onCancel,
}: ExportPhotoChoiceDialogProps) {
  const { t } = useTranslation();
  const includeButtonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) {
      return;
    }
    includeButtonRef.current?.focus();

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        onCancel();
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [open, onCancel]);

  if (!open) {
    return null;
  }

  return (
    <div
      className={styles.backdrop}
      onClick={onCancel}
      data-testid="export-photo-choice-backdrop"
    >
      <div
        className={styles.dialog}
        role="dialog"
        aria-modal="true"
        aria-labelledby="export-photo-choice-title"
        onClick={(event) => event.stopPropagation()}
      >
        <h2 id="export-photo-choice-title" className={styles.title}>
          {t("exportPhotoChoice.title")}
        </h2>
        <p className={styles.description}>
          {t("exportPhotoChoice.description")}
        </p>
        <div className={styles.actions}>
          <button type="button" className={styles.cancel} onClick={onCancel}>
            {t("confirm.cancel")}
          </button>
          <button
            type="button"
            className={styles.secondary}
            onClick={() => onChoose(false)}
          >
            {t("exportPhotoChoice.without")}
          </button>
          <button
            ref={includeButtonRef}
            type="button"
            className={styles.primary}
            onClick={() => onChoose(true)}
          >
            {t("exportPhotoChoice.with")}
          </button>
        </div>
      </div>
    </div>
  );
}

export default ExportPhotoChoiceDialog;
