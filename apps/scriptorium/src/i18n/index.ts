import i18next from "i18next";
import { initReactI18next } from "react-i18next";
import en from "../locales/en.json";
import ja from "../locales/ja.json";

export const LANG_STORAGE_KEY = "scriptorium:lang";

export type SupportedLang = "en" | "ja";

const SUPPORTED_LANGS: SupportedLang[] = ["en", "ja"];

function detectInitialLang(): SupportedLang {
  const stored = window.localStorage.getItem(LANG_STORAGE_KEY);
  if ((SUPPORTED_LANGS as string[]).includes(stored ?? "")) {
    return stored as SupportedLang;
  }
  return window.navigator.language.toLowerCase().startsWith("ja") ? "ja" : "en";
}

void i18next.use(initReactI18next).init({
  resources: {
    en: { translation: en },
    ja: { translation: ja },
  },
  lng: detectInitialLang(),
  fallbackLng: "en",
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
