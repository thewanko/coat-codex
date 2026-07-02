import i18next from "i18next";
import { initReactI18next } from "react-i18next";
import ja from "./locales/ja.json";
import en from "./locales/en.json";

export const LANG_STORAGE_KEY = "coat-codex:lang";

export type SupportedLang = "ja" | "en";

function readStoredLang(): SupportedLang {
  const stored = window.localStorage.getItem(LANG_STORAGE_KEY);
  return stored === "ja" || stored === "en" ? stored : "ja";
}

void i18next.use(initReactI18next).init({
  resources: {
    ja: { translation: ja },
    en: { translation: en },
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
