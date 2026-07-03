// components/print/PrintToolbar.tsx — 印刷プレビューの操作バー（技術計画v2.2 §4.2 T36）
//
// `@media print` では非表示（global.css側の `.print-hide` クラスに加え、
// print.module.cssでも`display:none`を明示して二重に担保する）。
// 「印刷する」ボタンはwindow.print()を呼ぶのみ。PDF保存はブラウザ標準の印刷ダイアログ
// 「PDFとして保存」に委ねる方針のため、ここではガイド文の表示のみ行う（§6未決のまま）。

import { useTranslation } from "react-i18next";
import BackLink from "../common/BackLink";
import styles from "./PrintToolbar.module.css";

interface PrintToolbarProps {
  backTo: string;
}

function PrintToolbar({ backTo }: PrintToolbarProps) {
  const { t } = useTranslation();

  function handlePrint() {
    window.print();
  }

  return (
    <div className={`${styles.root} print-hide`}>
      <BackLink to={backTo} label={t("nav.backToOverview")} />
      <button
        type="button"
        className={styles.printButton}
        onClick={handlePrint}
      >
        {t("print.print")}
      </button>
      <span className={styles.pdfHint}>{t("print.pdfHint")}</span>
    </div>
  );
}

export default PrintToolbar;
