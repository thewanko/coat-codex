// components/setup/ImportJsonSection.tsx — JSONインポート導線（技術計画v2.2 §4.2 T23／結線T33）
//
// 要件10-1どおり新規作成と並置。ファイル選択確定のユーザー操作直下でstorage.persist()を
// 要求（§3.5発火点③）→importRecipe→成功: トースト＋当該レシピのOverviewへ遷移／
// 失敗: ImportErrorDialog表示（トーストは要約のみ・D-4）。処理本体はuseJsonImport
// （Home/Setup共通・画面構成§3.3）に委譲する。
//
// 見た目（dc.html PC版297〜311行目・モバイル版360〜367行目・T42意匠2）: セクション見出しの
// 代わりに「または」ディバイダ＋破線カード（PC）／コンパクトな破線ボタン1行（モバイル<768px）。
// 両方を常時DOMに持ち、CSSの@media(max-width:767px)で出し分ける（他コンポーネントの768px分岐と
// 同じ方式）。機能（useJsonImport・persist発火点③・ImportErrorDialog・disabled）は変更しない。

import { useRef } from "react";
import { useTranslation } from "react-i18next";
import { useJsonImport } from "../common/useJsonImport";
import ImportErrorDialog from "../common/ImportErrorDialog";
import styles from "./ImportJsonSection.module.css";

function ImportJsonSection() {
  const { t } = useTranslation();
  const inputRef = useRef<HTMLInputElement>(null);
  const { isImporting, errorState, dismissError, handleFileSelected } =
    useJsonImport();

  function openFilePicker() {
    inputRef.current?.click();
  }

  return (
    <div>
      <div className={styles.divider} aria-hidden="true">
        <span className={styles.dividerLine} />
        <span className={styles.dividerDiamond} />
        <span className={styles.dividerLabel}>{t("setup.importOr")}</span>
        <span className={styles.dividerDiamond} />
        <span className={styles.dividerLine} />
      </div>
      <div className={styles.card}>
        <span className={styles.icon} aria-hidden="true">
          ↑
        </span>
        <span className={styles.textGroup}>
          <span className={styles.title}>{t("setup.importTitle")}</span>
          <span className={styles.note}>{t("setup.importNote")}</span>
        </span>
        <button
          type="button"
          className={styles.button}
          disabled={isImporting}
          onClick={openFilePicker}
        >
          {t("setup.importSelectFile")}
        </button>
      </div>
      <button
        type="button"
        className={styles.compactButton}
        disabled={isImporting}
        onClick={openFilePicker}
      >
        {t("setup.importCompactLabel")}
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
    </div>
  );
}

export default ImportJsonSection;
