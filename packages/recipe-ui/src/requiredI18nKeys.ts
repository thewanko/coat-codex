// packages/recipe-ui/src/requiredI18nKeys.ts — recipe-ui部品が要求するi18nキーの言語非依存集合
// （coat-scriptorium 技術計画v1 §5.3）
//
// 言語非依存のキー名集合。codex は7言語・scriptorium は2言語と対象ロケール数が異なるため、
// 各アプリが自分の全ロケールに対してこの集合の網羅を検証する（codex T41と同じ流儀）。

import { TECHNIQUE_PRESET_KEYS } from "@coat-codex/recipe-core";

export const REQUIRED_I18N_KEYS: readonly string[] = [
  "paint.hexUnset",
  "mix.badgeWarning",
  ...TECHNIQUE_PRESET_KEYS.map((key) => `techniques.${key}`),
];
