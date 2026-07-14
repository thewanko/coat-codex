// routes/ToolsPage.tsx — ツールライブラリ管理画面（技術計画v2.6 §2.8/§3.1/§3.3 T52）
//
// 端末ローカルのUserToolRecordライブラリ（userToolsテーブル）を一覧・追加・削除する。
// レシピ横断のライブラリであり、doc.tools（個々のレシピの使用ツール）とは独立している
// （削除してもレシピ側には一切影響しない）。手動load方式（初回useEffect＋変異後に再list）
// を採る（db/toolStore.tsはリアクティブなsubscribeを持たないため）。
//
// タグ管理はT53でTagChipEditorを行内に組み込む（デザイン仕様書「ToolsPage一覧行」）。
// エクスポート/インポートは専用ファイル形式（lib/toolLibraryFile.ts）を使う（§2.8 T54）。

import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import BackLink from "../components/common/BackLink";
import ConfirmDialog from "../components/common/ConfirmDialog";
import EmptyState from "../components/common/EmptyState";
import TagChipEditor from "../components/tools/TagChipEditor";
import { downloadBlob } from "../components/common/downloadBlob";
import { useToast } from "../components/common/toastContext";
import {
  deleteUserTool,
  listUserTools,
  registerUserTool,
  updateUserToolTags,
} from "../db/toolStore";
import type { UserToolRecord } from "../db/db";
import { listRecipes } from "../db/recipeStore";
import {
  applyMergeUpdates,
  buildToolLibraryExport,
  mergeImportedTools,
  parseToolLibraryFile,
  type ToolLibraryExportEntry,
} from "../lib/toolLibraryFile";
import styles from "./ToolsPage.module.css";

/** File→テキスト読み込み（FileReaderのPromiseラッパー。useJsonImport.tsと同型） */
function readFileAsText(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === "string") {
        resolve(reader.result);
      } else {
        reject(new Error("readFileAsText: 読み込み結果が文字列ではありません"));
      }
    };
    reader.onerror = () => {
      reject(
        reader.error ?? new Error("readFileAsText: 読み込みに失敗しました"),
      );
    };
    reader.readAsText(file);
  });
}

