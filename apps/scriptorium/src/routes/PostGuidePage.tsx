// routes/PostGuidePage.tsx — 投稿ガイド（技術計画v1 §5.1）
//
// 投稿は coat-codex アプリから行う導線と、公開される内容・削除・規約の要約を掲載する
// 静的コンテンツページ（i18n対応・EN/JA）。ContentPolicyPage/TermsPageと同型。

import { useTranslation } from "react-i18next";
import { Link } from "react-router";
import styles from "./LegalPage.module.css";

const APP_URL = "https://coat-codex.com";

function PostGuidePage() {
  const { t } = useTranslation();

  return (
    <div className={styles.root}>
      <h1 className={styles.heading}>{t("postGuide.heading")}</h1>

      <p className={styles.body}>{t("postGuide.intro")}</p>

      <a
        href={APP_URL}
        target="_blank"
        rel="noopener noreferrer"
        className={styles.appLink}
      >
        {t("postGuide.appLinkLabel")}
      </a>

      <section className={styles.section}>
        <h2 className={styles.sectionHeading}>{t("postGuide.stepsHeading")}</h2>
        <ol className={styles.list}>
          <li>{t("postGuide.step1")}</li>
          <li>{t("postGuide.step2")}</li>
          <li>{t("postGuide.step3")}</li>
        </ol>
      </section>

      <section className={styles.section}>
        <h2 className={styles.sectionHeading}>
          {t("postGuide.publishedHeading")}
        </h2>
        <p className={styles.body}>{t("postGuide.publishedBody")}</p>
        <p className={styles.body}>{t("postGuide.notBackupBody")}</p>
      </section>

      <section className={styles.section}>
        <h2 className={styles.sectionHeading}>
          {t("postGuide.deleteHeading")}
        </h2>
        <p className={styles.body}>{t("postGuide.deleteBody")}</p>
      </section>

      <section className={styles.section}>
        <h2 className={styles.sectionHeading}>
          {t("postGuide.policyHeading")}
        </h2>
        <p className={styles.body}>{t("postGuide.policyBody")}</p>
        <p className={styles.body}>
          <Link to="/terms">{t("footer.terms")}</Link>{" "}
          <Link to="/content-policy">{t("footer.contentPolicy")}</Link>
        </p>
      </section>
    </div>
  );
}

export default PostGuidePage;
