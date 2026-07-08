import type { ReactNode } from "react";
import { Link } from "react-router";
import { useTranslation } from "react-i18next";
import sealLogo from "../assets/seal-logo.png";
import styles from "./AppShell.module.css";

const LANGS: { code: "en" | "ja"; labelKey: "lang.en" | "lang.ja" }[] = [
  { code: "en", labelKey: "lang.en" },
  { code: "ja", labelKey: "lang.ja" },
];

function LanguageSwitcher() {
  const { t, i18n } = useTranslation();

  return (
    <div className={styles.langSwitcher} aria-label={t("lang.switcherLabel")}>
      {LANGS.map(({ code, labelKey }) => {
        const selected = i18n.language === code;
        return (
          <button
            key={code}
            type="button"
            aria-pressed={selected}
            className={
              selected
                ? `${styles.langButton} ${styles.langButtonSelected}`
                : styles.langButton
            }
            onClick={() => void i18n.changeLanguage(code)}
          >
            {t(labelKey)}
          </button>
        );
      })}
    </div>
  );
}

function AppShell({ children }: { children?: ReactNode }) {
  const { t } = useTranslation();

  return (
    <div className={styles.shell}>
      <header className={styles.header}>
        <Link to="/" className={styles.brand}>
          <img
            src={sealLogo}
            alt=""
            aria-hidden="true"
            className={styles.seal}
          />
          <div className={styles.wordmarkGroup}>
            <span className={styles.wordmark}>
              <span className={styles.wordmarkInitial}>C</span>oat{" "}
              <span className={styles.wordmarkInitial}>S</span>criptorium
            </span>
            <span className={styles.tagline}>{t("app.tagline")}</span>
          </div>
        </Link>
        <LanguageSwitcher />
      </header>
      <main className={styles.main}>{children}</main>
      <footer className={styles.footer}>
        <div className={styles.footerRow}>
          <span>{t("footer.copyright")}</span>
          <span className={styles.footerDiamond} aria-hidden="true" />
          <Link to="/terms" className={styles.footerLink}>
            {t("footer.terms")}
          </Link>
          <span className={styles.footerDiamond} aria-hidden="true" />
          <Link to="/content-policy" className={styles.footerLink}>
            {t("footer.contentPolicy")}
          </Link>
        </div>
        <p className={styles.footerTrademark}>{t("footer.trademarkNotice")}</p>
      </footer>
    </div>
  );
}

export default AppShell;
