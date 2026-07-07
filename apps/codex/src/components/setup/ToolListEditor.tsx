// components/setup/ToolListEditor.tsx — 使用ツール先行登録（技術計画v2.2 §4.2 T23・D-7・§2.6）
//
// テキスト入力＋追加ボタンでtoolsへ追加、各行に使用数バッジ（@coat-codex/recipe-core
// countToolUsage）を表示し、使用中（工程から参照）ツールは削除不可＋同注記、
// 使用数0は「未使用」バッジ（faint枠）＋削除✕活性
// （デザイン仕様書§4「PaletteEditor / ToolListEditor行」）。重複追加を防止する
// （trim後の名前が既存toolsと大文字小文字を区別せず一致する場合は追加しない）。
//
// 参照同一性: 追加はスプレッド追加、削除はfilterのみを用いる（PaletteEditorと同方針。
// M4必須事項②はpalette要素の話だがtools側も同一のupdater規律に揃える）。

import { useState } from "react";
import { useTranslation } from "react-i18next";
import {
  countToolUsage,
  type RecipeDoc,
  type Tool,
} from "@coat-codex/recipe-core";
import styles from "./EditorRow.module.css";
import sectionStyles from "./SetupSection.module.css";

interface ToolListEditorProps {
  doc: RecipeDoc;
  onUpdate: (updater: (doc: RecipeDoc) => RecipeDoc) => void;
}

function ToolListEditor({ doc, onUpdate }: ToolListEditorProps) {
  const { t } = useTranslation();
  const [draft, setDraft] = useState("");

  function handleAdd() {
    const trimmed = draft.trim();
    if (trimmed === "") {
      return;
    }
    const isDuplicate = doc.tools.some(
      (tool) => tool.name.toLowerCase() === trimmed.toLowerCase(),
    );
    if (isDuplicate) {
      return;
    }
    const newTool: Tool = {
      id: `tool_${crypto.randomUUID()}`,
      name: trimmed,
      note: null,
    };
    onUpdate((current) => ({
      ...current,
      tools: [...current.tools, newTool],
    }));
    setDraft("");
  }

  function handleRemove(toolId: string) {
    onUpdate((current) => ({
      ...current,
      tools: current.tools.filter((t) => t.id !== toolId),
    }));
  }

  function handleKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    if (event.key === "Enter") {
      event.preventDefault();
      handleAdd();
    }
  }

  return (
    <section className={sectionStyles.section}>
      <h2 className={sectionStyles.heading}>{t("setup.toolsLabel")}</h2>

      <ul className={styles.list}>
        {doc.tools.map((tool) => {
          const usageCount = countToolUsage(doc, tool.id);
          const inUse = usageCount > 0;
          return (
            <li key={tool.id} className={styles.row}>
              <span>{tool.name}</span>
              {inUse ? (
                <span className={styles.count} data-testid="tool-usage-count">
                  {t("setup.usedInSteps", { count: usageCount })}
                </span>
              ) : (
                <span
                  className={styles.unusedBadge}
                  data-testid="tool-usage-count"
                >
                  {t("setup.unused")}
                </span>
              )}
              <button
                type="button"
                className={styles.removeButton}
                aria-label={`${t("photo.delete")} ${tool.name}`}
                disabled={inUse}
                onClick={() => handleRemove(tool.id)}
              >
                ✕
              </button>
              {inUse && (
                <p className={styles.inUseNote}>{t("setup.inUseNote")}</p>
              )}
            </li>
          );
        })}
      </ul>

      <div className={styles.addRow}>
        <input
          type="text"
          className={styles.toolInput}
          placeholder={t("setup.toolPlaceholder")}
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={handleKeyDown}
        />
        <button type="button" className={styles.addButton} onClick={handleAdd}>
          {t("setup.addTool")}
        </button>
      </div>
    </section>
  );
}

export default ToolListEditor;
