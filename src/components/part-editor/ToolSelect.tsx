// components/part-editor/ToolSelect.tsx — 工程のツール選択（技術計画v2.2 §4.2 T24・V-3）
//
// 編集中レシピのtools（RecipeDoc.tools）をuseRecipeStore（T16）から取得して候補表示する。
// Step.toolIds（models/recipe.ts）はtools[].idを参照する配列（§2.6参照整合性）で、
// 複数選択・重複不可（INV-9）。tools未登録時はeditor.toolEmptyの案内を表示する。
// 制御コンポーネント（value=toolIds/onChange）で、選択状態自体は持たない。

import { useTranslation } from "react-i18next";
import { useRecipeStore } from "../../stores/useRecipeStore";
import type { Tool } from "../../models/recipe";
import styles from "./ToolSelect.module.css";

interface ToolSelectProps {
  /** Step.toolIds — tools[].idを参照するID配列（重複なし） */
  value: string[];
  onChange: (next: string[]) => void;
}

// doc未ロード時のセレクタ戻り値を固定参照にする（毎回新規配列を返すとuseSyncExternalStoreの
// getSnapshotが呼び出しごとに変化した扱いとなり、無限レンダーループを引き起こすため）。
const EMPTY_TOOLS: Tool[] = [];

function ToolSelect({ value, onChange }: ToolSelectProps) {
  const { t } = useTranslation();
  const tools = useRecipeStore((state) => state.doc?.tools ?? EMPTY_TOOLS);

  if (tools.length === 0) {
    return <p className={styles.empty}>{t("editor.toolEmpty")}</p>;
  }

  function handleToggle(toolId: string, checked: boolean) {
    if (checked) {
      if (value.includes(toolId)) return;
      onChange([...value, toolId]);
      return;
    }
    onChange(value.filter((id) => id !== toolId));
  }

  return (
    <fieldset className={styles.root}>
      <legend className={styles.label}>{t("editor.toolLabel")}</legend>
      <div className={styles.list}>
        {tools.map((tool) => (
          <label key={tool.id} className={styles.item}>
            <input
              type="checkbox"
              className={styles.checkbox}
              checked={value.includes(tool.id)}
              onChange={(event) => handleToggle(tool.id, event.target.checked)}
            />
            {tool.name}
          </label>
        ))}
      </div>
    </fieldset>
  );
}

export default ToolSelect;
