// components/overview/PublishDialog.tsx — Scriptorium投稿ダイアログ
// （技術計画v1.3 §6-1 全量・ST-21。ExportActionBarの「Scriptoriumに公開」ボタンから開く）
//
// cover選択（overviewPhotoIdsからCroppedPhotoプレビュー付き1枚 or カバーなし）→
// handle/削除PW入力（自動生成サジェスト付き）→削減内容プレビュー（メモ・ツールnote・
// チップ写真・工程写真は公開されない旨）→Turnstileウィジェット→送信、の1画面フォーム。
// 送信成功後は完了画面（公開URL・削除PWを「再表示不可」警告付きでコピー可能表示）へ置換する。
//
// Turnstile tokenは単回使用のため、送信失敗時はtokenを無効化しTurnstileWidgetを
// key={retryCount}で再マウントして再チャレンジ可能にする（OverviewPhotoDialog/ShareDialogと
// 同じuseFocusTrap・条件付きマウント方式に倣う）。
// composeCover/getPhotoBlob/publish/siteKeyは依存注入可能（テスト容易化）。

import { useEffect, useRef, useState } from "react";
import type { ReactElement } from "react";
import { useTranslation } from "react-i18next";
import type { CropRect, RecipeDoc } from "@coat-codex/recipe-core";
import { CroppedPhoto, TurnstileWidget } from "@coat-codex/recipe-ui";
import { useFocusTrap } from "../common/useFocusTrap";
import { useToast } from "../common/toastContext";
import { db } from "../../db/db";
import { resolvePhotoUrl } from "../../db/photoStore";
import { generateDeletePassword } from "../../lib/generateDeletePassword";
import { composeCover as defaultComposeCover } from "../../lib/coverComposer";
import {
  publishToScriptorium,
  PublishError,
  type PublishErrorCode,
  type PublishResult,
} from "../../lib/publishToScriptorium";
import styles from "./PublishDialog.module.css";

const DELETE_PASSWORD_MIN_LENGTH = 8;
const HANDLE_MAX_LENGTH = 40;

/** 既定のcover画像ソース取得（db.photos.get(id)のblob。ShareDialog.tsx:69と同じ経路） */
async function defaultGetPhotoBlob(photoId: string): Promise<Blob | null> {
  const record = await db.photos.get(photoId);
  return record ? record.blob : null;
}

export interface PublishDialogDeps {
  publish?: typeof publishToScriptorium;
  composeCover?: (
    source: Blob,
    crop: CropRect | null | undefined,
  ) => ReturnType<typeof defaultComposeCover>;
  getPhotoBlob?: (photoId: string) => Promise<Blob | null>;
  siteKey?: string;
}

interface PublishDialogProps {
  open: boolean;
  recipe: RecipeDoc | null;
  onClose: () => void;
  deps?: PublishDialogDeps;
}

/** PublishError.codeをi18nキーへ写像する */
function errorCodeToI18nKey(code: PublishErrorCode): string {
  switch (code) {
    case "validation":
      return "publish.errorValidation";
    case "turnstile":
      return "publish.errorTurnstile";
    case "rateLimit":
      return "publish.errorRateLimit";
    case "circuit":
      return "publish.errorCircuit";
    case "tooLarge":
      return "publish.errorTooLarge";
    case "network":
      return "publish.errorNetwork";
    default:
      return "publish.errorUnknown";
  }
}

