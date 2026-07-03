// components/common/ConfirmDialog.tsx — Dialog confirmバリアント
// （デザイン仕様書§4「Dialog / Modal」: backdrop --color-bg-backdrop、danger実行ボタン＋
// confirm.cancel、注記 confirm.irreversible。Escで閉じる・backdropクリックで閉じる・
// role="dialog" aria-modal）

import { useRef } from "react";
import { useTranslation } from "react-i18next";
import { useFocusTrap } from "./useFocusTrap";
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
  const dialogRef = useRef<HTMLDivElement>(null);
  const cancelButtonRef = useRef<HTMLButtonElement>(null);
  const confirmButtonRef = useRef<HTMLButtonElement>(null);

  useFocusTrap({
    containerRef: dialogRef,
    open,
    onClose: onCancel,
    // キャンセル側を初期フォーカスにする（危険な確定操作を誤って即実行しないための安全策）
    initialFocusRef: cancelButtonRef,
  });

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
        ref={dialogRef}
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
          <button
            ref={cancelButtonRef}
            type="button"
            className={styles.cancel}
            onClick={onCancel}
          >
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
