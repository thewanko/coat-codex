// routes/TermsPage.tsx — 利用規約・免責（技術計画v1 §5.4）
//
// 静的コンテンツページ（i18n対応・EN/JA）。投稿物の権利帰属・表示許諾、
// 削除フロー（削除パスワード／紛失時のcontact@coat-codex.com連絡）、
// 削除反映の最大5分キャッシュTTL（§4.5の仕様化）、一般免責、
// 商標表記長文（原典 docs/legal/coat-codex_商標表記.md §2 のi18n化・流用）を掲載する。

import { useTranslation } from "react-i18next";
import styles from "./LegalPage.module.css";

const CONTACT_EMAIL = "contact@coat-codex.com";

function TermsPage() {
  const { t } = useTranslation();

  return (
    <div className={styles.root}>
      <h1 className={styles.heading}>{t("terms.heading")}</h1>

      <section className={styles.section}>
        <h2 className={styles.sectionHeading}>{t("terms.ownershipHeading")}</h2>
        <p className={styles.body}>{t("terms.ownershipBody")}</p>
      </section>

      <section className={styles.section}>
        <h2 className={styles.sectionHeading}>{t("terms.deletionHeading")}</h2>
        <p className={styles.body}>
          {t("terms.deletionBody", { email: CONTACT_EMAIL })}
        </p>
        <p className={styles.body}>{t("terms.deletionTtlBody")}</p>
      </section>

      <section className={styles.section}>
        <h2 className={styles.sectionHeading}>
          {t("terms.disclaimerHeading")}
        </h2>
        <p className={styles.body}>{t("terms.disclaimerBody")}</p>
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