export default function PublishDialog({
  open,
  recipe,
  onClose,
  deps,
}: PublishDialogProps): ReactElement | null {
  const { t, i18n } = useTranslation();
  const toast = useToast();
  const dialogRef = useRef<HTMLDivElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);

  const overviewPhotoIds = recipe?.overviewPhotoIds ?? [];
  const [selectedCoverId, setSelectedCoverId] = useState<string | null>(
    overviewPhotoIds[0] ?? null,
  );
  const [handle, setHandle] = useState("");
  const [deletePassword, setDeletePassword] = useState("");
  const [token, setToken] = useState<string | null>(null);
  const [retryCount, setRetryCount] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const [errorKey, setErrorKey] = useState<string | null>(null);
  const [errorDetail, setErrorDetail] = useState<string | null>(null);
  const [result, setResult] = useState<PublishResult | null>(null);
  const [copiedField, setCopiedField] = useState<"url" | "password" | null>(
    null,
  );

  useFocusTrap({
    containerRef: dialogRef,
    open,
    onClose,
    initialFocusRef: closeButtonRef,
  });

  if (!open || !recipe) {
    return null;
  }

  const siteKey = deps?.siteKey ?? import.meta.env.VITE_TURNSTILE_SITEKEY ?? "";
  const siteKeyMissing = siteKey === "";

  const handleTrimmedLength = handle.length;
  const submitDisabled =
    submitting ||
    handleTrimmedLength === 0 ||
    handleTrimmedLength > HANDLE_MAX_LENGTH ||
    deletePassword.length < DELETE_PASSWORD_MIN_LENGTH ||
    token === null ||
    siteKeyMissing;

  function handleGeneratePassword() {
    setDeletePassword(generateDeletePassword());
  }

  async function copyToClipboard(text: string, field: "url" | "password") {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedField(field);
      toast.success(t("publish.copied"));
    } catch (error) {
      console.error("Scriptorium投稿情報のコピーに失敗しました", error);
      toast.error(t("publish.copied"));
    }
  }

  async function handleSubmit() {
    if (!recipe || token === null) {
      return;
    }
    setSubmitting(true);
    setErrorKey(null);
    setErrorDetail(null);

    try {
      let cover: Blob | undefined;
      let thumb: Blob | undefined;

      if (selectedCoverId !== null) {
        const getPhotoBlob = deps?.getPhotoBlob ?? defaultGetPhotoBlob;
        const blob = await getPhotoBlob(selectedCoverId);
        if (blob) {
          const composeCover = deps?.composeCover ?? defaultComposeCover;
          const crop: CropRect | null =
            recipe.photoCrops[selectedCoverId] ?? null;
          const composed = await composeCover(blob, crop);
          cover = composed.cover;
          thumb = composed.thumb;
        }
      }

      const lang = i18n.language.startsWith("ja") ? "ja" : "en";
      const doPublish = deps?.publish ?? publishToScriptorium;
      const publishResult = await doPublish({
        doc: recipe,
        handle,
        lang,
        deletePassword,
        turnstileToken: token,
        cover,
        thumb,
      });

      setResult(publishResult);
      setSubmitting(false);
    } catch (error) {
      const code =
        error instanceof PublishError ? error.code : ("unknown" as const);
      setErrorKey(errorCodeToI18nKey(code));
      // validation（＋想定外）は具体メッセージが有用なので併記する
      setErrorDetail(
        error instanceof PublishError && error.code === "validation"
          ? error.message
          : null,
      );
      setToken(null);
      setRetryCount((prev) => prev + 1);
      setSubmitting(false);
    }
  }

  if (result !== null) {
    return (
      <div
        className={styles.backdrop}
        onClick={onClose}
        data-testid="publish-dialog-backdrop"
      >
        <div
          ref={dialogRef}
          className={styles.dialog}
          role="dialog"
          aria-modal="true"
          aria-labelledby="publish-dialog-title"
          onClick={(event) => event.stopPropagation()}
        >
          <div className={styles.header}>
            <h2 id="publish-dialog-title" className={styles.title}>
              {t("publish.completionTitle")}
            </h2>
            <button
              ref={closeButtonRef}
              type="button"
              className={styles.closeButton}
              onClick={onClose}
              aria-label={t("editor.closePanel")}
            >
              ✕
            </button>
          </div>

          <div className={styles.body}>
            <div className={styles.section}>
              <span className={styles.label}>
                {t("publish.completionUrlLabel")}
              </span>
              <div className={styles.completionRow}>
                <a
                  className={styles.completionValue}
                  href={result.url}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  {result.url}
                </a>
                <button
                  type="button"
                  className={styles.copyButton}
                  onClick={() => void copyToClipboard(result.url, "url")}
                >
                  {copiedField === "url"
                    ? t("publish.copied")
                    : t("publish.copy")}
                </button>
              </div>
            </div>

            <div className={styles.section}>
              <span className={styles.label}>
                {t("publish.completionPwLabel")}
              </span>
              <div className={styles.completionRow}>
                <span className={styles.completionValue}>{deletePassword}</span>
                <button
                  type="button"
                  className={styles.copyButton}
                  onClick={() =>
                    void copyToClipboard(deletePassword, "password")
                  }
                >
                  {copiedField === "password"
                    ? t("publish.copied")
                    : t("publish.copy")}
                </button>
              </div>
              <p className={styles.warningNotice}>
                {t("publish.completionPwWarning")}
              </p>
            </div>

            <button
              type="button"
              className={styles.closeCompletionButton}
              onClick={onClose}
            >
              {t("publish.close")}
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div
      className={styles.backdrop}
      onClick={onClose}
      data-testid="publish-dialog-backdrop"
    >
      <div
        ref={dialogRef}
        className={styles.dialog}
        role="dialog"
        aria-modal="true"
        aria-labelledby="publish-dialog-title"
        onClick={(event) => event.stopPropagation()}
      >
        <div className={styles.header}>
          <h2 id="publish-dialog-title" className={styles.title}>
            {t("publish.title")}
          </h2>
          <button
            ref={closeButtonRef}
            type="button"
            className={styles.closeButton}
            onClick={onClose}
            aria-label={t("editor.closePanel")}
          >
            ✕
          </button>
        </div>

        <div className={styles.body}>
          <div className={styles.section}>
            <span className={styles.label}>{t("publish.coverLabel")}</span>
            {overviewPhotoIds.length === 0 ? (
              <p className={styles.notice}>{t("publish.coverNone")}</p>
            ) : (
              <div className={styles.coverList}>
                {overviewPhotoIds.map((photoId) => (
                  <PublishCoverOption
                    key={photoId}
                    photoId={photoId}
                    crop={recipe.photoCrops[photoId] ?? null}
                    selected={selectedCoverId === photoId}
                    onSelect={() => setSelectedCoverId(photoId)}
                  />
                ))}
                <button
                  type="button"
                  className={`${styles.coverOption} ${styles.coverNoneOption} ${
                    selectedCoverId === null ? styles.coverOptionSelected : ""
                  }`}
                  onClick={() => setSelectedCoverId(null)}
                >
                  {t("publish.coverNone")}
                </button>
              </div>
            )}
          </div>

          <div className={styles.section}>
            <label className={styles.label} htmlFor="publish-handle-input">
              {t("publish.handleLabel")}
            </label>
            <input
              id="publish-handle-input"
              type="text"
              className={styles.textInput}
              value={handle}
              maxLength={HANDLE_MAX_LENGTH}
              placeholder={t("publish.handlePlaceholder")}
              onChange={(event) => setHandle(event.target.value)}
            />
          </div>

          <div className={styles.section}>
            <label className={styles.label} htmlFor="publish-delete-pw-input">
              {t("publish.deletePwLabel")}
            </label>
            <div className={styles.deletePwRow}>
              <input
                id="publish-delete-pw-input"
                type="text"
                className={styles.textInput}
                value={deletePassword}
                onChange={(event) => setDeletePassword(event.target.value)}
              />
              <button
                type="button"
                className={styles.generateButton}
                onClick={handleGeneratePassword}
              >
                {t("publish.deletePwGenerate")}
              </button>
            </div>
            <p className={styles.hint}>{t("publish.deletePwHint")}</p>
          </div>

          <p className={styles.notice}>{t("publish.reductionNotice")}</p>
          <p className={styles.notice}>{t("publish.notBackupNotice")}</p>
          <p className={styles.notice}>
            <a
              href="https://scriptorium.coat-codex.com/privacy"
              target="_blank"
              rel="noopener noreferrer"
            >
              {t("publish.privacyLinkLabel")}
            </a>
          </p>

          {siteKeyMissing ? (
            <p className={styles.errorNotice}>
              {t("publish.turnstileUnconfigured")}
            </p>
          ) : (
            <TurnstileWidget
              key={retryCount}
              siteKey={siteKey}
              onToken={setToken}
            />
          )}

          {errorKey !== null && (
            <p className={styles.errorNotice}>
              {t(errorKey)}
              {errorDetail !== null && (
                <>
                  <br />
                  {errorDetail}
                </>
              )}
            </p>
          )}

          <button
            type="button"
            className={styles.submitButton}
            disabled={submitDisabled}
            onClick={() => void handleSubmit()}
          >
            {submitting ? t("publish.submitting") : t("publish.submit")}
          </button>
        </div>
      </div>
    </div>
  );
}

interface PublishCoverOptionProps {
  photoId: string;
  crop: CropRect | null;
  selected: boolean;
  onSelect: () => void;
}

function PublishCoverOption({
  photoId,
  crop,
  selected,
  onSelect,
}: PublishCoverOptionProps) {
  const [url, setUrl] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void resolvePhotoUrl(photoId).then((resolved) => {
      if (!cancelled && resolved !== null) {
        setUrl(resolved);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [photoId]);

  return (
    <button
      type="button"
      className={`${styles.coverOption} ${
        selected ? styles.coverOptionSelected : ""
      }`}
      onClick={onSelect}
    >
      {url !== null && (
        <CroppedPhoto
          className={styles.coverThumb}
          src={url}
          crop={crop}
          alt=""
        />
      )}
    </button>
  );
}
