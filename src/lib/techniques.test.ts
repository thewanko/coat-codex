import { describe, expect, test } from "vitest";
import ja from "../i18n/locales/ja.json";
import en from "../i18n/locales/en.json";
import { resolveTechniqueLabel, TECHNIQUE_PRESET_KEYS } from "./techniques";

function fakeT(dict: Record<string, string>): (key: string) => string {
  return (key: string) => dict[key] ?? key;
}

describe("resolveTechniqueLabel", () => {
  test('presetKeyがマスタ内→t("techniques.<presetKey>")で解決', () => {
    const t = fakeT({ "techniques.basecoat": "ベースコート" });
    expect(
      resolveTechniqueLabel({ presetKey: "basecoat", label: null }, t),
    ).toBe("ベースコート");
  });

  test("presetKey=null＋label非null→labelをそのまま返す（自由入力）", () => {
    const t = fakeT({});
    expect(
      resolveTechniqueLabel({ presetKey: null, label: "自作の技法" }, t),
    ).toBe("自作の技法");
  });

  test("presetKeyがマスタ外（旧データ防御）→presetKey文字列をそのまま返す", () => {
    const t = fakeT({});
    expect(
      resolveTechniqueLabel({ presetKey: "old-legacy-key", label: null }, t),
    ).toBe("old-legacy-key");
  });

  test("presetKey・label両方null→空文字", () => {
    const t = fakeT({});
    expect(resolveTechniqueLabel({ presetKey: null, label: null }, t)).toBe("");
  });
});

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

  test("マスタは10種ちょうど", () => {
    expect(TECHNIQUE_PRESET_KEYS.length).toBe(10);
  });
});
