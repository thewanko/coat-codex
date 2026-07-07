// i18n/techniquesLocales.test.ts — TECHNIQUE_PRESET_KEYS ⇔ i18nロケール網羅テスト
// （技術計画v1 §1.4-2(b): techniques.ts本体はpackages/recipe-coreへ移動したが、
//  ja.json/en.jsonはcodex資産のためテストはcodex側に残す）

import { describe, expect, test } from "vitest";
import { TECHNIQUE_PRESET_KEYS } from "@coat-codex/recipe-core";
import ja from "./locales/ja.json";
import en from "./locales/en.json";

describe("TECHNIQUE_PRESET_KEYS ⇔ i18nロケール網羅", () => {
  test("ja.jsonにマスタ全10キーのtechniques.*が存在する", () => {
    const techniques = (ja as { techniques?: Record<string, string> })
      .techniques;
    expect(techniques).toBeDefined();
    for (const key of TECHNIQUE_PRESET_KEYS) {
      expect(techniques?.[key]).toEqual(expect.any(String));
      expect(techniques?.[key]).not.toBe("");
    }
  });

  test("en.jsonにマスタ全10キーのtechniques.*が存在する", () => {
    const techniques = (en as { techniques?: Record<string, string> })
      .techniques;
    expect(techniques).toBeDefined();
    for (const key of TECHNIQUE_PRESET_KEYS) {
      expect(techniques?.[key]).toEqual(expect.any(String));
      expect(techniques?.[key]).not.toBe("");
    }
  });
});
