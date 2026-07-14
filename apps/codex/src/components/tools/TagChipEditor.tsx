// components/tools/TagChipEditor.tsx — ツールライブラリのタグ編集チップ列（技術計画v2.6 §2.8/§3.3 T53）
//
// デザイン仕様書「ToolsPage / TagChipEditor」節: 各チップは`#`＋タグ名（mono 11px）・
// raised面faint枠・小円radius-full・末尾に除去✕（12px・opacity .6→hover 1）。追加inputは
// 同列末尾に配置し、Enter確定・重複無視は無音（トースト不要）。
//
// 制御コンポーネント（value=tags/onChange）。正規化・重複判定はlib/toolTags.tsのaddTagへ委譲する。

import { useState } from "react";
import { useTranslation } from "react-i18next";
import { addTag } from "../../lib/toolTags";
import styles from "./TagChipEditor.module.css";

interface TagChipEditorProps {
  /** 対象ツール名（aria-label生成用） */
  toolName: string;
  /** 正規化済みタグ（先頭#なし） */
  tags: string[];
  onChange: (next: string[]) => void;
}

function TagChipEditor({ toolName, tags, onChange }: TagChipEditorProps) {
  const { t } = useTranslation();
  const [draft, setDraft] = useState("");

  function handleAdd() {
    const next = addTag(tags, draft);
    if (next !== tags) {
      onChange(next);
    }
    setDraft("");
  }

  function handleKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    if (event.key === "Enter") {
      event.preventDefault();
      handleAdd();
    }
  }

  function handleRemove(tag: string) {
    onChange(tags.filter((existing) => existing !== tag));
  }

  return (
    <div className={styles.root}>
      {tags.map((tag) => (
        <span key={tag} className={styles.chip}>
          <span className={styles.chipLabel}>#{tag}</span>
          <button
            type="button"
            className={styles.removeButton}
            aria-label={t("tools.tagRemoveAria", { tag, name: toolName })}
            onClick={() => handleRemove(tag)}
          >
            ✕
          </button>
        </span>
      ))}
      <input
        type="text"
        className={styles.input}
        placeholder={t("tools.tagPlaceholder")}
        aria-label={t("tools.tagAdd", { name: toolName })}
        value={draft}
        onChange={(event) => setDraft(event.target.value)}
        onKeyDown={handleKeyDown}
      />
    </div>
  );
}

export default TagChipEditor;
