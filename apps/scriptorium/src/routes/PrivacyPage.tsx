// routes/PrivacyPage.tsx — プライバシーポリシー（技術計画v1 §10 公開必須）
//
// 静的コンテンツページ（i18n対応・EN/JA）。収集・保存する情報、
// 削除パスワードの扱い（PBKDF2ハッシュ・原文非保存）、
// 利用インフラ（Cloudflare Pages/D1/R2/Turnstile）、
// トラッキング無し、保持期間と削除、contact窓口を掲載する。

import { useTranslation } from "react-i18next";
import styles from "./LegalPage.module.css";

const CONTACT_EMAIL = "contact@coat-codex.com";

function PrivacyPage() {
  const { t } = useTranslation();

  return (
    <div className={styles.root}>
      <h1 className={styles.heading}>{t("privacy.heading")}</h1>

      <section className={styles.section}>
        <p className={styles.body}>{t("privacy.intro")}</p>
      </section>

      <section className={styles.section}>
        <h2 className={styles.sectionHeading}>
          {t("privacy.collectedHeading")}
        </h2>
        <p className={styles.body}>{t("privacy.collectedBody")}</p>
        <ul className={styles.list}>
          <li>{t("privacy.collectedList1")}</li>
          <li>{t("privacy.collectedList2")}</li>
          <li>{t("privacy.collectedList3")}</li>
          <li>{t("privacy.collectedList4")}</li>
        </ul>
      </section>

      <section className={styles.section}>
        <h2 className={styles.sectionHeading}>
          {t("privacy.deletePwHeading")}
        </h2>
        <p className={styles.body}>
          {t("privacy.deletePwBody", { email: CONTACT_EMAIL })}
        </p>
      </section>

      <section className={styles.section}>
        <h2 className={styles.sectionHeading}>{t("privacy.infraHeading")}</h2>
        <p className={styles.body}>{t("privacy.infraBody")}</p>
      </section>

      <section className={styles.section}>
        <h2 className={styles.sectionHeading}>
          {t("privacy.trackingHeading")}
        </h2>
        <p className={styles.body}>{t("privacy.trackingBody")}</p>
      </section>

      <section className={styles.section}>
        <h2 className={styles.sectionHeading}>
          {t("privacy.retentionHeading")}
        </h2>
        <p className={styles.body}>{t("privacy.retentionBody")}</p>
      </section>

      <section className={styles.section}>
        <h2 className={styles.sectionHeading}>{t("privacy.contactHeading")}</h2>
        <p className={styles.body}>
          {t("privacy.contactBody", { email: CONTACT_EMAIL })}
        </p>
      </section>
    </div>
  );
}

export default PrivacyPage;
