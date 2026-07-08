// components/common/ImportFromScriptoriumDialog.tsx — Scriptoriumインポート確認ダイアログ
// （技術計画v1.3 §6-2「確認ダイアログ・画像あり/なし選択・重複確認」・§7 ST-23）
//
// useImportDeepLink（Wave A）のstateを受け取り、phaseごとに表示を切り替える薄い
// プレゼンテーション層。confirm/dismissの実処理はフック側の責務。
// backdrop・role="dialog"・aria-modal・useFocusTrapはPublishDialog/ImportErrorDialogの
// イディオムを踏襲する。

import { useRef, useState, type RefObject } from "react";
import type { ReactElement } from "react";
import { useTranslation } from "react-i18next";
import { useFocusTrap } from "./useFocusTrap";
import type {
  ImportDeepLinkPhase,
  UseImportDeepLinkResult,
} from "../../lib/useImportDeepLink";
import styles from "./ImportFromScriptoriumDialog.module.css";

interface ImportFromScriptoriumDialogProps {
  state: ImportDeepLinkPhase;
  onConfirm: UseImportDeepLinkResult["confirm"];
  onDismiss: UseImportDeepLinkResult["dismiss"];
}

function formatKb(bytes: number): number {
  // 1KB未満は丸めると「0 KB」になり不自然なため最低1へ引き上げる
  return Math.max(1, Math.round(bytes / 1024));
}

