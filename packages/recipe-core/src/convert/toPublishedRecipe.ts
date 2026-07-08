// convert/toPublishedRecipe.ts — RecipeDoc → PublishedRecipe（技術計画v1 §2.2/§2.4）
//
// 削減規則（§2.2）: Step.photoId・PaletteColor.chipPhotoId・createdAt/updatedAt・
// overviewPhotoIds・photoCrops を除外する純関数。
// 除外: Step.photoId・PaletteColor.chipPhotoId・createdAt/updatedAt・overviewPhotoIds・
// photoCrops。memo・Tool.noteは §2.2改訂〔ユーザー裁定〕で公開に含める。
// 写真はcover 1枚のみでrecipe_jsonの外（API envelopeのcoverUrl/thumbUrl）に置くため、
// PublishedRecipe自体は写真情報を一切持たない。

import type { RecipeDoc, Step } from "../schema/recipe";
import type { PublishedRecipe, PublishedStep } from "../schema/published";

function toPublishedStep(step: Step): PublishedStep {
  return {
    id: step.id,
    technique: step.technique,
    paints: step.paints,
    mix: step.mix,
    toolIds: step.toolIds,
    memo: step.memo,
  };
}

/**
 * RecipeDocをPublishedRecipeへ変換する（削減規則§2.2の純関数）。
 * scriptoriumSchemaVersionは常に現行のSCRIPTORIUM_SCHEMA_VERSION（1）を埋める。
 */
export function toPublishedRecipe(doc: RecipeDoc): PublishedRecipe {
  return {
    scriptoriumSchemaVersion: 1,
    title: doc.title,
    palette: doc.palette.map((color) => ({
      id: color.id,
      source: color.source,
      brand: color.brand,
      name: color.name,
      presetId: color.presetId,
      hex: color.hex,
    })),
    tools: doc.tools.map((tool) => ({
      id: tool.id,
      name: tool.name,
      note: tool.note,
    })),
    baseSteps: doc.baseSteps.map(toPublishedStep),
    parts: doc.parts.map((part) => ({
      id: part.id,
      name: part.name,
      steps: part.steps.map(toPublishedStep),
    })),
  };
}
