import { useTranslation } from "react-i18next";
import { Link } from "react-router";
import styles from "./AppFooter.module.css";

function AppFooter() {
  const { t } = useTranslation();

  return (
    <footer className={styles.footer}>
      <span>© coat-codex</span>
      <span className={styles.diamond} aria-hidden="true" />
      <Link to="/terms" className={styles.link}>
        {t("nav.terms")}
      </Link>
    </footer>
  );
}

export default AppFooter;