function ImportFromScriptoriumDialog({
  state,
  onConfirm,
  onDismiss,
}: ImportFromScriptoriumDialogProps): ReactElement | null {
  const { t } = useTranslation();
  const dialogRef = useRef<HTMLDivElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);

  const open = state.phase !== "idle";

  useFocusTrap({
    containerRef: dialogRef,
    open,
    onClose: onDismiss,
    initialFocusRef: closeButtonRef,
  });

  if (state.phase === "idle") {
    return null;
  }

  if (state.phase === "invalidUrl") {
    return (
      <SimpleMessageDialog
        dialogRef={dialogRef}
        closeButtonRef={closeButtonRef}
        message={t("importScriptorium.invalidUrl")}
        onClose={onDismiss}
      />
    );
  }

  if (state.phase === "fetchError") {
    const messageKey =
      state.code === "notFound"
        ? "importScriptorium.errNotFound"
        : state.code === "network"
          ? "importScriptorium.errNetwork"
          : "importScriptorium.errInvalidData";
    return (
      <SimpleMessageDialog
        dialogRef={dialogRef}
        closeButtonRef={closeButtonRef}
        message={t(messageKey)}
        onClose={onDismiss}
      />
    );
  }

  if (state.phase === "loading") {
    return (
      <div
        className={styles.backdrop}
        data-testid="import-scriptorium-backdrop"
      >
        <div
          ref={dialogRef}
          className={styles.dialog}
          role="dialog"
          aria-modal="true"
          aria-labelledby="import-scriptorium-title"
        >
          <div className={styles.header}>
            <h2 id="import-scriptorium-title" className={styles.title}>
              {t("importScriptorium.title")}
            </h2>
          </div>
          <p className={styles.notice}>{t("importScriptorium.loading")}</p>
          <div className={styles.actions}>
            <button
              ref={closeButtonRef}
              type="button"
              className={styles.cancelButton}
              onClick={onDismiss}
            >
              {t("importScriptorium.cancel")}
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ready / importing
  const { detail, cover, duplicate } = state;
  const isImporting = state.phase === "importing";
  const coverUnavailable = detail.coverUrl !== null && cover === null;

  return (
    <ImportReadyDialog
      dialogRef={dialogRef}
      closeButtonRef={closeButtonRef}
      title={t("importScriptorium.title")}
      recipeTitle={detail.recipe.title}
      handle={detail.handle}
      cover={cover}
      coverUnavailable={coverUnavailable}
      duplicateTitle={duplicate?.title ?? null}
      importing={isImporting}
      onConfirm={onConfirm}
      onDismiss={onDismiss}
    />
  );
}

interface SimpleMessageDialogProps {
  dialogRef: RefObject<HTMLDivElement | null>;
  closeButtonRef: RefObject<HTMLButtonElement | null>;
  message: string;
  onClose: () => void;
}

function SimpleMessageDialog({
  dialogRef,
  closeButtonRef,
  message,
  onClose,
}: SimpleMessageDialogProps): ReactElement {
  const { t } = useTranslation();
  return (
    <div className={styles.backdrop} data-testid="import-scriptorium-backdrop">
      <div
        ref={dialogRef}
        className={styles.dialog}
        role="dialog"
        aria-modal="true"
        aria-labelledby="import-scriptorium-title"
      >
        <div className={styles.header}>
          <h2 id="import-scriptorium-title" className={styles.title}>
            {t("importScriptorium.title")}
          </h2>
        </div>
        <p className={styles.notice}>{message}</p>
        <div className={styles.actions}>
          <button
            ref={closeButtonRef}
            type="button"
            className={styles.cancelButton}
            onClick={onClose}
          >
            {t("importScriptorium.close")}
          </button>
        </div>
      </div>
    </div>
  );
}

interface ImportReadyDialogProps {
  dialogRef: RefObject<HTMLDivElement | null>;
  closeButtonRef: RefObject<HTMLButtonElement | null>;
  title: string;
  recipeTitle: string;
  handle: string;
  cover: { dataUrl: string; bytes: number } | null;
  coverUnavailable: boolean;
  duplicateTitle: string | null;
  importing: boolean;
  onConfirm: (includeImage: boolean) => void;
  onDismiss: () => void;
}

function ImportReadyDialog({
  dialogRef,
  closeButtonRef,
  title,
  recipeTitle,
  handle,
  cover,
  coverUnavailable,
  duplicateTitle,
  importing,
  onConfirm,
  onDismiss,
}: ImportReadyDialogProps): ReactElement {
  const { t } = useTranslation();
  // 既定=画像あり（cover !== nullのときのみ意味を持つ）
  const [includeImage, setIncludeImage] = useState(true);
  const showImageChoice = cover !== null;

  return (
    <div className={styles.backdrop} data-testid="import-scriptorium-backdrop">
      <div
        ref={dialogRef}
        className={styles.dialog}
        role="dialog"
        aria-modal="true"
        aria-labelledby="import-scriptorium-title"
      >
        <div className={styles.header}>
          <h2 id="import-scriptorium-title" className={styles.title}>
            {title}
          </h2>
        </div>

        <div className={styles.body}>
          <p className={styles.recipeTitle}>{recipeTitle}</p>
          <p className={styles.author}>
            {t("importScriptorium.author", { handle })}
          </p>

          {cover !== null && (
            <div className={styles.coverSection}>
              <img src={cover.dataUrl} alt="" className={styles.coverPreview} />
            </div>
          )}

          {showImageChoice && cover !== null && (
            <fieldset className={styles.imageChoice}>
              <label className={styles.radioRow}>
                <input
                  type="radio"
                  name="import-scriptorium-image-choice"
                  checked={includeImage}
                  disabled={importing}
                  onChange={() => setIncludeImage(true)}
                />
                {t("importScriptorium.withImage", {
                  size: formatKb(cover.bytes),
                })}
              </label>
              <label className={styles.radioRow}>
                <input
                  type="radio"
                  name="import-scriptorium-image-choice"
                  checked={!includeImage}
                  disabled={importing}
                  onChange={() => setIncludeImage(false)}
                />
                {t("importScriptorium.withoutImage")}
              </label>
            </fieldset>
          )}

          {coverUnavailable && (
            <p className={styles.notice}>
              {t("importScriptorium.coverUnavailable")}
            </p>
          )}

          {duplicateTitle !== null && (
            <p className={styles.warningNotice}>
              {t("importScriptorium.duplicateNotice", {
                title: duplicateTitle,
              })}
            </p>
          )}
        </div>

        <div className={styles.actions}>
          <button
            ref={closeButtonRef}
            type="button"
            className={styles.cancelButton}
            disabled={importing}
            onClick={onDismiss}
          >
            {t("importScriptorium.cancel")}
          </button>
          <button
            type="button"
            className={styles.confirmButton}
            disabled={importing}
            onClick={() => onConfirm(showImageChoice && includeImage)}
          >
            {importing
              ? t("importScriptorium.importing")
              : t("importScriptorium.confirm")}
          </button>
        </div>
      </div>
    </div>
  );
}

export default ImportFromScriptoriumDialog;
