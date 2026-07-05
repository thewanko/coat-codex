import i18next from "i18next";
import { initReactI18next } from "react-i18next";
import ja from "./locales/ja.json";
import en from "./locales/en.json";
import fr from "./locales/fr.json";
import de from "./locales/de.json";
import it from "./locales/it.json";
import es from "./locales/es.json";
import ko from "./locales/ko.json";

export const LANG_STORAGE_KEY = "coat-codex:lang";

export type SupportedLang = "ja" | "en" | "fr" | "de" | "it" | "es" | "ko";

const SUPPORTED_LANGS: SupportedLang[] = [
  "ja",
  "en",
  "fr",
  "de",
  "it",
  "es",
  "ko",
];

function readStoredLang(): SupportedLang {
  const stored = window.localStorage.getItem(LANG_STORAGE_KEY);
  return (SUPPORTED_LANGS as string[]).includes(stored ?? "")
    ? (stored as SupportedLang)
    : "ja";
}

void i18next.use(initReactI18next).init({
  resources: {
    ja: { translation: ja },
    en: { translation: en },
    fr: { translation: fr },
    de: { translation: de },
    it: { translation: it },
    es: { translation: es },
    ko: { translation: ko },
  },
  lng: readStoredLang(),
  fallbackLng: "ja",
  interpolation: {
    escapeValue: false,
  },
});

i18next.on("languageChanged", (lng) => {
  window.localStorage.setItem(LANG_STORAGE_KEY, lng);
  document.documentElement.lang = lng;
});

document.documentElement.lang = i18next.language;

export default i18next;
