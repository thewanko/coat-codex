// components/overview/ShareTextEditor.tsx — 投稿テキスト編集（技術計画v2.2 §4.2 T39・§3.4手順3）
//
// 既定文を初期値としたtextarea（編集可）＋ターゲット別カウンタ（target.countText）＋
// 超過時警告表示＋「自動トリム」ボタン（target.trimToLimit適用。#coat-codexはトリム対象外＝末尾維持）。
// 値・変更はShareDialog側で状態管理し、本コンポーネントは制御コンポーネントとして振る舞う。

import { useTranslation } from "react-i18next";
import type { SnsTarget } from "../../lib/sns/types";
import styles from "./ShareTextEditor.module.css";

interface ShareTextEditorProps {
  target: SnsTarget;
  value: string;
  onChange: (value: string) => void;
}

function ShareTextEditor({ target, value, onChange }: ShareTextEditorProps) {
  const { t } = useTranslation();
  const { count, limit, over } = target.countText(value);

  function handleTrim() {
    onChange(target.trimToLimit(value));
  }

  return (
    <div className={styles.root}>
      <textarea
        className={styles.textarea}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        rows={4}
        aria-label={t("share.textLabel")}
        data-testid="share-text-textarea"
      />
      <div className={styles.counterRow}>
        <span
          className={over ? styles.counterOver : styles.counter}
          data-testid="share-text-counter"
        >
          {t("share.counter", { count, limit })}
        </span>
        {over && (
          <>
            <span className={styles.warning} role="status" aria-live="polite">
              {t("share.counterWarning")}
            </span>
            <button
              type="button"
              className={styles.trimButton}
              onClick={handleTrim}
            >
              {t("share.autoTrim")}
            </button>
          </>
        )}
      </div>
    </div>
  );
}

export default ShareTextEditor;
