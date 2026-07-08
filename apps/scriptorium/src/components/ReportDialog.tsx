// components/ReportDialog.tsx — 通報ダイアログ（技術計画v1 S6 ST-30・§4.2）
//
// phase: input → submitting → done | error（errorからinputへ戻って再入力可）。
// DeleteRecipeDialogと同じ意匠・a11yイディオム（Escape close・初期/復帰フォーカス・
// backdropクリック・submitting中は閉じない）を踏襲する。
// Turnstile tokenは単回使用のため、403（turnstile）時はtokenを無効化し
// TurnstileWidgetをkey={retryCount}で再マウントして再チャレンジ可能にする
// （PublishDialogと同じ方式）。

import { useEffect, useRef, useState } from "react";
import type { FormEvent } from "react";
import { useTranslation } from "react-i18next";
import { TurnstileWidget } from "@coat-codex/recipe-ui";
import { reportRecipe, type ReportRecipeErrorCode } from "../lib/api";
import styles from "./ReportDialog.module.css";

type Phase = "input" | "submitting" | "done" | "error";
type ReportReason = "spam" | "nsfw" | "copyright" | "other";

const REASONS: ReportReason[] = ["spam", "nsfw", "copyright", "other"];
const DETAIL_MAX_LENGTH = 1000;

interface ReportDialogProps {
  open: boolean;
  recipeId: string;
  onClose: () => void;
  /** テスト容易化用のfetch差し替え（api.reportRecipeへ透過） */
  fetchImpl?: typeof fetch;
  /** テスト容易化用のsiteKey差し替え（未指定時はVITE_TURNSTILE_SITEKEY） */
  siteKey?: string;
}

function errorCodeToI18nKey(code: ReportRecipeErrorCode): string {
  switch (code) {
    case "turnstile":
      return "report.errTurnstile";
    case "rateLimited":
      return "report.errRateLimited";
    case "notFound":
      return "report.errNotFound";
    default:
      return "report.errGeneric";
  }
}

function reasonI18nKey(reason: ReportReason): string {
  switch (reason) {
    case "spam":
      return "report.reasonSpam";
    case "nsfw":
      return "report.reasonNsfw";
    case "copyright":
      return "report.reasonCopyright";
    default:
      return "report.reasonOther";
  }
}

