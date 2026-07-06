// components/common/ImportErrorDialog.tsx — Dialog error-detailバリアント（D-4・T33）
//
// JSONインポートのzod検証・migrations失敗時に、エラー詳細（スキーマパス・メッセージの
// 一覧）をmonoでスクロール可能なリスト表示する。デザイン仕様書§4「Dialog / Modal」:
// backdrop --color-bg-backdrop、本体 --color-bg / radius 10px / --shadow-3、
// 「error-detail は mono でzodエラー列挙」。ConfirmDialog（confirmバリアント）と同じ
// Esc・backdropクリックで閉じる・role="dialog" aria-modal・フォーカス管理の慣行に従う。

import { useRef } from "react";
import { useTranslation } from "react-i18next";
import type { ImportIssue } from "@coat-codex/recipe-core";
import { useFocusTrap } from "./useFocusTrap";
import styles from "./ImportErrorDialog.module.css";

interface ImportErrorDialogProps {
  open: boolean;
  /** 失敗理由の要約メッセージ（importRecipeのImportFailure.message） */
  message: string;
  /** zod issue一覧（パス・メッセージ）。§2.7・T30が返す構造化データをそのまま渡す */
  issues: ImportIssue[];
  onClose: () => void;
}

/** issue.pathの配列（文字列/数値混在）を`recipe.parts[0].name`のようなドット表記へ整形する */
function formatIssuePath(path: (string | number)[]): string {
  if (path.length === 0) {
    return "(root)";
  }
  return path.reduce<string>((acc, segment, index) => {
    if (typeof segment === "number") {
      return `${acc}[${segment}]`;
    }
    return index === 0 ? segment : `${acc}.${segment}`;
  }, "");
}

function ImportErrorDialog({
  open,
  message,
  issues,
  onClose,
}: ImportErrorDialogProps) {
  const { t } = useTranslation();
  const dialogRef = useRef<HTMLDivElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);

  useFocusTrap({
    containerRef: dialogRef,
    open,
    onClose,
    initialFocusRef: closeButtonRef,
  });

  if (!open) {
    return null;
  }

  return (
    <div
      className={styles.backdrop}
      onClick={onClose}
      data-testid="import-error-dialog-backdrop"
    >
      <div
        ref={dialogRef}
        className={styles.dialog}
        role="dialog"
        aria-modal="true"
        aria-labelledby="import-error-dialog-title"
        onClick={(event) => event.stopPropagation()}
      >
        <div className={styles.header}>
          <h2 id="import-error-dialog-title" className={styles.title}>
            {t("importError.title")}
          </h2>
          <button
            ref={closeButtonRef}
            type="button"
            className={styles.closeButton}
            onClick={onClose}
            aria-label={t("importError.dismiss")}
          >
            ✕
          </button>
        </div>

        <p className={styles.message}>{message}</p>

        {issues.length > 0 && (
          <ul className={styles.issueList} data-testid="import-error-issues">
            {issues.map((issue, index) => (
              <li key={index} className={styles.issueRow}>
                <span className={styles.issuePath}>
                  {formatIssuePath(issue.path)}
                </span>
                <span className={styles.issueMessage}>{issue.message}</span>
              </li>
            ))}
          </ul>
        )}

        <div className={styles.actions}>
          <button type="button" className={styles.confirm} onClick={onClose}>
            {t("importError.close")}
          </button>
        </div>
      </div>
    </div>
  );
}

export default ImportErrorDialog;
