import { useTranslation } from "react-i18next";
import { Link } from "react-router";
import sealLogo from "../../assets/seal-logo.png";
import styles from "./AppFooter.module.css";

function AppFooter() {
  const { t } = useTranslation();

  return (
    <footer className={`${styles.footer} print-hide`}>
      <div className={styles.row}>
        <img src={sealLogo} alt="" aria-hidden="true" className={styles.logo} />
        <span>© coat-codex</span>
        <span className={styles.diamond} aria-hidden="true" />
        <Link to="/terms" className={styles.link}>
          {t("nav.terms")}
        </Link>
        <span className={styles.diamond} aria-hidden="true" />
        <Link to="/help" className={styles.link}>
          {t("nav.help")}
        </Link>
        <span className={styles.diamond} aria-hidden="true" />
        <Link to="/tools" className={styles.link}>
          {t("nav.tools")}
        </Link>
        <span className={styles.diamond} aria-hidden="true" />
        <Link to="/updates" className={styles.link}>
          {t("nav.updates")}
        </Link>
      </div>
      <p className={styles.trademark}>{t("footer.trademarkNotice")}</p>
    </footer>
  );
}

export default AppFooter;
