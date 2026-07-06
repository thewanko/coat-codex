// components/part-editor/TechniqueSelect.tsx — 工程の技法選択（技術計画v2.2 §4.2 T24）
//
// プリセット（src/lib/techniques.ts の10種）から選択 or 自由入力の切替。
// Step.technique（@coat-codex/recipe-core）の不変条件INV-8（presetKeyとlabelを同時に
// 非nullにできない）を、選択切替時に他方をnullへ倒すことでUI側から守る。
// 制御コンポーネント（value/onChange）で状態は持たず、StepCard（T25）から使う。

import { useTranslation } from "react-i18next";
import { TECHNIQUE_PRESET_KEYS } from "../../lib/techniques";
import styles from "./TechniqueSelect.module.css";

/** Step.technique（@coat-codex/recipe-core）と同形。値も"presetKey/labelの排他"を維持したまま渡す */
export interface TechniqueValue {
  presetKey: string | null;
  label: string | null;
}

interface TechniqueSelectProps {
  value: TechniqueValue;
  onChange: (next: TechniqueValue) => void;
}

const CUSTOM_VALUE = "__custom__";

function TechniqueSelect({ value, onChange }: TechniqueSelectProps) {
  const { t } = useTranslation();
  const isCustomMode = value.presetKey === null;

  function handleModeChange(event: React.ChangeEvent<HTMLSelectElement>) {
    const next = event.target.value;
    if (next === CUSTOM_VALUE) {
      onChange({ presetKey: null, label: value.label ?? "" });
      return;
    }
    onChange({ presetKey: next, label: null });
  }

  function handleLabelChange(event: React.ChangeEvent<HTMLInputElement>) {
    onChange({ presetKey: null, label: event.target.value });
  }

  return (
    <div className={styles.root}>
      <span className={styles.label}>{t("editor.techniqueLabel")}</span>
      <select
        className={styles.select}
        aria-label={t("editor.techniqueLabel")}
        value={value.presetKey ?? CUSTOM_VALUE}
        onChange={handleModeChange}
      >
        {TECHNIQUE_PRESET_KEYS.map((presetKey) => (
          <option key={presetKey} value={presetKey}>
            {t(`techniques.${presetKey}`)}
          </option>
        ))}
        <option value={CUSTOM_VALUE}>{t("editor.techniqueCustom")}</option>
      </select>
      {isCustomMode && (
        <input
          type="text"
          className={styles.textInput}
          value={value.label ?? ""}
          placeholder={t("editor.techniquePlaceholder")}
          aria-label={t("editor.techniqueCustom")}
          onChange={handleLabelChange}
        />
      )}
    </div>
  );
}

export default TechniqueSelect;