function ToolsPage() {
  const { t } = useTranslation();
  const toast = useToast();
  const [tools, setTools] = useState<UserToolRecord[]>([]);
  const [draft, setDraft] = useState("");
  const [pendingDelete, setPendingDelete] = useState<UserToolRecord | null>(
    null,
  );
  const [importingFromRecipes, setImportingFromRecipes] = useState(false);
  const importInputRef = useRef<HTMLInputElement>(null);

  async function refresh() {
    const list = await listUserTools();
    setTools(list);
  }

  useEffect(() => {
    void refresh();
  }, []);

  async function handleAdd() {
    const trimmed = draft.trim();
    if (trimmed === "") {
      return;
    }
    await registerUserTool({ name: trimmed });
    setDraft("");
    await refresh();
  }

  function handleKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    if (event.key === "Enter") {
      event.preventDefault();
      void handleAdd();
    }
  }

  async function handleTagsChange(id: string, next: string[]) {
    await updateUserToolTags(id, next);
    await refresh();
  }

  async function handleConfirmDelete() {
    if (!pendingDelete) {
      return;
    }
    await deleteUserTool(pendingDelete.id);
    setPendingDelete(null);
    await refresh();
  }

  function handleExport() {
    const file = buildToolLibraryExport(tools);
    const blob = new Blob([JSON.stringify(file, null, 2)], {
      type: "application/json",
    });
    downloadBlob(blob, "coat-codex-tools.json");
  }

  function handleImportClick() {
    importInputRef.current?.click();
  }

  async function handleImportFileSelected(
    event: React.ChangeEvent<HTMLInputElement>,
  ) {
    const file = event.target.files?.[0];
    // 同じファイルを連続選択してもonChangeが発火するようにinputをリセットする
    event.target.value = "";
    if (!file) {
      return;
    }

    let jsonText: string;
    try {
      jsonText = await readFileAsText(file);
    } catch {
      toast.error(t("tools.importInvalid", { error: "invalid-json" }));
      return;
    }

    const parsed = parseToolLibraryFile(jsonText);
    if (!parsed.ok) {
      toast.error(t("tools.importInvalid", { error: parsed.error }));
      return;
    }

    const current = await listUserTools();
    const merge = mergeImportedTools(current, parsed.file.tools);

    for (const entry of merge.added) {
      await registerUserTool({
        name: entry.name,
        note: entry.note,
        tags: entry.tags,
      });
    }
    await applyMergeUpdates(merge.updates);

    await refresh();
    toast.success(
      t("tools.importSuccess", {
        added: merge.addedCount,
        merged: merge.mergedCount,
      }),
    );
  }

  /**
   * 一括移行（§2.8「一括移行」・T59）: 全レシピのdoc.toolsをToolLibraryExportEntry形へ整形し、
   * mergeImportedTools（T54）でuserToolsへ一括マージする。片方向（doc.tools→ライブラリ）のみで、
   * レシピ側は一切変更しない。
   */
  async function handleImportFromRecipes() {
    if (importingFromRecipes) {
      return;
    }
    setImportingFromRecipes(true);
    try {
      const recipes = await listRecipes();
      const entries: ToolLibraryExportEntry[] = recipes.flatMap((recipe) =>
        recipe.tools.map((tool) => ({
          name: tool.name,
          note: tool.note,
          tags: [],
        })),
      );

      const current = await listUserTools();
      const merge = mergeImportedTools(current, entries);

      for (const entry of merge.added) {
        await registerUserTool({
          name: entry.name,
          note: entry.note,
          tags: entry.tags,
        });
      }
      await applyMergeUpdates(merge.updates);

      await refresh();
      toast.success(
        t("tools.importFromRecipesResult", {
          added: merge.addedCount,
          merged: merge.mergedCount,
        }),
      );
    } catch (error) {
      toast.error(
        t("tools.importInvalid", {
          error: error instanceof Error ? error.message : String(error),
        }),
      );
    } finally {
      setImportingFromRecipes(false);
    }
  }

  return (
    <div className={styles.root}>
      <div className={styles.backLink}>
        <BackLink to="/" label={t("nav.backToLibrary")} />
      </div>

      <h1 className={styles.title}>{t("tools.title")}</h1>
      <p className={styles.description}>{t("tools.description")}</p>

      <div className={styles.fileActionsRow}>
        <button
          type="button"
          className={styles.fileActionButton}
          disabled={tools.length === 0}
          onClick={handleExport}
        >
          {t("tools.export")}
        </button>
        <button
          type="button"
          className={styles.fileActionButton}
          onClick={handleImportClick}
        >
          {t("tools.import")}
        </button>
        <button
          type="button"
          className={styles.fileActionButton}
          disabled={importingFromRecipes}
          onClick={() => void handleImportFromRecipes()}
        >
          {t("tools.importFromRecipes")}
        </button>
        <input
          ref={importInputRef}
          type="file"
          accept="application/json,.json"
          className={styles.hiddenInput}
          onChange={(event) => void handleImportFileSelected(event)}
          aria-hidden="true"
          tabIndex={-1}
        />
      </div>

      <div className={styles.addRow}>
        <input
          type="text"
          className={styles.addInput}
          placeholder={t("tools.addPlaceholder")}
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={handleKeyDown}
        />
        <button
          type="button"
          className={styles.addButton}
          disabled={draft.trim() === ""}
          onClick={() => void handleAdd()}
        >
          {t("tools.addButton")}
        </button>
      </div>

      {tools.length === 0 ? (
        <EmptyState
          variant="tools"
          heading={t("tools.emptyTitle")}
          description={t("tools.emptyDescription")}
        />
      ) : (
        <ul className={styles.list}>
          {tools.map((tool) => (
            <li key={tool.id} className={styles.row}>
              <span className={styles.name}>{tool.name}</span>
              <div className={styles.tags}>
                <TagChipEditor
                  toolName={tool.name}
                  tags={tool.tags}
                  onChange={(next) => void handleTagsChange(tool.id, next)}
                />
              </div>
              <button
                type="button"
                className={styles.deleteButton}
                aria-label={`${t("photo.delete")} ${tool.name}`}
                onClick={() => setPendingDelete(tool)}
              >
                ✕
              </button>
            </li>
          ))}
        </ul>
      )}

      <ConfirmDialog
        open={pendingDelete !== null}
        title={t("tools.deleteTitle", { name: pendingDelete?.name ?? "" })}
        description={t("tools.deleteMessage")}
        onConfirm={() => void handleConfirmDelete()}
        onCancel={() => setPendingDelete(null)}
      />
    </div>
  );
}

export default ToolsPage;
