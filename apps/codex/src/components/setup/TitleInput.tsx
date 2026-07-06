// components/setup/TitleInput.tsx — レシピタイトル入力（技術計画v2.2 §4.2 T23・D-8）
//
// ドラフト既定タイトル規約（D-8・§2.5・§3.1）:
// 「入力欄は編集中は空のまま維持し、blur時にtrim後空なら補完後の既定名
// （i18nキー recipe.untitledTitle）を表示する」。stateのtitle自体を書き換えるのは
// 保存直前（useRecipeStoreのwithResolvedTitle）の責務であり、本コンポーネントは
// 表示上の既定名フォールバックのみを行う（フォーカスを当てれば常にユーザーの
// 生入力（空を含む）へ戻れる）。

import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import styles from "./TitleInput.module.css";

interface TitleInputProps {
  value: string;
  onCommit: (title: string) => void;
}

function TitleInput({ value, onCommit }: TitleInputProps) {
  const { t } = useTranslation();
  const [draft, setDraft] = useState(value);
  const [focused, setFocused] = useState(false);
  const focusedRef = useRef(focused);
  focusedRef.current = focused;

  // 外部（ロード・別レシピへの切替）でvalueが変わったら編集中でない限り追従する。
  // 依存はvalueのみ（focusedを依存に含めると、blurでfocusedをfalseにした直後の
  // 再レンダーでこのeffectが「まだ親から反映されていない古いvalue」でdraftを
  // 巻き戻してしまうため、判定はrefで行いeffect自体の再実行トリガーにはしない）。
  useEffect(() => {
    if (!focusedRef.current) {
      setDraft(value);
    }
  }, [value]);

  const untitledLabel = t("recipe.untitledTitle");
  const displayValue = focused
    ? draft
    : draft.trim() === ""
      ? untitledLabel
      : draft;

  function handleFocus() {
    setFocused(true);
  }

  function handleBlur() {
    setFocused(false);
    if (draft !== value) {
      onCommit(draft);
    }
  }

  return (
    <label className={styles.field}>
      <span className={styles.label}>{t("setup.titleLabel")}</span>
      <input
        type="text"
        className={styles.input}
        value={displayValue}
        placeholder={t("setup.titlePlaceholder")}
        onFocus={handleFocus}
        onChange={(event) => setDraft(event.target.value)}
        onBlur={handleBlur}
      />
    </label>
  );
}

export default TitleInput;
