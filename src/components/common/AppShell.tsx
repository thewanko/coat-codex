import type { ReactNode } from "react";
import { Outlet } from "react-router";
import { useTranslation } from "react-i18next";
import LanguageSwitcher from "./LanguageSwitcher";
import AppFooter from "./AppFooter";
import ToastHost from "./ToastHost";
import styles from "./AppShell.module.css";

function AppShell({ children }: { children?: ReactNode }) {
  const { t } = useTranslation();

  return (
    <ToastHost>
      <div className={styles.shell}>
        <header className={styles.header}>
          <div className={styles.brand}>
            <span className={styles.seal} aria-hidden="true">
              <span className={styles.sealInner}>cc</span>
            </span>
            <div className={styles.wordmarkGroup}>
              <span className={styles.wordmark}>
                <span className={styles.wordmarkInitial}>C</span>oat{" "}
                <span className={styles.wordmarkInitial}>C</span>odex
              </span>
              <span className={styles.tagline}>{t("app.tagline")}</span>
            </div>
          </div>
          <LanguageSwitcher />
        </header>
        <main className={styles.main}>{children ?? <Outlet />}</main>
        <AppFooter />
      </div>
    </ToastHost>
  );
}

export default AppShell;
