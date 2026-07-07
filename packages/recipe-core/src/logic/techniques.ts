// logic/techniques.ts — 技法プリセットの単一情報源（技術計画v2.2 §2.1末尾「指摘14」）
//
// 表示名はi18nキー "techniques.<presetKey>"（ja.json / en.jsonに全キー定義）で解決する。
// presetKeyがマスタ外の場合（将来プリセットを削除した後の旧データ等）は
// presetKey文字列をそのまま表示するフォールバック。

export const TECHNIQUE_PRESET_KEYS = [
  "prime",
  "basecoat",
  "layer",
  "wash",
  "drybrush",
  "edge-highlight",
  "glaze",
  "stipple",
  "masking",
  "varnish",
] as const;

export type TechniquePresetKey = (typeof TECHNIQUE_PRESET_KEYS)[number];

/** presetKeyがマスタ所属かどうかの判定 */
function isTechniquePresetKey(value: string): value is TechniquePresetKey {
  return (TECHNIQUE_PRESET_KEYS as readonly string[]).includes(value);
}

/** technique（presetKey/label）の表示名を解決（§2.1: 3分岐＋両方null）
 *  ①presetKeyがマスタ内→t("techniques.<presetKey>")で解決
 *  ②presetKey=null＋label非null→labelをそのまま返す
 *  ③presetKeyがマスタ外（旧データ防御）→presetKey文字列をそのまま返す
 *  両方null→空文字 */
export function resolveTechniqueLabel(
  technique: { presetKey: string | null; label: string | null },
  t: (key: string) => string,
): string {
  const { presetKey, label } = technique;

  if (presetKey !== null) {
    return isTechniquePresetKey(presetKey)
      ? t(`techniques.${presetKey}`)
      : presetKey;
  }

  if (label !== null) return label;

  return "";
}
