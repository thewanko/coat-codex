// lib/sns/types.ts — SnsTarget共通IF＋配列登録制（技術計画v2.2 §4.2 T38・§3.4）
//
// SNS共有先を1件のオブジェクトとして表現し、snsTargetsへ配列登録することで
// 新規SNS（Mastodon等）を1ファイル追加のみで拡張できる構造にする（T38要件）。
//
// 自動トリムの共通仕様（§3.4手順3・6'）:
//   `#coatcodex` はトリム対象外＝トリム後も末尾に維持する。本文を末尾から削って
//   上限内に収め、削った場合は省略記号「…」を付与する（…とタグ分の重みも上限計算に
//   含める）。すでに上限内なら原文のまま返す。

import { buildXTarget } from "./x";
import { buildBlueskyTarget } from "./bluesky";

/** トリム対象外として末尾に維持する固定タグ（§3.4） */
export const SNS_FIXED_TAG = "#coatcodex";

/** 省略記号（自動トリムで本文を削った際に付与） */
export const SNS_ELLIPSIS = "…";

export interface SnsTarget {
  /** 内部識別子（"x" | "bluesky" 等） */
  key: string;
  /** 表示名（固有名詞のためi18n不要。"X" / "Bluesky"） */
  label: string;
  /**
   * 新規タブで開くIntent URL。上限超過テキストはURLエンコード前に強制トリムする
   * （§3.4手順6'「300 graphemeをURLエンコード前に強制」と同義の規約をXにも適用）。
   */
  buildIntentUrl(text: string): string;
  /** テキストの現在文字数・上限・超過有無を返す */
  countText(text: string): { count: number; limit: number; over: boolean };
  /** 自動トリム。`#coatcodex` はトリム対象外＝末尾維持 */
  trimToLimit(text: string): string;
}

/** カウント単位（Xはコードポイント／URLトークン、Blueskyはgrapheme）1つ分の表示文字列と重み */
export interface WeightedUnit {
  text: string;
  weight: number;
}

/**
 * 本文をWeightedUnit配列（カウント単位＝Xはコードポイント/URLトークン、Blueskyはgrapheme）に
 * 分割した状態で末尾から削り上限内に収める共通トリムアルゴリズム
 * （types.ts側に共通ヘルパとして集約）。
 *
 * アルゴリズム:
 *   1. テキスト末尾に SNS_FIXED_TAG が存在するかを検出し、存在する場合は本文部分と
 *      タグ部分に分離する（タグは常に温存＝トリム対象外）。
 *   2. 本文＋（タグがあれば区切り＋タグ）の合計weightが上限以下ならそのまま返す。
 *   3. 上限を超える場合は「本文を末尾から削り、ELLIPSIS＋（タグがあれば区切り＋タグ）を
 *      付与した合計」が上限以下になるまで本文unitを1つずつ削る。
 *
 * @param text 元のテキスト
 * @param toUnits テキストをWeightedUnit配列へ分割する関数（表示文字列と重みを対で返す）
 * @param limit 上限（重みの合計）
 */
export function trimWithFixedTag(
  text: string,
  toUnits: (value: string) => WeightedUnit[],
  limit: number,
): string {
  const hasTag = text === SNS_FIXED_TAG || text.endsWith(SNS_FIXED_TAG);
  const tagSuffix = hasTag
    ? text.slice(text.length - SNS_FIXED_TAG.length)
    : "";
  const bodyRaw = hasTag
    ? text.slice(0, text.length - SNS_FIXED_TAG.length)
    : text;

  const totalWeight = (units: WeightedUnit[]) =>
    units.reduce((sum, unit) => sum + unit.weight, 0);

  if (totalWeight(toUnits(text)) <= limit) {
    return text;
  }

  const tagWeight = totalWeight(toUnits(tagSuffix));
  const ellipsisWeight = totalWeight(toUnits(SNS_ELLIPSIS));
  const bodyUnits = toUnits(bodyRaw);

  // 極小limitガード: 本文を全削りしても ELLIPSIS＋タグだけで上限を超える場合は
  // これ以上削っても over=false にできないため、タグのみ（本文もELLIPSISも持たない）を返す。
  // タグ自体が上限を超える極限ケースでもタグは温存する（不変条件よりタグ維持を優先）。
  if (tagWeight + ellipsisWeight > limit) {
    return tagSuffix;
  }

  // 本文を末尾から1unitずつ削り、ELLIPSIS＋タグを足した合計が上限以内になるまで縮める
  let end = bodyUnits.length;
  while (end > 0) {
    const candidateBodyWeight = totalWeight(bodyUnits.slice(0, end));
    if (candidateBodyWeight + ellipsisWeight + tagWeight <= limit) {
      break;
    }
    end -= 1;
  }

  const trimmedBody = bodyUnits
    .slice(0, end)
    .map((unit) => unit.text)
    .join("");
  return `${trimmedBody}${SNS_ELLIPSIS}${tagSuffix}`;
}

/** SNS共有先の配列登録（x, bluesky の順。Mastodon等を1ファイル追加で拡張可能な構造） */
export const snsTargets: SnsTarget[] = [buildXTarget(), buildBlueskyTarget()];
