// lib/sns/bluesky.ts — Bluesky向けSnsTarget実装（技術計画v2.2 §4.2 T38）
//
// 文字数カウンタ: Intl.Segmenter（granularity: "grapheme"）で300 grapheme上限。
//   ZWJ絵文字（👨‍👩‍👧‍👦等）・肌色修飾つき絵文字・結合文字（ダイアクリティカルマーク等）は
//   Intl.Segmenterのgrapheme cluster境界により1graphemeとして数えられる。
//
// Intent URL: https://bsky.app/intent/compose?text=…
//   300 graphemeはURLエンコード前に強制トリムする（§3.4手順6'）。

import type { SnsTarget, WeightedUnit } from "./types";
import { trimWithFixedTag } from "./types";

const BLUESKY_GRAPHEME_LIMIT = 300;

const graphemeSegmenter = new Intl.Segmenter(undefined, {
  granularity: "grapheme",
});

/** テキストをgrapheme cluster単位の配列に分割する */
function toGraphemes(text: string): string[] {
  return Array.from(
    graphemeSegmenter.segment(text),
    (segment) => segment.segment,
  );
}

/** grapheme単位（重みは常に1）のWeightedUnit配列へ分割する */
function toWeightedUnits(text: string): WeightedUnit[] {
  return toGraphemes(text).map((grapheme) => ({ text: grapheme, weight: 1 }));
}

function countText(text: string): {
  count: number;
  limit: number;
  over: boolean;
} {
  const count = toGraphemes(text).length;
  return {
    count,
    limit: BLUESKY_GRAPHEME_LIMIT,
    over: count > BLUESKY_GRAPHEME_LIMIT,
  };
}

function trimToLimit(text: string): string {
  return trimWithFixedTag(text, toWeightedUnits, BLUESKY_GRAPHEME_LIMIT);
}

function buildIntentUrl(text: string): string {
  const safeText = countText(text).over ? trimToLimit(text) : text;
  return `https://bsky.app/intent/compose?text=${encodeURIComponent(safeText)}`;
}

export function buildBlueskyTarget(): SnsTarget {
  return {
    key: "bluesky",
    label: "Bluesky",
    buildIntentUrl,
    countText,
    trimToLimit,
  };
}
