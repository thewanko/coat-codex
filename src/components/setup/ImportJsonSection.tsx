// components/setup/ImportJsonSection.tsx — JSONインポート導線（技術計画v2.2 §4.2 T23／結線T33）
//
// 要件10-1どおり新規作成と並置。ファイル選択確定のユーザー操作直下でstorage.persist()を
// 要求（§3.5発火点③）→importRecipe→成功: トースト＋当該レシピのOverviewへ遷移／
// 失敗: ImportErrorDialog表示（トーストは要約のみ・D-4）。処理本体はuseJsonImport
// （Home/Setup共通・画面構成§3.3）に委譲する。

import { useRef } from "react";
import { useTranslation } from "react-i18next";
import { useJsonImport } from "../common/useJsonImport";
import ImportErrorDialog from "../common/ImportErrorDialog";
import styles from "./SetupSection.module.css";
import ownStyles from "./ImportJsonSection.module.css";

function ImportJsonSection() {
  const { t } = useTranslation();
  const inputRef = useRef<HTMLInputElement>(null);
  const { isImporting, errorState, dismissError, handleFileSelected } =
    useJsonImport();

  return (
    <section className={styles.section}>
      <h2 className={styles.heading}>{t("setup.importTitle")}</h2>
      <p className={ownStyles.note}>{t("setup.importNote")}</p>
      <button
        type="button"
        className={ownStyles.button}
        disabled={isImporting}
        onClick={() => inputRef.current?.click()}
      >
        {t("setup.importTitle")}
      </button>
      <input
        ref={inputRef}
        type="file"
        accept="application/json,.json"
        className={ownStyles.hiddenInput}
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
    </section>
  );
}

export default ImportJsonSection;
