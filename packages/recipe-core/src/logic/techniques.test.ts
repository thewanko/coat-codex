import { describe, expect, test } from "vitest";
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

describe("TECHNIQUE_PRESET_KEYS", () => {
  test("マスタは10種ちょうど", () => {
    expect(TECHNIQUE_PRESET_KEYS.length).toBe(10);
  });
});
