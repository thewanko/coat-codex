// components/home/ImportJsonButton.tsx — HomePage JSONインポートボタン
// （技術計画v2.2 §3.3 HomePage・§3.5発火点②・T33）
//
// ファイル選択（.json）→選択確定のユーザー操作直下でstorage.persist()を要求（§3.5発火点②）
// →importRecipe（3段検証・正規化・Dexie書き込み）→成功: トースト＋当該レシピのOverviewへ
// 遷移／失敗: ImportErrorDialog表示（トーストは要約のみ・D-4）。
// 処理本体はuseJsonImport（Home/Setup共通・画面構成§3.3）に委譲する。

import { useRef } from "react";
import { useTranslation } from "react-i18next";
import { useJsonImport } from "../common/useJsonImport";
import ImportErrorDialog from "../common/ImportErrorDialog";
import styles from "./ImportJsonButton.module.css";

interface ImportJsonButtonProps {
  /** ボタン文言。既定は「JSONをインポート」（home.emptyImport）。EmptyState内でも同じ文言を使う */
  label?: string;
}

function ImportJsonButton({ label }: ImportJsonButtonProps) {
  const { t } = useTranslation();
  const inputRef = useRef<HTMLInputElement>(null);
  const { isImporting, errorState, dismissError, handleFileSelected } =
    useJsonImport();

  return (
    <>
      <button
        type="button"
        className={styles.button}
        disabled={isImporting}
        onClick={() => inputRef.current?.click()}
      >
        {label ?? t("home.emptyImport")}
      </button>
      <input
        ref={inputRef}
        type="file"
        accept="application/json,.json"
        className={styles.hiddenInput}
        onChange={handleFileSelected}
        aria-hidden="true"
        tabIndex={-1}
      />
      <ImportErrorDialog
        open={errorState !== null}
        message={errorState?.message ?? ""}
        issues={errorState?.issues ?? []}
        onClose={dismissError}
      />
    </>
  );
}

export default ImportJsonButton;
