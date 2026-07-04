// components/common/MarkdownCopyFallbackDialog.tsx — noteMDクリップボードコピー失敗時の
// 手動コピーフォールバック（2026-07-04 FB-E）
//
// navigator.clipboard非対応・拒否等でコピーが行えなかった場合に開く小ダイアログ。
// 生成済みMarkdown全文をreadOnlyのtextareaに表示し、開時に自動全選択することで
// ユーザーが手動でCmd/Ctrl+Cできるようにする。意匠・構造はConfirmDialog.tsxに倣い、
// 共通のuseFocusTrap（Tab循環・Escape close・初期/復帰フォーカス）を適用する。

import { useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";
import { useFocusTrap } from "./useFocusTrap";
import styles from "./MarkdownCopyFallbackDialog.module.css";

interface MarkdownCopyFallbackDialogProps {
  open: boolean;
  markdown: string;
  onClose: () => void;
}

function MarkdownCopyFallbackDialog({
  open,
  markdown,
  onClose,
}: MarkdownCopyFallbackDialogProps) {
  const { t } = useTranslation();
  const dialogRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);

  useFocusTrap({
    containerRef: dialogRef,
    open,
    onClose,
    initialFocusRef: textareaRef,
  });

  useEffect(() => {
    if (!open) {
      return;
    }
    textareaRef.current?.select();
  }, [open, markdown]);

  if (!open) {
    return null;
  }

  return (
    <div
      className={styles.backdrop}
      onClick={onClose}
      data-testid="markdown-copy-fallback-backdrop"
    >
      <div
        ref={dialogRef}
        className={styles.dialog}
        role="dialog"
        aria-modal="true"
        aria-labelledby="markdown-copy-fallback-title"
        onClick={(event) => event.stopPropagation()}
      >
        <h2 id="markdown-copy-fallback-title" className={styles.title}>
          {t("export.noteMdCopyFallbackTitle")}
        </h2>
        <p className={styles.description}>
          {t("export.noteMdCopyFallbackDescription")}
        </p>
        <textarea
          ref={textareaRef}
          className={styles.textarea}
          readOnly
          value={markdown}
          data-testid="markdown-copy-fallback-textarea"
          onClick={(event) => event.currentTarget.select()}
        />
        <div className={styles.actions}>
          <button
            ref={closeButtonRef}
            type="button"
            className={styles.close}
            onClick={onClose}
          >
            {t("export.noteMdCopyFallbackClose")}
          </button>
        </div>
      </div>
    </div>
  );
}

export default MarkdownCopyFallbackDialog;
