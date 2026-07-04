// components/common/MarkdownCopyFallbackDialog.tsx — noteMDクリップボードコピー失敗時の
// 手動コピーフォールバック（2026-07-04 FB-E）
//
// navigator.clipboard非対応・拒否等でコピーが行えなかった場合に開く小ダイアログ。
// 生成済みMarkdown全文をreadOnlyのtextareaに表示し、開時に自動全選択することで
// ユーザーが手動でCmd/Ctrl+Cできるようにする。意匠・構造はConfirmDialog.tsxに倣い、
// 共通のuseFocusTrap（Tab循環・Escape close・初期/復帰フォーカス）を適用する。
//
// 2026-07-04 FB-H: 「全文をコピー」ボタンを追加。iOSではuseExportActions側の
// writeText→execCommandチェーンが直近のタップ由来のtransient activationを使い切って
// しまっている可能性があるため、このボタン自身のタップ＝新しいuser activationで
// execCommand("copy")（legacyCopy.ts）を再試行する。これが最も確実な経路になる。

import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { copyTextareaLegacy } from "./legacyCopy";
import { useFocusTrap } from "./useFocusTrap";
import styles from "./MarkdownCopyFallbackDialog.module.css";

/** 「全文をコピー」ボタンの✓ラベル表示時間（ms）。約2秒でリセットする */
const COPY_FALLBACK_COPIED_RESET_MS = 2000;

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
  const [copied, setCopied] = useState(false);
  const copiedResetTimerRef = useRef<ReturnType<typeof setTimeout> | null>(
    null,
  );

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

  // openがfalseへ戻った際（アンマウント/再オープン）に✓状態やタイマーを残さない
  useEffect(() => {
    if (open) {
      return;
    }
    setCopied(false);
    if (copiedResetTimerRef.current !== null) {
      clearTimeout(copiedResetTimerRef.current);
      copiedResetTimerRef.current = null;
    }
  }, [open]);

  // アンマウント時にタイマーを確実にクリアする
  useEffect(() => {
    return () => {
      if (copiedResetTimerRef.current !== null) {
        clearTimeout(copiedResetTimerRef.current);
      }
    };
  }, []);

  function handleCopyFullText() {
    if (!textareaRef.current) {
      return;
    }
    const succeeded = copyTextareaLegacy(textareaRef.current);
    if (!succeeded) {
      return;
    }
    setCopied(true);
    if (copiedResetTimerRef.current !== null) {
      clearTimeout(copiedResetTimerRef.current);
    }
    copiedResetTimerRef.current = setTimeout(() => {
      setCopied(false);
      copiedResetTimerRef.current = null;
    }, COPY_FALLBACK_COPIED_RESET_MS);
  }

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
            type="button"
            className={styles.copy}
            onClick={handleCopyFullText}
          >
            {copied
              ? t("export.noteMdCopiedLabel")
              : t("export.noteMdCopyFallbackCopy")}
          </button>
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
