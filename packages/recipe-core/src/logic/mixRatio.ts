// logic/mixRatio.ts — 混合比率の純関数群（技術計画v2.2 §2.3/§2.4）
//
// すべて純関数（引数を破壊しない）。UI・exporter・インポート正規化から共用する。
// 保存されるのはスロット順の整数%配列 `mix` のみ。比率テキスト・約分結果・
// バッジ文字列などの派生表現はここで表示時に導出する（単一情報源の原則）。

export interface StepPaint {
  colorId: string;
}
// スロット順の整数%。単色・塗料0件はnull
export type Mix = number[] | null;
export interface MixState {
  paints: StepPaint[];
  mix: Mix;
}

/** 比率テキストをパース。2〜5項・各1〜999の整数のみ受理（小数比率はv2.2で廃止）。不正は null */
export function parseRatioText(text: string): number[] | null {
  const parts = text.split(":").map((part) => part.trim());
  if (parts.length < 2 || parts.length > 5) return null;

  const values: number[] = [];
  for (const part of parts) {
    if (!/^\d+$/.test(part)) return null;
    const value = Number(part);
    if (!Number.isInteger(value) || value < 1 || value > 999) return null;
    values.push(value);
  }
  return values;
}

/** 比率配列 → "5:3:2" テキストへ整形 */
export function formatRatioText(ratios: number[]): string {
  return ratios.join(":");
}

/** 丸め規則の本体（一般形）: 各生値を切り捨てで整数化し、targetSum（整数）との残差を末尾スロットへ
 *  一括加算。expandRatioToPercents / removePaintSlotの按分から共用（§2.3の丸め規則の実装） */
export function allocateIntegerPercents(
  rawPercents: number[],
  targetSum: number,
): number[] {
  const floored = rawPercents.map((value) => Math.floor(value));
  const flooredSum = floored.reduce((sum, value) => sum + value, 0);
  const remainder = targetSum - flooredSum;

  const result = [...floored];
  if (result.length > 0) {
    result[result.length - 1] += remainder;
  }
  return result;
}

/** 比率配列→整数%配列（合計100）へ展開。丸め規則（§2.3: 切り捨て＋剰余は末尾スロットへ一括加算）適用済み */
export function expandRatioToPercents(ratios: number[]): number[] {
  const total = ratios.reduce((sum, value) => sum + value, 0);
  const raw = ratios.map((value) => (value / total) * 100);
  return allocateIntegerPercents(raw, 100);
}

function gcd(a: number, b: number): number {
  let x = a;
  let y = b;
  while (y !== 0) {
    const temp = y;
    y = x % y;
    x = temp;
  }
  return x;
}

/** 整数%配列→約分済み比率。合計100かつGCD約分後の全項が1桁（1〜9）のときのみ配列を返す。
 *  それ以外（合計≠100・約分不能）は null（比率表示は省略。§2.3） */
export function reducePercentsToRatio(percents: number[]): number[] | null {
  const total = percents.reduce((sum, value) => sum + value, 0);
  if (total !== 100) return null;
  if (percents.some((value) => value <= 0)) return null;

  const divisor = percents.reduce((acc, value) => gcd(acc, value), 0);
  if (divisor <= 0) return null;

  const reduced = percents.map((value) => value / divisor);
  const isSingleDigit = reduced.every(
    (value) => Number.isInteger(value) && value >= 1 && value <= 9,
  );
  if (!isSingleDigit) return null;

  return reduced;
}

/** mixの合計値（「計 n%」インジケータ・合計100判定に使用）。nullは0 */
export function sumPercents(mix: Mix): number {
  if (mix === null) return 0;
  return mix.reduce((sum, value) => sum + value, 0);
}

/** UI有効条件（§2.3）: 混色は合計100のときのみtrue。単色・塗料0件（mix=null）は常にtrue */
export function isMixTotalValid(paints: StepPaint[], mix: Mix): boolean {
  if (paints.length <= 1) return true;
  return sumPercents(mix) === 100;
}

