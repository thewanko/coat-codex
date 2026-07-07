import type { ReactNode } from "react";
import { Link } from "react-router";
import { useTranslation } from "react-i18next";
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
          {t("app.title")}
        </Link>
        <LanguageSwitcher />
      </header>
      <main className={styles.main}>{children}</main>
      <footer className={styles.footer}>{t("footer.copyright")}</footer>
    </div>
  );
}

export default AppShell;
