// packages/recipe-ui/src/requiredI18nKeys.test.ts — REQUIRED_I18N_KEYSがアトムの実t()呼び出しと
// 整合していることを固定する（coat-scriptorium 技術計画v1 §5.3）

import { describe, expect, test } from "vitest";
import { TECHNIQUE_PRESET_KEYS } from "@coat-codex/recipe-core";
import { REQUIRED_I18N_KEYS } from "./requiredI18nKeys";

describe("REQUIRED_I18N_KEYS", () => {
  test("SwatchChip/MixBadgeが実際にt()するキーを含む", () => {
    expect(REQUIRED_I18N_KEYS).toContain("paint.hexUnset");
    expect(REQUIRED_I18N_KEYS).toContain("mix.badgeWarning");
  });

  test("TECHNIQUE_PRESET_KEYS全件がtechniques.<key>の形で含まれる", () => {
    for (const key of TECHNIQUE_PRESET_KEYS) {
      expect(REQUIRED_I18N_KEYS).toContain(`techniques.${key}`);
    }
  });

  test("キー総数はTECHNIQUE_PRESET_KEYS件数+2（paint.hexUnset・mix.badgeWarning）に一致する", () => {
    expect(REQUIRED_I18N_KEYS).toHaveLength(TECHNIQUE_PRESET_KEYS.length + 2);
  });
});
