// components/part-editor/MemoField.tsx — 工程メモの複数行テキスト（技術計画v2.2 §4.2 T24）
//
// Step.memo（models/recipe.ts、必須・空文字許容の文字列）を編集する薄い制御コンポーネント。
// バリデーション等のロジックは持たず、value/onChangeをそのまま中継する。

import { useTranslation } from "react-i18next";
import styles from "./MemoField.module.css";

interface MemoFieldProps {
  value: string;
  onChange: (next: string) => void;
}

function MemoField({ value, onChange }: MemoFieldProps) {
  const { t } = useTranslation();

  return (
    <label className={styles.root}>
      <span className={styles.label}>{t("editor.memoLabel")}</span>
      <textarea
        className={styles.textarea}
        value={value}
        placeholder={t("editor.memoPlaceholder")}
        onChange={(event) => onChange(event.target.value)}
      />
    </label>
  );
}

export default MemoField;
