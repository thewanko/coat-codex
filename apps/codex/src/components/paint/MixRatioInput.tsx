import { useEffect, useState } from "react";
import type { ChangeEvent, KeyboardEvent } from "react";
import { useTranslation } from "react-i18next";
import {
  commitRatioInput,
  formatRatioText,
  isMixTotalValid,
  parseRatioText,
  reducePercentsToRatio,
  sumPercents,
  type MixState,
} from "@coat-codex/recipe-core";
import styles from "./MixRatioInput.module.css";

interface MixRatioInputProps {
  state: MixState;
  onChange: (next: MixState) => void;
}

/** 合計100のとき reducePercentsToRatio の結果を "5:3:2" 文字列へ整形。約分不能・合計≠100はnull */
function derivedRatioText(state: MixState): string | null {
  if (state.mix === null) return null;
  const ratio = reducePercentsToRatio(state.mix);
  if (ratio === null) return null;
  return formatRatioText(ratio);
}

function MixRatioInput({ state, onChange }: MixRatioInputProps) {
  const { t } = useTranslation();
  const totalValid = isMixTotalValid(state.paints, state.mix);
  const total = sumPercents(state.mix);

  const [draft, setDraft] = useState<string>(
    () => derivedRatioText(state) ?? "",
  );
  const [isError, setIsError] = useState(false);

  // 外部状態（合計100の導出表示）が変わったら編集していない限り追従させる
  useEffect(() => {
    setDraft(derivedRatioText(state) ?? "");
    setIsError(false);
    // state.mix の中身が変わるたびに再同期する
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.mix, state.paints.length]);

  if (state.mix === null) {
    return null;
  }

  function handleChange(event: ChangeEvent<HTMLInputElement>) {
    setDraft(event.target.value);
    if (isError) setIsError(false);
  }

  function commit() {
    if (!totalValid) return;

    const trimmed = draft.trim();
    if (trimmed === "") {
      setDraft(derivedRatioText(state) ?? "");
      setIsError(false);
      return;
    }

    const ratios = parseRatioText(trimmed);
    if (ratios === null || ratios.length !== state.paints.length) {
      setIsError(true);
      return;
    }

    const next = commitRatioInput(state, ratios);
    onChange(next);
    setIsError(false);
  }

  function handleBlur() {
    commit();
  }

  function handleKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "Enter") {
      event.preventDefault();
      commit();
    }
  }

  const indicatorClass = totalValid
    ? `${styles.dot} ${styles.dotSuccess}`
    : `${styles.dot} ${styles.dotDanger}`;

  const ratioInputClass = [
    styles.ratioInput,
    !totalValid ? styles.ratioInputDisabled : "",
    isError ? styles.ratioInputError : "",
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <div className={styles.root}>
      <div className={styles.row}>
        <span className={styles.label}>{t("mix.label")}</span>
        <input
          type="text"
          className={ratioInputClass}
          value={totalValid ? draft : "—"}
          placeholder={t("mix.ratioHint")}
          disabled={!totalValid}
          onChange={handleChange}
          onBlur={handleBlur}
          onKeyDown={handleKeyDown}
          aria-invalid={isError}
          aria-label={t("mix.label")}
        />
        <span className={styles.total}>
          <span className={indicatorClass} aria-hidden="true" />
          {t("mix.total", { value: total })}
        </span>
      </div>
      {!totalValid && <p className={styles.warning}>{t("mix.totalWarning")}</p>}
    </div>
  );
}

export default MixRatioInput;
