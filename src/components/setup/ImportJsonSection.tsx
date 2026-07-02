// components/setup/ImportJsonSection.tsx — JSONインポート導線の枠のみ（技術計画v2.2 §4.2 T23）
//
// 要件10-1どおり新規作成と並置。見出し＋説明のみを設置し、ボタンはdisabled。
// 結線（zod検証→migrations→保存→Overview遷移、storage.persist()要求含む）はT33で行う。

import { useTranslation } from "react-i18next";
import styles from "./SetupSection.module.css";
import ownStyles from "./ImportJsonSection.module.css";

function ImportJsonSection() {
  const { t } = useTranslation();

  return (
    <section className={styles.section}>
      <h2 className={styles.heading}>{t("setup.importTitle")}</h2>
      <p className={ownStyles.note}>{t("setup.importNote")}</p>
      <button type="button" className={ownStyles.button} disabled>
        {t("setup.importTitle")}
      </button>
    </section>
  );
}

export default ImportJsonSection;
