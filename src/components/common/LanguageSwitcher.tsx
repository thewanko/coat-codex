import { useTranslation } from "react-i18next";
import type { SupportedLang } from "../../i18n";
import styles from "./LanguageSwitcher.module.css";

const LANGS: { code: SupportedLang; label: string }[] = [
  { code: "ja", label: "JA" },
  { code: "en", label: "EN" },
];

function LanguageSwitcher() {
  const { i18n } = useTranslation();

  return (
    <div className={styles.switcher} role="group" aria-label="Language">
      {LANGS.map(({ code, label }) => {
        const active = i18n.language === code;
        return (
          <button
            key={code}
            type="button"
            className={
              active
                ? `${styles.segment} ${styles.segmentActive}`
                : styles.segment
            }
            aria-pressed={active}
            onClick={() => void i18n.changeLanguage(code)}
          >
            {label}
          </button>
        );
      })}
    </div>
  );
}

export default LanguageSwitcher;
