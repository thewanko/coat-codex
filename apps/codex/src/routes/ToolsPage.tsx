// routes/ToolsPage.tsx — ツールライブラリ管理画面（技術計画v2.6 §2.8/§3.1/§3.3 T52）
//
// 端末ローカルのUserToolRecordライブラリ（userToolsテーブル）を一覧・追加・削除する。
// レシピ横断のライブラリであり、doc.tools（個々のレシピの使用ツール）とは独立している
// （削除してもレシピ側には一切影響しない）。手動load方式（初回useEffect＋変異後に再list）
// を採る（db/toolStore.tsはリアクティブなsubscribeを持たないため）。
//
// タグ管理（TagChipEditor）・エクスポート/インポートはT53/T54スコープのため本タスクでは
// 実装しない（デザイン仕様書「ToolsPage一覧行」はTagChipEditorを内包する構成だが、
// 未実装機能の置き場を空ける必要はない、とT52仕様に明記されている）。

import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import BackLink from "../components/common/BackLink";
import ConfirmDialog from "../components/common/ConfirmDialog";
import EmptyState from "../components/common/EmptyState";
import {
  deleteUserTool,
  listUserTools,
  registerUserTool,
} from "../db/toolStore";
import type { UserToolRecord } from "../db/db";
import styles from "./ToolsPage.module.css";

function ToolsPage() {
  const { t } = useTranslation();
  const [tools, setTools] = useState<UserToolRecord[]>([]);
  const [draft, setDraft] = useState("");
  const [pendingDelete, setPendingDelete] = useState<UserToolRecord | null>(
    null,
  );

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

  async function handleConfirmDelete() {
    if (!pendingDelete) {
      return;
    }
    await deleteUserTool(pendingDelete.id);
    setPendingDelete(null);
    await refresh();
  }

  return (
    <div className={styles.root}>
      <div className={styles.backLink}>
        <BackLink to="/" label={t("nav.backToLibrary")} />
      </div>

      <h1 className={styles.title}>{t("tools.title")}</h1>
      <p className={styles.description}>{t("tools.description")}</p>

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
