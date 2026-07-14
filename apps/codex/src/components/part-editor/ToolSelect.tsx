// components/part-editor/ToolSelect.tsx — 工程のツール選択（技術計画v2.3 §3.3 StepCard・§4.2 T24・V-3）
//
// 編集中レシピのtools（RecipeDoc.tools）をuseRecipeStore（T16）から取得して候補表示する。
// Step.toolIds（@coat-codex/recipe-core）はtools[].idを参照する配列（§2.6参照整合性）で、
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
// v2.6 T56: 追加フォームの上に「ツールライブラリからのサジェスト」節を挿入する。
// draft入力をtypeaheadとして名前部分一致絞り込みに再利用し、ライブラリ候補の
// タグ集合（単一選択トグル）でさらに絞り込める。ライブラリツール自体が0件の
// ときのみ節ごと非表示にする（絞り込み結果が0件の場合と区別する）。
//
// v2.8 T62: 候補は「doc.toolsに同名がないライブラリツール」のみに絞る旧仕様（dedupe）
// を廃止し、ライブラリの全ツールを常に候補表示する（M12一括移行後の旧レシピは
// ライブラリ全ツールがdoc.toolsと同名になり、dedupeだとサジェストが常に0件へ
// 縮退して見えたため。ユーザーFB裁定2026-07-14）。候補クリック時はtoolNameKey
// 同名がdoc.toolsに既にあれば新規Toolを作らず既存ツールのidを当該工程のtoolIds
// へチェックするのみ（doc.toolsは不変・重複コピーを作らない）。同名がなければ
// 従来どおりライブラリの{name, note}をdoc.toolsへコピーする（tagsはライブラリ
// 専用でdoc.toolsへは載せない＝§2.8）。同名かつ当該工程で既にチェック済みの
// 候補はaria-pressed="true"で視覚区別する。
//
// v2.6 T57: 各行にdoc.tools削除✕を追加する（技術計画§4.2 T57・§2.6）。
// countToolUsage(doc, tool.id)===0のときのみ活性（ToolListEditorと同じfilter・
// 確認ダイアログなし）。単体テストではdocに現在編集中のstepが反映されない
// 場合があるため、countToolUsageに加えvalue（当該工程でチェック中）も
// 使用中判定に含める。レシピ内ローカル削除（ツールライブラリには一切影響しない）。
//
// v2.7 T60: 使用中（inUse）行の✕は非描画に変更（disabled運用を廃止）。
// 行内のsetup.inUseNote注記も廃止し、リスト下に一元ヒント1行
// （editor.toolListHint。削除条件＋doc.tools完全移行予告）を新設した
// （デザイン仕様書「ToolSelect」節参照）。
//
// 制御コンポーネント（value=toolIds/onChange）で、選択状態自体は持たない。

