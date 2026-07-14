// routes/UpdatesPage.tsx — 更新履歴ページ（技術計画v2.9 §3.1/§3.3/§4.2 T67）
//
// HelpPage/TermsPageの構造イディオム（フラットルート・BackLink→hero→section列）に
// 準拠する純表示ページ。エントリは新しい順に固定配列で並べ、各エントリを日付＋
// 見出し＋本文のsectionとして描画する。
//
// i18n: t()には文字列リテラルキーのみを使用する（i18n.test.tsの静的キー抽出のため、
// エントリ配列などのmap化はしない）。

import { useTranslation } from "react-i18next";
import BackLink from "../components/common/BackLink";
import styles from "./UpdatesPage.module.css";

function UpdatesPage() {
  const { t } = useTranslation();

  return (
    <div className={styles.root}>
      <div className={styles.backLink}>
        <BackLink to="/" label={t("nav.backToLibrary")} />
      </div>

      <div className={styles.hero}>
        <p className={styles.overline}>{t("updates.overline")}</p>
        <h1 className={styles.title}>{t("updates.title")}</h1>
      </div>

      <section className={styles.entry}>
        <p className={styles.date}>{t("updates.entries.toolLibraryUx.date")}</p>
        <h2 className={styles.heading}>
          {t("updates.entries.toolLibraryUx.heading")}
        </h2>
        <p className={styles.body}>{t("updates.entries.toolLibraryUx.body")}</p>
      </section>

      <section className={styles.entry}>
        <p className={styles.date}>
          {t("updates.entries.toolLibraryIntegration.date")}
        </p>
        <h2 className={styles.heading}>
          {t("updates.entries.toolLibraryIntegration.heading")}
        </h2>
        <p className={styles.body}>
          {t("updates.entries.toolLibraryIntegration.body")}
        </p>
      </section>

      <section className={styles.entry}>
        <p className={styles.date}>
          {t("updates.entries.toolLibraryLaunch.date")}
        </p>
        <h2 className={styles.heading}>
          {t("updates.entries.toolLibraryLaunch.heading")}
        </h2>
        <p className={styles.body}>
          {t("updates.entries.toolLibraryLaunch.body")}
        </p>
      </section>

      <section className={styles.entry}>
        <p className={styles.date}>{t("updates.entries.partDelete.date")}</p>
        <h2 className={styles.heading}>
          {t("updates.entries.partDelete.heading")}
        </h2>
        <p className={styles.body}>{t("updates.entries.partDelete.body")}</p>
      </section>

      <section className={styles.entry}>
        <p className={styles.date}>{t("updates.entries.publish.date")}</p>
        <h2 className={styles.heading}>
          {t("updates.entries.publish.heading")}
        </h2>
        <p className={styles.body}>{t("updates.entries.publish.body")}</p>
      </section>
    </div>
  );
}

export default UpdatesPage;
