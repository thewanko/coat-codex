import { useEffect, type ReactNode } from "react";
import { Link, Outlet } from "react-router";
import { useTranslation } from "react-i18next";
import { useRecipeStore } from "../../stores/useRecipeStore";
import LanguageSwitcher from "./LanguageSwitcher";
import AppFooter from "./AppFooter";
import ToastHost from "./ToastHost";
import styles from "./AppShell.module.css";

function AppShell({ children }: { children?: ReactNode }) {
  const { t } = useTranslation();

  useEffect(() => {
    // タブクローズ/リロード直前にpending中のautosave（500ms debounce）をbest-effortでflushする
    // （M4 Opusレビュー Round1 Medium対応）。pagehideは非同期処理の完了を待たないため、
    // flushAutosave内部のDexie書き込みが完了する保証はない（あくまで発火させるのみ）。
    function handlePageHide() {
      void useRecipeStore.getState().flushAutosave();
    }
    window.addEventListener("pagehide", handlePageHide);
    return () => {
      window.removeEventListener("pagehide", handlePageHide);
    };
  }, []);

  return (
    <ToastHost>
      <div className={styles.shell}>
        <header className={styles.header}>
          <Link to="/" className={styles.brand}>
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
          </Link>
          <LanguageSwitcher />
        </header>
        <main className={styles.main}>{children ?? <Outlet />}</main>
        <AppFooter />
      </div>
    </ToastHost>
  );
}

export default AppShell;
