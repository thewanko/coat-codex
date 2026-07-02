// components/common/ConfirmDialog.tsx — Dialog confirmバリアント
// （デザイン仕様書§4「Dialog / Modal」: backdrop --color-bg-backdrop、danger実行ボタン＋
// confirm.cancel、注記 confirm.irreversible。Escで閉じる・backdropクリックで閉じる・
// role="dialog" aria-modal）

import { useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";
import styles from "./ConfirmDialog.module.css";

interface ConfirmDialogProps {
  open: boolean;
  title: string;
  description?: string;
  confirmLabel?: string;
  onConfirm: () => void;
  onCancel: () => void;
}

function ConfirmDialog({
  open,
  title,
  description,
  confirmLabel,
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  const { t } = useTranslation();
  const confirmButtonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) {
      return;
    }
    confirmButtonRef.current?.focus();

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
      data-testid="confirm-dialog-backdrop"
    >
      <div
        className={styles.dialog}
        role="dialog"
        aria-modal="true"
        aria-labelledby="confirm-dialog-title"
        onClick={(event) => event.stopPropagation()}
      >
        <h2 id="confirm-dialog-title" className={styles.title}>
          {title}
        </h2>
        {description && <p className={styles.description}>{description}</p>}
        <p className={styles.irreversible}>{t("confirm.irreversible")}</p>
        <div className={styles.actions}>
          <button type="button" className={styles.cancel} onClick={onCancel}>
            {t("confirm.cancel")}
          </button>
          <button
            ref={confirmButtonRef}
            type="button"
            className={styles.confirm}
            onClick={onConfirm}
          >
            {confirmLabel ?? t("confirm.delete")}
          </button>
        </div>
      </div>
    </div>
  );
}

export default ConfirmDialog;
