// lib/sns/x.ts — X（旧Twitter）向けSnsTarget実装（技術計画v2.2 §4.2 T38）
//
// 重み付き280字カウント（Xの公式weighted length仕様に準拠する標準実装）:
//   weight=1レンジ（4レンジ）: U+0000–U+10FF, U+2000–U+200D, U+2010–U+201F, U+2032–U+2037
//   上記4レンジに含まれるコードポイントはweight=1、それ以外（CJK等）はweight=2とする。
//   参照: https://developer.x.com/en/docs/counting-characters
//
// URL（t.co短縮）換算:
//   プロトコル付きURL（https?://…、空白文字の手前まで）は実際の文字数に関わらず
//   weight=23固定（t.co短縮リンクの標準長）としてカウントする。
//   投稿テキスト既定はURLなしだがユーザー編集で入り得るため、カウンタはURL検出に対応する。

import type { SnsTarget, WeightedUnit } from "./types";
import { trimWithFixedTag } from "./types";

const X_CHAR_LIMIT = 280;
/** t.co短縮後のURL固定weight */
const X_URL_WEIGHT = 23;

/** Xのweighted length仕様における「weight=1」の4レンジ（コードポイント範囲・両端含む） */
const WEIGHT_ONE_RANGES: ReadonlyArray<readonly [number, number]> = [
  [0x0000, 0x10ff],
  [0x2000, 0x200d],
  [0x2010, 0x201f],
  [0x2032, 0x2037],
];

/** 1コードポイントの文字列（サロゲートペア含む）に対する重み（1 or 2） */
function codePointWeight(char: string): number {
  const codePoint = char.codePointAt(0) ?? 0;
  const isWeightOne = WEIGHT_ONE_RANGES.some(
    ([start, end]) => codePoint >= start && codePoint <= end,
  );
  return isWeightOne ? 1 : 2;
}

/** 文字列をコードポイント単位（サロゲートペア対応）の配列へ分割する */
function toCodePoints(value: string): string[] {
  return Array.from(value);
}

/** プロトコル付きURL（http:// または https://、空白文字の手前まで）を検出する正規表現 */
const URL_PATTERN = /https?:\/\/\S+/gu;

/**
 * テキストをURL部分／非URL部分に分解し、URL部分は1トークンとして扱えるように
 * トークン配列を返す（各トークンは通常の文字列断片、またはURL全体の文字列のいずれか）。
 * 呼び出し側はURLトークンをweight=23固定として扱う。
 */
function tokenizeWithUrls(
  text: string,
): Array<{ value: string; isUrl: boolean }> {
  const tokens: Array<{ value: string; isUrl: boolean }> = [];
  let lastIndex = 0;

  for (const match of text.matchAll(URL_PATTERN)) {
    const start = match.index;
    if (start > lastIndex) {
      tokens.push({ value: text.slice(lastIndex, start), isUrl: false });
    }
    tokens.push({ value: match[0], isUrl: true });
    lastIndex = start + match[0].length;
  }

  if (lastIndex < text.length) {
    tokens.push({ value: text.slice(lastIndex), isUrl: false });
  }

  return tokens;
}

/**
 * カウント／トリム共通のunit分割: URL全体を1unit（weight=23固定）、それ以外は
 * コードポイント単位（weight=1 or 2）に分割する。
 * 表示文字列と重みを対で持つため、trimWithFixedTagが安全にunit単位で末尾から削り
 * join()で復元できる（文字列マーカー等のハックを介さない）。
 */
function toWeightedUnits(text: string): WeightedUnit[] {
  return tokenizeWithUrls(text).flatMap((token): WeightedUnit[] =>
    token.isUrl
      ? [{ text: token.value, weight: X_URL_WEIGHT }]
      : toCodePoints(token.value).map((char) => ({
          text: char,
          weight: codePointWeight(char),
        })),
  );
}

/** Xの重み付きカウントを計算する（URL=23固定・それ以外はコードポイント単位のweight） */
function weightedLength(text: string): number {
  return toWeightedUnits(text).reduce((sum, unit) => sum + unit.weight, 0);
}

function countText(text: string): {
  count: number;
  limit: number;
  over: boolean;
} {
  const count = weightedLength(text);
  return { count, limit: X_CHAR_LIMIT, over: count > X_CHAR_LIMIT };
}

function trimToLimit(text: string): string {
  return trimWithFixedTag(text, toWeightedUnits, X_CHAR_LIMIT);
}

function buildIntentUrl(text: string): string {
  const safeText = countText(text).over ? trimToLimit(text) : text;
  return `https://x.com/intent/post?text=${encodeURIComponent(safeText)}`;
}

export function buildXTarget(): SnsTarget {
  return {
    key: "x",
    label: "X",
    buildIntentUrl,
    countText,
    trimToLimit,
  };
}
