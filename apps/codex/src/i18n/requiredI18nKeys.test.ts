// i18n/requiredI18nKeys.test.ts — REQUIRED_I18N_KEYS（@coat-codex/recipe-ui）⇔ codex 7ロケール網羅
// （coat-scriptorium 技術計画v1 §5.3: REQUIRED_I18N_KEYSは言語非依存のキー名集合であり、
//  各アプリが自分の全ロケールに対して網羅を検証する。codex T41と同じ流儀）

import { describe, expect, test } from "vitest";
import { REQUIRED_I18N_KEYS } from "@coat-codex/recipe-ui";
import ja from "./locales/ja.json";
import en from "./locales/en.json";
import fr from "./locales/fr.json";
import de from "./locales/de.json";
import it from "./locales/it.json";
import es from "./locales/es.json";
import ko from "./locales/ko.json";

type JsonRecord = { [key: string]: JsonRecord | string };

function resolveKey(data: JsonRecord, key: string): string | undefined {
  const parts = key.split(".");
  let current: JsonRecord | string = data;
  for (const part of parts) {
    if (typeof current !== "object" || current === null) {
      return undefined;
    }
    const record: JsonRecord = current;
    const next: JsonRecord | string | undefined = record[part];
    if (next === undefined) {
      return undefined;
    }
    current = next;
  }
  return typeof current === "string" ? current : undefined;
}

const LOCALES: { code: string; data: JsonRecord }[] = [
  { code: "ja", data: ja as unknown as JsonRecord },
  { code: "en", data: en as unknown as JsonRecord },
  { code: "fr", data: fr as unknown as JsonRecord },
  { code: "de", data: de as unknown as JsonRecord },
  { code: "it", data: it as unknown as JsonRecord },
  { code: "es", data: es as unknown as JsonRecord },
  { code: "ko", data: ko as unknown as JsonRecord },
];

describe("REQUIRED_I18N_KEYS ⇔ codex 7ロケール網羅（§5.3）", () => {
  test("REQUIRED_I18N_KEYSは空でない", () => {
    expect(REQUIRED_I18N_KEYS.length).toBeGreaterThan(0);
  });

  for (const { code, data } of LOCALES) {
    test(`${code}.jsonでREQUIRED_I18N_KEYSの全キーが非空文字列に解決される`, () => {
      const missing: string[] = [];
      const empty: string[] = [];
      for (const key of REQUIRED_I18N_KEYS) {
        const value = resolveKey(data, key);
        if (value === undefined) {
          missing.push(key);
        } else if (value === "") {
          empty.push(key);
        }
      }
      expect(missing, `${code} missing keys`).toEqual([]);
      expect(empty, `${code} empty values`).toEqual([]);
    });
  }
});