function ReportDialog({
  open,
  recipeId,
  onClose,
  fetchImpl,
  siteKey,
}: ReportDialogProps) {
  const { t } = useTranslation();
  const dialogRef = useRef<HTMLDivElement>(null);
  const firstRadioRef = useRef<HTMLInputElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);

  const [phase, setPhase] = useState<Phase>("input");
  const [reason, setReason] = useState<ReportReason | null>(null);
  const [detail, setDetail] = useState("");
  const [token, setToken] = useState<string | null>(null);
  const [retryCount, setRetryCount] = useState(0);
  const [errorKey, setErrorKey] = useState<string | null>(null);
  const [serverError, setServerError] = useState<string | null>(null);

  const resolvedSiteKey =
    siteKey ?? import.meta.env.VITE_TURNSTILE_SITEKEY ?? "";
  const siteKeyMissing = resolvedSiteKey === "";

  const closing = phase !== "submitting";

  function handleClose() {
    if (!closing) {
      return;
    }
    onClose();
  }

  // 復帰フォーカス: openになる直前にフォーカスされていた要素（=トリガーボタン）へ、
  // 閉じた時／アンマウント時に戻す。
  useEffect(() => {
    if (!open) {
      return;
    }
    const previouslyFocused =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;
    return () => {
      if (previouslyFocused && document.contains(previouslyFocused)) {
        previouslyFocused.focus();
      }
    };
  }, [open]);

  // 初期フォーカス（最初のラジオボタン）。openになった時の一度だけでよい。
  useEffect(() => {
    if (!open) {
      return;
    }
    firstRadioRef.current?.focus();
  }, [open]);

  // Escapeで閉じる（submitting中は無効）。
  useEffect(() => {
    if (!open) {
      return;
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape" && closing) {
        onClose();
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [open, closing, onClose]);

  // ダイアログが閉じたら（親がopen=falseにした）内部状態をリセットする。
  useEffect(() => {
    if (!open) {
      setPhase("input");
      setReason(null);
      setDetail("");
      setToken(null);
      setRetryCount(0);
      setErrorKey(null);
      setServerError(null);
    }
  }, [open]);

  if (!open) {
    return null;
  }

  const submitDisabled =
    reason === null || token === null || phase === "submitting";

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (reason === null || token === null || phase === "submitting") {
      return;
    }
    setPhase("submitting");
    setErrorKey(null);
    setServerError(null);

    const trimmedDetail = detail.trim();
    const result = await reportRecipe(
      recipeId,
      {
        reason,
        detail: trimmedDetail.length > 0 ? trimmedDetail : undefined,
        turnstileToken: token,
      },
      fetchImpl,
    );

    if (result.ok) {
      setPhase("done");
      return;
    }

    setErrorKey(errorCodeToI18nKey(result.code));
    setServerError(result.serverError ?? null);
    if (result.code === "turnstile") {
      setToken(null);
      setRetryCount((prev) => prev + 1);
    }
    setPhase("error");
  }

  return (
    <div
      className={styles.backdrop}
      onClick={handleClose}
      data-testid="report-recipe-dialog-backdrop"
    >
      <div
        ref={dialogRef}
        className={styles.dialog}
        role="dialog"
        aria-modal="true"
        aria-labelledby="report-recipe-dialog-title"
        onClick={(event) => event.stopPropagation()}
      >
        {phase === "done" ? (
          <>
            <h2 id="report-recipe-dialog-title" className={styles.title}>
              {t("report.doneTitle")}
            </h2>
            <p className={styles.description}>{t("report.doneBody")}</p>
            <button
              ref={closeButtonRef}
              type="button"
              className={styles.closeCompletionButton}
              onClick={handleClose}
            >
              {t("report.close")}
            </button>
          </>
        ) : (
          <form onSubmit={(event) => void handleSubmit(event)}>
            <h2 id="report-recipe-dialog-title" className={styles.title}>
              {t("report.title")}
            </h2>
            <p className={styles.description}>{t("report.description")}</p>

            <fieldset
              className={styles.fieldset}
              disabled={phase === "submitting"}
            >
              <legend className={styles.legend}>
                {t("report.reasonLabel")}
              </legend>
              {REASONS.map((value, index) => (
                <div className={styles.reasonOption} key={value}>
                  <input
                    ref={index === 0 ? firstRadioRef : undefined}
                    type="radio"
                    id={`report-reason-${value}`}
                    name="report-reason"
                    className={styles.reasonRadio}
                    value={value}
                    checked={reason === value}
                    onChange={() => setReason(value)}
                  />
                  <label
                    className={styles.reasonOptionLabel}
                    htmlFor={`report-reason-${value}`}
                  >
                    {t(reasonI18nKey(value))}
                  </label>
                </div>
              ))}
            </fieldset>

            <label className={styles.detailLabel} htmlFor="report-detail-input">
              {t("report.detailLabel")}
            </label>
            <textarea
              id="report-detail-input"
              className={styles.detailInput}
              value={detail}
              maxLength={DETAIL_MAX_LENGTH}
              placeholder={t("report.detailPlaceholder")}
              disabled={phase === "submitting"}
              onChange={(event) => setDetail(event.target.value)}
            />

            {siteKeyMissing ? (
              <p className={styles.turnstileNotice}>
                {t("report.turnstileNotConfigured")}
              </p>
            ) : (
              <TurnstileWidget
                key={retryCount}
                siteKey={resolvedSiteKey}
                onToken={setToken}
              />
            )}

            {phase === "error" && errorKey !== null && (
              <p className={styles.errorNotice} role="alert">
                {t(errorKey)}
                {serverError !== null && (
                  <>
                    {" "}
                    <code className={styles.errorDetail}>{serverError}</code>
                  </>
                )}
              </p>
            )}

            <div className={styles.actions}>
              <button
                type="button"
                className={styles.cancel}
                disabled={phase === "submitting"}
                onClick={handleClose}
              >
                {t("report.cancel")}
              </button>
              <button
                type="submit"
                className={styles.confirm}
                disabled={submitDisabled}
              >
                {phase === "submitting"
                  ? t("report.submitting")
                  : t("report.submit")}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}

export default ReportDialog;
