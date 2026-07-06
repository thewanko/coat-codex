// components/part-editor/ToolSelect.tsx — 工程のツール選択（技術計画v2.3 §3.3 StepCard・§4.2 T24・V-3）
//
// 編集中レシピのtools（RecipeDoc.tools）をuseRecipeStore（T16）から取得して候補表示する。
// Step.toolIds（models/recipe.ts）はtools[].idを参照する配列（§2.6参照整合性）で、
// 複数選択・重複不可（INV-9）。
//
// v2.3: 「その場追加＋登録済み選択」に拡張。tools0件時もeditor.toolEmpty案内は出さず、
// 追加フォームを直接表示する（登録済みが1件もない状態でも「ツール指定がない」ように
// 見えないようにするための変更）。追加時は既存tools内に同名（トリム・大文字小文字無視）が
// あれば新規登録せずそのツールを当該工程にチェックする（重複ツール防止。ToolListEditorと
// 同じ比較規約）。なければtool_<uuid>のToolをuseRecipeStore.updateRecipe経由でdoc.toolsへ
// 追加し、当該工程のtoolIds（onChange）にも即チェックする。
//
// 参照同一性（M4必須事項②）: updateRecipeへ渡すupdaterはtools配列のみをスプレッド追加で
// 差し替え、baseSteps/parts/palette等は元のdocの参照をそのまま返す（ToolListEditorと同方針）。
//
// 制御コンポーネント（value=toolIds/onChange）で、選択状態自体は持たない。

import { useState } from "react";
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
  const updateRecipe = useRecipeStore((state) => state.updateRecipe);
  const [draft, setDraft] = useState("");

  function handleToggle(toolId: string, checked: boolean) {
    if (checked) {
      if (value.includes(toolId)) return;
      onChange([...value, toolId]);
      return;
    }
    onChange(value.filter((id) => id !== toolId));
  }

  function handleAdd() {
    const trimmed = draft.trim();
    if (trimmed === "") {
      return;
    }
    const existing = tools.find(
      (tool) => tool.name.toLowerCase() === trimmed.toLowerCase(),
    );
    if (existing) {
      handleToggle(existing.id, true);
      setDraft("");
      return;
    }
    const newTool: Tool = {
      id: `tool_${crypto.randomUUID()}`,
      name: trimmed,
      note: null,
    };
    updateRecipe((current) => ({
      ...current,
      tools: [...current.tools, newTool],
    }));
    if (!value.includes(newTool.id)) {
      onChange([...value, newTool.id]);
    }
    setDraft("");
  }

  function handleKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    if (event.key === "Enter") {
      event.preventDefault();
      handleAdd();
    }
  }

  return (
    <fieldset className={styles.root}>
      <legend className={styles.label}>{t("editor.toolLabel")}</legend>
      {tools.length > 0 && (
        <div className={styles.list}>
          {tools.map((tool) => (
            <label key={tool.id} className={styles.item}>
              <input
                type="checkbox"
                className={styles.checkbox}
                checked={value.includes(tool.id)}
                onChange={(event) =>
                  handleToggle(tool.id, event.target.checked)
                }
              />
              {tool.name}
            </label>
          ))}
        </div>
      )}
      <div className={styles.addRow}>
        <span className={styles.addLabel}>{t("editor.toolAdd")}</span>
        <div className={styles.addInputRow}>
          <input
            type="text"
            className={styles.addInput}
            placeholder={t("editor.toolNamePlaceholder")}
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={handleKeyDown}
          />
          <button
            type="button"
            className={styles.addButton}
            onClick={handleAdd}
          >
            {t("editor.toolAddButton")}
          </button>
        </div>
      </div>
    </fieldset>
  );
}

export default ToolSelect;
