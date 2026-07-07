// routes/ContentPolicyPage.tsx — コンテンツポリシー（技術計画v1 §5.4）
//
// 静的コンテンツページ（i18n対応・EN/JA）。自分で撮影した写真のみ投稿可の方針、
// 通報手続（各レシピページの通報ボタン・閾値到達で自動非公開）、
// 商標免責の長文（原典 docs/legal/coat-codex_商標表記.md §2 のi18n化・流用）を掲載する。

import { useTranslation } from "react-i18next";
import styles from "./LegalPage.module.css";

const CONTACT_EMAIL = "contact@coat-codex.com";

function ContentPolicyPage() {
  const { t } = useTranslation();

  return (
    <div className={styles.root}>
      <h1 className={styles.heading}>{t("contentPolicy.heading")}</h1>

      <section className={styles.section}>
        <h2 className={styles.sectionHeading}>
          {t("contentPolicy.photoHeading")}
        </h2>
        <p className={styles.body}>{t("contentPolicy.photoBody")}</p>
      </section>

      <section className={styles.section}>
        <h2 className={styles.sectionHeading}>
          {t("contentPolicy.reportingHeading")}
        </h2>
        <p className={styles.body}>{t("contentPolicy.reportingBody")}</p>
        <p className={styles.body}>
          {t("contentPolicy.reportingThresholdBody")}
        </p>
      </section>

      <section className={styles.section}>
        <h2 className={styles.sectionHeading}>
          {t("contentPolicy.trademarkHeading")}
        </h2>
        <p className={styles.body}>{t("contentPolicy.trademarkIntro")}</p>
        <p className={styles.body}>{t("contentPolicy.trademarkListIntro")}</p>
        <ul className={styles.list}>
          <li>{t("contentPolicy.trademarkCitadel")}</li>
          <li>{t("contentPolicy.trademarkVallejo")}</li>
          <li>{t("contentPolicy.trademarkAk")}</li>
          <li>{t("contentPolicy.trademarkCoatDarms")}</li>
        </ul>
        <p className={styles.body}>{t("contentPolicy.trademarkOwnership")}</p>
        <p className={styles.body}>{t("contentPolicy.trademarkColorNote")}</p>
        <p className={styles.body}>
          {t("contentPolicy.trademarkContact", { email: CONTACT_EMAIL })}
        </p>
      </section>
    </div>
  );
}

export default ContentPolicyPage;
