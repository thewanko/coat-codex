// routes/HelpPage.tsx — 使い方＋Q&Aページ（2026-07-05 新設・ユーザー裁定: 1ページ統合 /help）
//
// 使い方セクション（6ステップ+バックアップ）とQ&Aセクション（データ／対応環境／共有・出力の
// コツ、3カテゴリ）を1ページに統合する。意匠・構造イディオムはTermsPage（フラットルート・
// オーバーライン＋明朝見出し＋和文gloss）に準拠。スクリーンショットはPC/モバイルで
// <picture>により出し分ける（CSS display分岐は不可視側もダウンロードされるため不採用）。
//
// i18n: t()には文字列リテラルキーのみを使用する（i18n.test.tsの静的キー抽出のため、
// ステップ配列などのmap化はしない）。

import { useTranslation } from "react-i18next";
import BackLink from "../components/common/BackLink";
import styles from "./HelpPage.module.css";

import createPc from "../assets/help/create-pc.jpg";
import createMobile from "../assets/help/create-mobile.jpg";
import setupPc from "../assets/help/setup-pc.jpg";
import setupMobile from "../assets/help/setup-mobile.jpg";
import editorPc from "../assets/help/editor-pc.jpg";
import editorMobile from "../assets/help/editor-mobile.jpg";
import overviewPc from "../assets/help/overview-pc.jpg";
import overviewMobile from "../assets/help/overview-mobile.jpg";
import sharePc from "../assets/help/share-pc.jpg";
import shareMobile from "../assets/help/share-mobile.jpg";
import printPc from "../assets/help/print-pc.jpg";
import printMobile from "../assets/help/print-mobile.jpg";

interface StepFigureProps {
  pcSrc: string;
  mobileSrc: string;
  alt: string;
}

function StepFigure({ pcSrc, mobileSrc, alt }: StepFigureProps) {
  return (
    <picture className={styles.figure}>
      <source media="(min-width: 768px)" srcSet={pcSrc} />
      <img src={mobileSrc} alt={alt} loading="lazy" className={styles.image} />
    </picture>
  );
}

function HelpPage() {
  const { t } = useTranslation();

  return (
    <div className={styles.root}>
      <div className={styles.backLink}>
        <BackLink to="/" label={t("nav.backToLibrary")} />
      </div>

      <div className={styles.hero}>
        <p className={styles.overline}>{t("help.overline")}</p>
        <h1 className={styles.title}>{t("help.title")}</h1>
        <p className={styles.gloss}>{t("help.gloss")}</p>
      </div>

      <p className={styles.intro}>{t("help.intro")}</p>

      <section className={styles.section}>
        <h2 className={styles.sectionHeading}>{t("help.stepsHeading")}</h2>

        <div className={styles.step}>
          <h3 className={styles.stepHeading}>{t("help.steps.create.title")}</h3>
          <p className={styles.body}>{t("help.steps.create.body")}</p>
          <StepFigure
            pcSrc={createPc}
            mobileSrc={createMobile}
            alt={t("help.steps.create.imageAlt")}
          />
        </div>

        <div className={styles.step}>
          <h3 className={styles.stepHeading}>{t("help.steps.setup.title")}</h3>
          <p className={styles.body}>{t("help.steps.setup.body")}</p>
          <StepFigure
            pcSrc={setupPc}
            mobileSrc={setupMobile}
            alt={t("help.steps.setup.imageAlt")}
          />
        </div>

        <div className={styles.step}>
          <h3 className={styles.stepHeading}>{t("help.steps.editor.title")}</h3>
          <p className={styles.body}>{t("help.steps.editor.body")}</p>
          <StepFigure
            pcSrc={editorPc}
            mobileSrc={editorMobile}
            alt={t("help.steps.editor.imageAlt")}
          />
        </div>

        <div className={styles.step}>
          <h3 className={styles.stepHeading}>
            {t("help.steps.overview.title")}
          </h3>
          <p className={styles.body}>{t("help.steps.overview.body")}</p>
          <StepFigure
            pcSrc={overviewPc}
            mobileSrc={overviewMobile}
            alt={t("help.steps.overview.imageAlt")}
          />
        </div>

        <div className={styles.step}>
          <h3 className={styles.stepHeading}>{t("help.steps.share.title")}</h3>
          <p className={styles.body}>{t("help.steps.share.body")}</p>
          <StepFigure
            pcSrc={sharePc}
            mobileSrc={shareMobile}
            alt={t("help.steps.share.imageAlt")}
          />
        </div>

        <div className={styles.step}>
          <h3 className={styles.stepHeading}>{t("help.steps.print.title")}</h3>
          <p className={styles.body}>{t("help.steps.print.body")}</p>
          <StepFigure
            pcSrc={printPc}
            mobileSrc={printMobile}
            alt={t("help.steps.print.imageAlt")}
          />
        </div>

        <div className={styles.step}>
          <h3 className={styles.stepHeading}>{t("help.backupHeading")}</h3>
          <p className={styles.body}>{t("help.backupBody")}</p>
        </div>
      </section>

      <section className={styles.section}>
        <h2 className={styles.sectionHeading}>{t("help.faqHeading")}</h2>

        <h3 className={styles.faqCategoryHeading}>
          {t("help.faq.dataCategoryHeading")}
        </h3>

        <div className={styles.faqItem}>
          <h4 className={styles.faqQuestion}>{t("help.faq.dataWhere.q")}</h4>
          <p className={styles.body}>{t("help.faq.dataWhere.a")}</p>
        </div>

        <div className={styles.faqItem}>
          <h4 className={styles.faqQuestion}>{t("help.faq.dataLost.q")}</h4>
          <p className={styles.body}>{t("help.faq.dataLost.a")}</p>
        </div>

        <div className={styles.faqItem}>
          <h4 className={styles.faqQuestion}>
            {t("help.faq.backupRestore.q")}
          </h4>
          <p className={styles.body}>{t("help.faq.backupRestore.a")}</p>
        </div>

        <div className={styles.faqItem}>
          <h4 className={styles.faqQuestion}>{t("help.faq.moveDevice.q")}</h4>
          <p className={styles.body}>{t("help.faq.moveDevice.a")}</p>
        </div>

        <h3 className={styles.faqCategoryHeading}>
          {t("help.faq.envCategoryHeading")}
        </h3>

        <div className={styles.faqItem}>
          <h4 className={styles.faqQuestion}>
            {t("help.faq.supportedBrowsers.q")}
          </h4>
          <p className={styles.body}>{t("help.faq.supportedBrowsers.a")}</p>
        </div>

        <div className={styles.faqItem}>
          <h4 className={styles.faqQuestion}>{t("help.faq.offline.q")}</h4>
          <p className={styles.body}>{t("help.faq.offline.a")}</p>
        </div>

        <h3 className={styles.faqCategoryHeading}>
          {t("help.faq.shareCategoryHeading")}
        </h3>

        <div className={styles.faqItem}>
          <h4 className={styles.faqQuestion}>{t("help.faq.shareCard.q")}</h4>
          <p className={styles.body}>{t("help.faq.shareCard.a")}</p>
        </div>

        <div className={styles.faqItem}>
          <h4 className={styles.faqQuestion}>{t("help.faq.pdf.q")}</h4>
          <p className={styles.body}>{t("help.faq.pdf.a")}</p>
        </div>

        <div className={styles.faqItem}>
          <h4 className={styles.faqQuestion}>{t("help.faq.noteMd.q")}</h4>
          <p className={styles.body}>{t("help.faq.noteMd.a")}</p>
        </div>
      </section>
    </div>
  );
}

export default HelpPage;
