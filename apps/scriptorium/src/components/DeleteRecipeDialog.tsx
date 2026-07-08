// components/DeleteRecipeDialog.tsx — 本人削除ダイアログ（技術計画v1 S6 ST-35・§4.5）
//
// phase: input → submitting → done | error（errorからinputへ戻って再入力可）。
// codexのConfirmDialog/PublishDialogと同じ意匠・a11yイディオムを踏襲するが、
// useFocusTrapは@coat-codex/recipe-ui/apps/codex側にしかなくこのタスクの成果物
// ファイル外のため、Escape close・初期/復帰フォーカス・backdropクリックはこの
// コンポーネント内に自己完結で実装する（submitting中は閉じない）。

import { useEffect, useRef, useState } from "react";
import type { FormEvent } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router";
import { deleteRecipe, type DeleteRecipeErrorCode } from "../lib/api";
import styles from "./DeleteRecipeDialog.module.css";

type Phase = "input" | "submitting" | "done" | "error";

interface DeleteRecipeDialogProps {
  open: boolean;
  recipeId: string;
  onClose: () => void;
  /** テスト容易化用のfetch差し替え（api.deleteRecipeへ透過） */
  fetchImpl?: typeof fetch;
}

function errorCodeToI18nKey(code: DeleteRecipeErrorCode): string {
  switch (code) {
    case "wrongPassword":
      return "deleteRecipe.errWrongPassword";
    case "rateLimited":
      return "deleteRecipe.errRateLimited";
    case "notFound":
      return "deleteRecipe.errNotFound";
    case "badRequest":
      return "deleteRecipe.errBadRequest";
    default:
      return "deleteRecipe.errGeneric";
  }
}

function DeleteRecipeDialog({
  open,
  recipeId,
  onClose,
  fetchImpl,
}: DeleteRecipeDialogProps) {
  const { t } = useTranslation();
  const dialogRef = useRef<HTMLDivElement>(null);
  const passwordInputRef = useRef<HTMLInputElement>(null);

  const [phase, setPhase] = useState<Phase>("input");
  const [password, setPassword] = useState("");
  const [errorKey, setErrorKey] = useState<string | null>(null);
  const [serverError, setServerError] = useState<string | null>(null);

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

  // 初期フォーカス（PW入力）。openになった時の一度だけでよい。
  useEffect(() => {
    if (!open) {
      return;
    }
    passwordInputRef.current?.focus();
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
      setPassword("");
      setErrorKey(null);
      setServerError(null);
    }
  }, [open]);

  if (!open) {
    return null;
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (password.length === 0 || phase === "submitting") {
      return;
    }
    setPhase("submitting");
    setErrorKey(null);
    setServerError(null);

    const result = await deleteRecipe(recipeId, password, fetchImpl);
    if (result.ok) {
      setPhase("done");
      return;
    }

    setErrorKey(errorCodeToI18nKey(result.code));
    setServerError(result.serverError ?? null);
    setPhase("error");
  }

  return (
    <div
      className={styles.backdrop}
      onClick={handleClose}
      data-testid="delete-recipe-dialog-backdrop"
    >
      <div
        ref={dialogRef}
        className={styles.dialog}
        role="dialog"
        aria-modal="true"
        aria-labelledby="delete-recipe-dialog-title"
        onClick={(event) => event.stopPropagation()}
      >
        {phase === "done" ? (
          <>
            <h2 id="delete-recipe-dialog-title" className={styles.title}>
              {t("deleteRecipe.doneTitle")}
            </h2>
            <p className={styles.description}>{t("deleteRecipe.doneBody")}</p>
            <Link className={styles.backLink} to="/">
              {t("deleteRecipe.backToFeed")}
            </Link>
          </>
        ) : (
          <form onSubmit={(event) => void handleSubmit(event)}>
            <h2 id="delete-recipe-dialog-title" className={styles.title}>
              {t("deleteRecipe.title")}
            </h2>
            <p className={styles.description}>
              {t("deleteRecipe.description")}
            </p>

            <label className={styles.pwLabel} htmlFor="delete-recipe-pw-input">
              {t("deleteRecipe.pwLabel")}
            </label>
            <input
              ref={passwordInputRef}
              id="delete-recipe-pw-input"
              type="password"
              autoComplete="off"
              className={styles.pwInput}
              value={password}
              disabled={phase === "submitting"}
              onChange={(event) => setPassword(event.target.value)}
            />

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
                {t("deleteRecipe.cancel")}
              </button>
              <button
                type="submit"
                className={styles.confirm}
                disabled={password.length === 0 || phase === "submitting"}
              >
                {phase === "submitting"
                  ? t("deleteRecipe.submitting")
                  : t("deleteRecipe.confirm")}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}

export default DeleteRecipeDialog;