/** 10-2バッジ文字列（バッジ表記の唯一の情報源 — 指摘19/D-1の原則を維持）。
 *  合計100: "60% + 40% (3:2)" ／ 約分不能: "55% + 45%"（比率省略）
 *  合計≠100: "60% + 50%"（比率省略。警告mix.totalWarningはUI/出力側でmix-errorバッジとして併記 — §2.3）
 *  単色・塗料0件: ""（バッジ非表示） */
export function formatMixBadge(paints: StepPaint[], mix: Mix): string {
  if (paints.length <= 1 || mix === null) return "";

  const percentsText = mix.map((value) => `${value}%`).join(" + ");
  const ratio = reducePercentsToRatio(mix);
  if (ratio === null) return percentsText;

  return `${percentsText} (${formatRatioText(ratio)})`;
}

/** %直接入力の確定。値を整数0〜100へclamp（小数は四捨五入で整数化）し mix[index] のみ更新（他スロット不変） */
export function commitPercentInput(
  state: MixState,
  index: number,
  value: number,
): MixState {
  if (state.mix === null) return state;

  const rounded = Math.round(value);
  const clamped = Math.min(100, Math.max(0, rounded));

  const nextMix = [...state.mix];
  nextMix[index] = clamped;

  return { paints: state.paints, mix: nextMix };
}

/** 比率入力の確定。ratios.length === paints.length のみ受理し、expandRatioToPercentsの結果をmixへ設定。
 *  項数不一致・paints.length ≤ 1 の場合は現状態をそのまま返す */
export function commitRatioInput(state: MixState, ratios: number[]): MixState {
  if (state.paints.length <= 1) return state;
  if (ratios.length !== state.paints.length) return state;

  return { paints: state.paints, mix: expandRatioToPercents(ratios) };
}

/** 塗料スロット追加（§2.3の規則: 0件→1件目=mix=nullのまま（単色規約）／単色→2色目=mix=[100, 0]／
 *  混色→mix末尾に0を追加／5件到達時は拒否（現状態を返す）） */
export function addPaintSlot(state: MixState, colorId: string): MixState {
  if (state.paints.length >= 5) return state;

  const nextPaints = [...state.paints, { colorId }];

  if (state.paints.length === 0) {
    return { paints: nextPaints, mix: null };
  }
  if (state.paints.length === 1) {
    return { paints: nextPaints, mix: [100, 0] };
  }
  const nextMix = state.mix === null ? null : [...state.mix, 0];
  return { paints: nextPaints, mix: nextMix };
}

/** 塗料スロット削除（§2.3の規則: 削除%を残スロットへ現在比按分（targetSum=削除前合計・剰余は末尾へ・
 *  残スロット全0なら均等按分）／残1件はmix=null（単色化）／0件はpaints=[]・mix=null） */
export function removePaintSlot(state: MixState, index: number): MixState {
  const nextPaints = state.paints.filter((_, i) => i !== index);

  if (nextPaints.length === 0) {
    return { paints: [], mix: null };
  }
  if (nextPaints.length === 1) {
    return { paints: nextPaints, mix: null };
  }

  // INV-2（paints≥2 ⇒ mix非null）により、正常フローでは state.mix が
  // ここでnullになることはない。以下は型上の防御パス（到達しない想定）。
  const currentMix = state.mix ?? state.paints.map(() => 0);
  const targetSum = currentMix.reduce((sum, value) => sum + value, 0);
  const remainingMix = currentMix.filter((_, i) => i !== index);
  const remainingSum = remainingMix.reduce((sum, value) => sum + value, 0);

  const raw =
    remainingSum === 0
      ? remainingMix.map(() => targetSum / remainingMix.length)
      : remainingMix.map((value) => (value / remainingSum) * targetSum);

  return { paints: nextPaints, mix: allocateIntegerPercents(raw, targetSum) };
}
