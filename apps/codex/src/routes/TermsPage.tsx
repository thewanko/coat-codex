// routes/TermsPage.tsx — 利用規約・免責事項（技術計画v2 §4.2 T35・v1レビュー指摘11）
//
// 静的コンテンツページ（i18n対応）。データ消失自己責任の免責、IndexedDBの性質と
// SafariのITPによる7日消去リスク、JSONエクスポートによるバックアップ推奨、
// 商標表記長文（原典 docs/legal/coat-codex_商標表記.md §2 のi18n化）を掲載する。
// 連絡先メールは確定済みの contact@coat-codex.com を固定値として埋め込む。

import { useTranslation } from "react-i18next";
import BackLink from "../components/common/BackLink";
import styles from "./TermsPage.module.css";

const CONTACT_EMAIL = "contact@coat-codex.com";

function TermsPage() {
  const { t } = useTranslation();

  return (
    <div className={styles.root}>
      <div className={styles.backLink}>
        <BackLink to="/" label={t("nav.backToLibrary")} />
      </div>

      <h1 className={styles.heading}>{t("terms.pageTitle")}</h1>

      <section className={styles.section}>
        <h2 className={styles.sectionHeading}>
          {t("terms.disclaimerHeading")}
        </h2>
        <p className={styles.body}>{t("terms.disclaimerBody")}</p>
      </section>

      <section className={styles.section}>
        <h2 className={styles.sectionHeading}>{t("terms.storageHeading")}</h2>
        <p className={styles.body}>{t("terms.storageBody")}</p>
      </section>

      <section className={styles.section}>
        <h2 className={styles.sectionHeading}>
          {t("terms.safariRiskHeading")}
        </h2>
        <p className={styles.body}>{t("terms.safariRiskBody")}</p>
      </section>

      <section className={styles.section}>
        <h2 className={styles.sectionHeading}>{t("terms.backupHeading")}</h2>
        <p className={styles.body}>{t("terms.backupBody")}</p>
      </section>

      <section className={styles.section}>
        <h2 className={styles.sectionHeading}>{t("terms.trademarkHeading")}</h2>
        <p className={styles.body}>{t("terms.trademarkIntro")}</p>
        <p className={styles.body}>{t("terms.trademarkListIntro")}</p>
        <ul className={styles.list}>
          <li>{t("terms.trademarkCitadel")}</li>
          <li>{t("terms.trademarkVallejo")}</li>
          <li>{t("terms.trademarkAk")}</li>
          <li>{t("terms.trademarkCoatDarms")}</li>
        </ul>
        <p className={styles.body}>{t("terms.trademarkOwnership")}</p>
        <p className={styles.body}>{t("terms.trademarkColorNote")}</p>
        <p className={styles.body}>
          {t("terms.trademarkContact", { email: CONTACT_EMAIL })}
        </p>
      </section>
    </div>
  );
}

export default TermsPage;
