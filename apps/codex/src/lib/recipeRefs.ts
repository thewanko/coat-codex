// lib/recipeRefs.ts — 参照整合性ユーティリティ（技術計画v2.2 §2.6/§4.2 T10）
//
// 色・ツールの「使用中は削除不可」判定に使う純関数群。baseSteps・全parts[].stepsを横断して
// 参照しているStep数を返す。1 Step内での同一colorId重複はINV-7で禁止されているため、
// Stepごとの単純な該当有無カウントでよい（同色を1 Step内で複数回数えない）。

import type { RecipeDoc } from "@coat-codex/recipe-core";

/** baseSteps・全parts[].stepsを横断した全Stepの配列を返す（内部ヘルパー） */
function allSteps(doc: RecipeDoc): RecipeDoc["baseSteps"] {
  return [...doc.baseSteps, ...doc.parts.flatMap((part) => part.steps)];
}

/** colorIdを参照しているStep数を返す（baseSteps・全parts[].steps横断） */
export function countColorUsage(doc: RecipeDoc, colorId: string): number {
  return allSteps(doc).filter((step) =>
    step.paints.some((paint) => paint.colorId === colorId),
  ).length;
}

/** toolIdを参照しているStep数を返す（baseSteps・全parts[].steps横断） */
export function countToolUsage(doc: RecipeDoc, toolId: string): number {
  return allSteps(doc).filter((step) => step.toolIds.includes(toolId)).length;
}