import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router";
import { useRecipeStore } from "../../stores/useRecipeStore";
import {
  listUserTools,
  registerUserTool,
  toolNameKey,
} from "../../db/toolStore";
import type { UserToolRecord } from "../../db/db";
import { collectAllTags } from "../../lib/toolTags";
import { countToolUsage, type Tool } from "@coat-codex/recipe-core";
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
  const doc = useRecipeStore((state) => state.doc);
  const tools = doc?.tools ?? EMPTY_TOOLS;
  const updateRecipe = useRecipeStore((state) => state.updateRecipe);
  const [draft, setDraft] = useState("");
  const [libraryTools, setLibraryTools] = useState<UserToolRecord[]>([]);
  const [selectedTag, setSelectedTag] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    listUserTools()
      .then((list) => {
        if (!cancelled) {
          setLibraryTools(list);
        }
      })
      .catch((err) => {
        console.warn("tool library load failed", err);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // v2.8 T62: dedupe（doc.toolsに同名のあるライブラリツールを除外する処理）を廃止し、
  // ライブラリ全ツールを候補ベースとする。
  const suggestBase = libraryTools;
  const suggestTags = collectAllTags(suggestBase);
  // selectedTagがサジェスト候補コピー等でsuggestTagsから消えた場合に絞り込みが
  // 解除不能な固着状態にならないよう、実効タグは派生値として都度再計算する（L1）。
  const activeTag =
    selectedTag !== null && suggestTags.includes(selectedTag)
      ? selectedTag
      : null;
  let suggestCandidates = suggestBase;
  const draftKey = toolNameKey(draft);
  if (draftKey !== "") {
    suggestCandidates = suggestCandidates.filter((libTool) =>
      toolNameKey(libTool.name).includes(draftKey),
    );
  }
  if (activeTag !== null) {
    suggestCandidates = suggestCandidates.filter((libTool) =>
      libTool.tags.some((tag) => tag.toLowerCase() === activeTag.toLowerCase()),
    );
  }

  function handleSuggestionClick(libTool: UserToolRecord) {
    const key = toolNameKey(libTool.name);
    const existing = tools.find((tool) => toolNameKey(tool.name) === key);
    if (existing) {
      // 同名が既にdoc.toolsにある場合は新規コピーを作らず、既存ツールを
      // 当該工程へチェックするのみ（トグルオフはしない・doc.toolsは不変）。
      if (!value.includes(existing.id)) {
        onChange([...value, existing.id]);
      }
      return;
    }
    const newTool: Tool = {
      id: `tool_${crypto.randomUUID()}`,
      name: libTool.name,
      note: libTool.note,
    };
    updateRecipe((current) => ({
      ...current,
      tools: [...current.tools, newTool],
    }));
    if (!value.includes(newTool.id)) {
      onChange([...value, newTool.id]);
    }
  }

  function handleRemove(toolId: string) {
    updateRecipe((current) => ({
      ...current,
      tools: current.tools.filter((tool) => tool.id !== toolId),
    }));
  }

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
    const trimmedKey = toolNameKey(trimmed);
    const existing = tools.find(
      (tool) => toolNameKey(tool.name) === trimmedKey,
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
    // 新規追加時のツールライブラリ自動登録（技術計画v2.6 §4.2 T55・§2.8）。
    // 工程エディタのユーザー操作起点の新規追加のみ対象（既存ヒットの再利用は対象外）。
    void registerUserTool({ name: trimmed }).catch((err) =>
      console.warn("tool auto-register failed", err),
    );
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
          {tools.map((tool) => {
            const usageCount = doc ? countToolUsage(doc, tool.id) : 0;
            const inUse = usageCount > 0 || value.includes(tool.id);
            return (
              <div key={tool.id} className={styles.itemRow}>
                <label className={styles.item}>
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
                {!inUse && (
                  <button
                    type="button"
                    className={styles.removeButton}
                    aria-label={`${t("photo.delete")} ${tool.name}`}
                    onClick={() => handleRemove(tool.id)}
                  >
                    ✕
                  </button>
                )}
              </div>
            );
          })}
        </div>
      )}
      {tools.length > 0 && (
        <p className={styles.listHint}>{t("editor.toolListHint")}</p>
      )}
      {libraryTools.length > 0 && (
        <div className={styles.suggestSection}>
          <span className={styles.suggestLabel}>
            {t("editor.toolSuggestLabel")}
          </span>
          {suggestTags.length > 0 && (
            <div className={styles.tagFilterRow}>
              <span className={styles.tagFilterLabel}>
                {t("editor.toolTagFilterLabel")}
              </span>
              <div className={styles.tagList}>
                {suggestTags.map((tag) => (
                  <button
                    key={tag}
                    type="button"
                    className={styles.tagChip}
                    aria-pressed={activeTag === tag}
                    onClick={() =>
                      setSelectedTag((prev) => (prev === tag ? null : tag))
                    }
                  >
                    #{tag}
                  </button>
                ))}
              </div>
            </div>
          )}
          {suggestCandidates.length > 0 && (
            <div className={styles.suggestList}>
              {suggestCandidates.map((libTool) => {
                // v2.8 T62: 同名が既にdoc.toolsにあり、かつ当該工程で
                // チェック済みの候補はaria-pressedで視覚区別する。
                const existing = tools.find(
                  (tool) =>
                    toolNameKey(tool.name) === toolNameKey(libTool.name),
                );
                const checked = existing ? value.includes(existing.id) : false;
                return (
                  <button
                    key={libTool.id}
                    type="button"
                    className={styles.suggestButton}
                    aria-pressed={checked}
                    onClick={() => handleSuggestionClick(libTool)}
                  >
                    {libTool.name}
                  </button>
                );
              })}
            </div>
          )}
          <Link to="/tools" className={styles.manageLink}>
            {t("editor.toolManageLink")}
          </Link>
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
