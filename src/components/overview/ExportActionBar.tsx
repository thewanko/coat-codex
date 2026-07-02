// components/overview/ExportActionBar.tsx — 出力アクションバー（枠のみ）
// （技術計画v2.2 §3.3・§4.2 T28。結線はT33/T40）
//
// 印刷／PDFダウンロード／X共有／Bluesky共有／note.com向けMD／JSONエクスポート・
// 素のMarkdownエクスポート（要件どおり隣接配置）を配置のみ行う。全ボタンdisabled。
// 並び順・グルーピング（菱区切り＋JSON+素MDの結合ピル）はデザイン仕様書§4「ActionBar」。

import { useTranslation } from "react-i18next";
import styles from "./ExportActionBar.module.css";

function ExportActionBar() {
  const { t } = useTranslation();

  return (
    <div className={styles.root} data-testid="export-action-bar">
      <button type="button" className={styles.pill} disabled>
        {t("overview.exportPrint")}
      </button>
      <button type="button" className={styles.pill} disabled>
        {t("overview.exportPdf")}
      </button>

      <span className={styles.divider} aria-hidden="true" />

      <button type="button" className={styles.pill} disabled>
        {t("overview.exportX")}
      </button>
      <button type="button" className={styles.pill} disabled>
        {t("overview.exportBluesky")}
      </button>
      <button type="button" className={styles.pill} disabled>
        {t("overview.exportNoteMd")}
      </button>

      <span className={styles.divider} aria-hidden="true" />

      <span className={styles.combinedPill}>
        <button type="button" className={styles.combinedButton} disabled>
          {t("overview.exportJson")}
        </button>
        <span className={styles.combinedSeparator} aria-hidden="true" />
        <button type="button" className={styles.combinedButton} disabled>
          {t("overview.exportPlainMd")}
        </button>
      </span>
    </div>
  );
}

export default ExportActionBar;
