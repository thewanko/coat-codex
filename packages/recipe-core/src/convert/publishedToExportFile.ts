// convert/publishedToExportFile.ts — PublishedRecipe → RecipeExportFile（技術計画v1 §2.4）
//
// 既存importRecipeパイプライン（exchange/importPipeline.ts の runImportPipeline）を
// そのまま再利用するためのブリッジ。PublishedRecipeが持たないcodex専用フィールド
// （memo・photoId・note・chipPhotoId・timestamps）を補完し、coverDataUrlがあれば
// 単一のcover写真（id: "ph_cover"）としてphotos[]・overviewPhotoIdsへ差し込む。

import { CURRENT_SCHEMA_VERSION } from "../schema/migrations";
import type {
  ExportPhoto,
  RecipeDoc,
  RecipeExportFile,
  RecipeSource,
  Step,
} from "../schema/recipe";
import type { PublishedRecipe, PublishedStep } from "../schema/published";

/** publishedToExportFileのmeta引数（scriptoriumからの出典情報。§2.5 RecipeSource相当） */
export interface PublishedToExportFileMeta {
  scriptoriumId: string;
  author: string;
  importedAt: string;
}

const COVER_PHOTO_ID = "ph_cover";

function toDocStep(step: PublishedStep): Step {
  return {
    id: step.id,
    technique: step.technique,
    photoId: null,
    paints: step.paints,
    mix: step.mix,
    toolIds: step.toolIds,
    memo: "",
  };
}

/**
 * PublishedRecipeをRecipeExportFileへ変換する（§2.4 ブリッジ関数）。
 * memo=""・note=null・chipPhotoId=null・timestamps=nowを補完し、coverDataUrlがあれば
 * photos:[{id:"ph_cover", dataUrl}]＋overviewPhotoIds:["ph_cover"]を生成する。
 * sourceにはmetaを埋め、schemaVersion=CURRENT_SCHEMA_VERSIONとする。
 * 返り値はrecipeExportFileSchemaを通ること（＝有効なRecipeExportFile）を保証する
 * （呼び出し側のrunImportPipelineが内部でこのスキーマにより再検証する）。
 */
export function publishedToExportFile(
  pub: PublishedRecipe,
  meta: PublishedToExportFileMeta,
  coverDataUrl?: string,
): RecipeExportFile {
  const now = new Date().toISOString();
  const hasCover = coverDataUrl !== undefined;

  const source: RecipeSource = {
    scriptoriumId: meta.scriptoriumId,
    author: meta.author,
    importedAt: meta.importedAt,
  };

  const recipe: RecipeDoc = {
    schemaVersion: CURRENT_SCHEMA_VERSION,
    // importパイプライン（runImportPipeline→reassignRecipeIds）が全IDを再採番するため、
    // ここでのidは形式を満たすための暫定値にすぎない（この値自体は保存されない）。
    id: `rcp_${crypto.randomUUID()}`,
    title: pub.title,
    createdAt: now,
    updatedAt: now,
    overviewPhotoIds: hasCover ? [COVER_PHOTO_ID] : [],
    palette: pub.palette.map((color) => ({
      id: color.id,
      source: color.source,
      brand: color.brand,
      name: color.name,
      presetId: color.presetId,
      hex: color.hex,
      chipPhotoId: null,
    })),
    tools: pub.tools.map((tool) => ({
      id: tool.id,
      name: tool.name,
      note: null,
    })),
    baseSteps: pub.baseSteps.map(toDocStep),
    parts: pub.parts.map((part) => ({
      id: part.id,
      name: part.name,
      steps: part.steps.map(toDocStep),
    })),
    photoCrops: {},
    source,
  };

  const photos: ExportPhoto[] = hasCover
    ? [{ id: COVER_PHOTO_ID, dataUrl: coverDataUrl }]
    : [];

  return {
    app: "coat-codex",
    kind: "recipe-export",
    schemaVersion: CURRENT_SCHEMA_VERSION,
    exportedAt: now,
    recipe,
    photos,
  };
}
