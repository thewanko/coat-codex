// lib/importRecipe.ts — インポートパイプライン（技術計画v2.2 §2.7・T30）
//
// §2.7の3段検証（①ヘッダ検証 → ②migrate → ③フル検証）＋normalizeImport（正規化規則a〜e）＋
// Dexie rwトランザクション書き込みを提供する。
//
// 正規化規則（§2.7）:
//   a. 全ID新規採番（rcp_/col_/tool_/part_/stp_/ph_）＋旧ID→新IDのMap作成
//   b. 参照リマップ（colorId/toolIds/overviewPhotoIds/steps[].photoId/chipPhotoId）
//   c. dangling photo除去（photos[].idに実体がないphoto参照を除去）
//   d. マスタ外presetKey降格（Step.technique.presetKey。lib/techniques.tsの静的マスタで判定）
//      ＋マスタ外presetId降格（palette[].presetId。lib/paintPresets.tsの非同期プリセットDBで判定。
//      INV-14整合のためsource="custom"・presetId=nullへ降格）
//   e. schemaVersion=CURRENT・createdAtは保持・updatedAt=now
//
// a・bはreassignRecipeIdsとして分離エクスポートする（T33のレシピ複製で単独再利用されるため、
// dangling photo除去・presetKey/presetId降格を含まない純粋な形にする）。

import { db } from "../db/db";
import type { PhotoRecord } from "../db/db";
import {
  recipeExportFileSchema,
  type RecipeDoc,
  type RecipeExportFile,
  type Step,
} from "../models/recipe";
import { migrateExportFile } from "../models/migrations";
import { CURRENT_SCHEMA_VERSION } from "../models/migrations";
import { TECHNIQUE_PRESET_KEYS } from "./techniques";
import { loadBrandColorsResult } from "./paintPresets";

/** 第1段ヘッダ検証の最小スキーマ（§2.7①）。app/kind/schemaVersionのみを見る */
import { z } from "zod";

const importHeaderSchema = z.looseObject({
  app: z.literal("coat-codex"),
  kind: z.literal("recipe-export"),
  schemaVersion: z.int().min(1),
});

/** zodのissue1件を構造化した形（パス・メッセージ）。ImportErrorDialog（T33）が表示に使う */
export interface ImportIssue {
  path: (string | number)[];
  message: string;
}

/** インポート検証失敗の理由種別 */
export type ImportFailureReason =
  | "invalid-json"
  | "invalid-header"
  | "unsupported-version"
  | "invalid-schema"
  | "transaction-failed";

/** インポート失敗結果。zod issue一覧は構造化データとして返す（UI整形はしない） */
export interface ImportFailure {
  ok: false;
  reason: ImportFailureReason;
  message: string;
  issues: ImportIssue[];
}

/** インポート成功結果。書き込み済みの新しいRecipeDocを返す */
export interface ImportSuccess {
  ok: true;
  recipe: RecipeDoc;
}

export type ImportResult = ImportFailure | ImportSuccess;

function issuesFromZodError(error: z.ZodError): ImportIssue[] {
  return error.issues.map((issue) => ({
    path: issue.path as (string | number)[],
    message: issue.message,
  }));
}

function failure(
  reason: ImportFailureReason,
  message: string,
  issues: ImportIssue[] = [],
): ImportFailure {
  return { ok: false, reason, message, issues };
}

// ---------------------------------------------------------------------------
// reassignRecipeIds — ID新規採番＋参照リマップ（正規化規則a・b）
// ---------------------------------------------------------------------------

/** reassignRecipeIdsの返り値 */
export interface ReassignRecipeIdsResult {
  /** 全ID新規採番・参照リマップ済みのRecipeDoc */
  recipe: RecipeDoc;
  /** 旧photoId→新photoIdのMap（呼び出し側がphotos側の採番に使う） */
  photoIdMap: Map<string, string>;
}

function remapNullableId(
  id: string | null,
  map: Map<string, string>,
): string | null {
  if (id === null) return null;
  return map.get(id) ?? null;
}

/**
 * RecipeDoc内の全ID（rcp_/col_/tool_/part_/stp_/ph_）を新規採番し、文書内の全参照
 * （colorId/toolIds/overviewPhotoIds/steps[].photoId/chipPhotoId）をリマップした新しい
 * RecipeDocを返す（純関数・DBアクセスなし）。
 *
 * photoIdは「文書内で参照されているID」のみを採番対象にする（dangling除去は呼び出し側の
 * 責務。本関数は参照有無に関わらず文書内に出現するphotoId参照をすべて新IDへ置換する）。
 *
 * T33のレシピ複製から単独で呼び出せるよう、presetKey/presetId降格やupdatedAt更新は含まない
 * （それらはnormalizeImport側の責務）。
 */
export function reassignRecipeIds(recipe: RecipeDoc): ReassignRecipeIdsResult {
  const colorIdMap = new Map<string, string>();
  const toolIdMap = new Map<string, string>();
  const partIdMap = new Map<string, string>();
  const stepIdMap = new Map<string, string>();
  const photoIdMap = new Map<string, string>();

  const newId = (prefix: string) => `${prefix}_${crypto.randomUUID()}`;

  for (const color of recipe.palette) {
    colorIdMap.set(color.id, newId("col"));
    if (color.chipPhotoId !== null && !photoIdMap.has(color.chipPhotoId)) {
      photoIdMap.set(color.chipPhotoId, newId("ph"));
    }
  }
  for (const tool of recipe.tools) {
    toolIdMap.set(tool.id, newId("tool"));
  }
  for (const photoId of recipe.overviewPhotoIds) {
    if (!photoIdMap.has(photoId)) {
      photoIdMap.set(photoId, newId("ph"));
    }
  }
  for (const part of recipe.parts) {
    partIdMap.set(part.id, newId("part"));
  }

  const remapStepIds = (steps: Step[]) => {
    for (const step of steps) {
      stepIdMap.set(step.id, newId("stp"));
      if (step.photoId !== null && !photoIdMap.has(step.photoId)) {
        photoIdMap.set(step.photoId, newId("ph"));
      }
    }
  };
  remapStepIds(recipe.baseSteps);
  for (const part of recipe.parts) {
    remapStepIds(part.steps);
  }

  const remapStep = (step: Step): Step => ({
    ...step,
    id: stepIdMap.get(step.id) ?? newId("stp"),
    photoId: remapNullableId(step.photoId, photoIdMap),
    paints: step.paints.map((paint) => ({
      colorId: colorIdMap.get(paint.colorId) ?? paint.colorId,
    })),
    toolIds: step.toolIds.map((toolId) => toolIdMap.get(toolId) ?? toolId),
  });

  const newRecipe: RecipeDoc = {
    ...recipe,
    id: newId("rcp"),
    overviewPhotoIds: recipe.overviewPhotoIds.map(
      (photoId) => photoIdMap.get(photoId) ?? photoId,
    ),
    palette: recipe.palette.map((color) => ({
      ...color,
      id: colorIdMap.get(color.id) ?? color.id,
      chipPhotoId: remapNullableId(color.chipPhotoId, photoIdMap),
    })),
    tools: recipe.tools.map((tool) => ({
      ...tool,
      id: toolIdMap.get(tool.id) ?? tool.id,
    })),
    baseSteps: recipe.baseSteps.map(remapStep),
    parts: recipe.parts.map((part) => ({
      ...part,
      id: partIdMap.get(part.id) ?? part.id,
      steps: part.steps.map(remapStep),
    })),
  };

  return { recipe: newRecipe, photoIdMap };
}

// ---------------------------------------------------------------------------
// normalizeImport — 正規化規則a〜e（reassignRecipeIds a・bに加えc・d・eを適用）
// ---------------------------------------------------------------------------

/** loadBrandColorsResult相当の照会結果（成否・理由を区別する）。
 *  lib/paintPresets.ts#LoadBrandColorsResultと同型だが、依存注入用にcolorsの要素型のみを
 *  最小化している（demotePresetColorsが必要とするのはidのみ）。 */
export type LoadBrandColorsForImportResult =
  | { ok: true; colors: { id: string }[] }
  | {
      ok: false;
      reason: "unknown-brand" | "fetch-failed" | "index-unavailable";
    };

/** normalizeImportが依存する外部処理（プリセットマスタ照会）をテストから注入できるようにする束 */
export interface NormalizeImportDeps {
  /** 指定brandIdのプリセット色一覧照会（成否・理由を区別して返す。§2.7 d 裁定規則a〜c）。
   *  省略時は本番実装 lib/paintPresets.ts#loadBrandColorsResult。 */
  loadBrandColorsResult: (
    brandId: string,
  ) => Promise<LoadBrandColorsForImportResult>;
}

const defaultNormalizeImportDeps: NormalizeImportDeps = {
  loadBrandColorsResult,
};

/** normalizeImportの返り値 */
export interface NormalizeImportResult {
  /** 正規化済みのRecipeDoc */
  recipe: RecipeDoc;
  /** 正規化済みのphotos（dangling除去後・新photoId採番済み） */
  photos: { id: string; dataUrl: string }[];
}

/** presetIdから`<brandId>:<slug>`形式のbrandIdを取り出す。形式不正時はnullを返す */
function brandIdFromPresetId(presetId: string): string | null {
  const idx = presetId.indexOf(":");
  if (idx <= 0) return null;
  return presetId.slice(0, idx);
}

/** 降格判定の結果種別（M5レビューRound1修正2の裁定規則a〜c）:
 *   "demote"  — a. ブランドがプリセットindexに存在しない（例: 旧AK） → 降格する
 *   "keep"    — b. ブランドはindexに存在するが色一覧取得がネットワーク起因で失敗
 *               → 降格せずpresetのまま維持（次回の正常なマスタ照会に委ねる）
 *               また、ブランドがindexに実在し、presetIdも実在する場合もkeep
 *   "skip-all" — c. index自体が取得不能 → 降格処理全体をスキップ（インポートは続行） */
type PresetIdCheck = "demote" | "keep" | "skip-all";

/**
 * palette[].presetIdがプリセットマスタ（lib/paintPresets.ts。Citadel/Vallejo/Coat d'armsの
 * 3ブランド。fetch由来のため非同期）に実在するかを判定し、実在しないsource="preset"色は
 * source="custom"・presetId=null（brandはpresetIdから読み取れないため元のbrand文字列を
 * ラベルとして保持）へ降格する。INV-14（source='preset' ⇔ presetId非null）との整合を保つ。
 *
 * 裁定済み降格規則（M5レビューRound1修正2）:
 *   a. ブランドがindexに存在しない（例: 旧AK） → 降格する
 *   b. ブランドはindexに存在するが色一覧のfetchがネットワーク起因で失敗 → 降格しない（preset維持）
 *   c. index自体が取得不能 → 降格処理全体をスキップ（インポートは続行）
 * この判定により、オフライン・一過性エラー時に正規preset色が不可逆的にcustomへ
 * 巻き込まれることを防ぐ（loadBrandColors単体はfetch失敗時も空配列を返すため、
 * その戻り値だけでは「ブランド不明」と「fetch失敗」を区別できない）。
 */
async function demotePresetColors(
  palette: RecipeDoc["palette"],
  deps: NormalizeImportDeps,
): Promise<RecipeDoc["palette"]> {
  const brandCheckCache = new Map<string, Promise<PresetIdCheck>>();
  const brandIdSetCache = new Map<string, Set<string>>();
  let indexUnavailable = false;

  const checkBrand = (brandId: string): Promise<PresetIdCheck> => {
    let pending = brandCheckCache.get(brandId);
    if (!pending) {
      pending = (async (): Promise<PresetIdCheck> => {
        const result = await deps.loadBrandColorsResult(brandId);
        if (result.ok) {
          brandIdSetCache.set(brandId, new Set(result.colors.map((c) => c.id)));
          return "keep";
        }
        if (result.reason === "index-unavailable") {
          indexUnavailable = true;
          return "skip-all";
        }
        if (result.reason === "unknown-brand") {
          return "demote";
        }
        // fetch-failed: ブランドはindexに実在するが色一覧取得がネットワーク起因で失敗
        return "keep";
      })();
      brandCheckCache.set(brandId, pending);
    }
    return pending;
  };

  const result: RecipeDoc["palette"] = [];
  for (const color of palette) {
    if (indexUnavailable) {
      // c. index自体が取得不能と判明した時点で以降の判定もスキップ（降格処理全体をスキップ）
      result.push(color);
      continue;
    }
    if (color.source === "preset" && color.presetId !== null) {
      const brandId = brandIdFromPresetId(color.presetId);
      if (brandId === null) {
        result.push({ ...color, source: "custom", presetId: null });
        continue;
      }
      const check = await checkBrand(brandId);
      if (check === "skip-all") {
        result.push(color);
        continue;
      }
      if (check === "demote") {
        result.push({ ...color, source: "custom", presetId: null });
        continue;
      }
      // check === "keep": ブランドがindexに実在。fetch成功時のみ実際のpresetId実在判定を行い、
      // fetch失敗時（色一覧が取得できていない）はb.の規則により判定を保留してpresetを維持する
      const ids = brandIdSetCache.get(brandId);
      if (ids && !ids.has(color.presetId)) {
        result.push({ ...color, source: "custom", presetId: null });
        continue;
      }
    }
    result.push(color);
  }

  if (indexUnavailable) {
    // index自体が不能と判明した場合、既にresultへ積んだ分も含め元のpaletteをそのまま返す
    // （途中まで判定済みの要素だけ降格状態が混ざるのを避け、c.の「処理全体をスキップ」を厳密に満たす）
    return palette;
  }
  return result;
}

/** Step.technique.presetKeyがマスタ外の場合、`{ presetKey: null, label: <旧キー文字列> }`へ降格する */
function demoteTechniquePresetKey(step: Step): Step {
  const { presetKey } = step.technique;
  if (
    presetKey !== null &&
    !(TECHNIQUE_PRESET_KEYS as readonly string[]).includes(presetKey)
  ) {
    return { ...step, technique: { presetKey: null, label: presetKey } };
  }
  return step;
}

/**
 * インポートしたRecipeExportFileを正規化する（§2.7 正規化規則a〜e）:
 *   a・b: reassignRecipeIdsで全ID新規採番＋参照リマップ
 *   c: dangling photo除去（photos[].idに実体がないphoto参照を文書から除去）
 *   d: マスタ外presetKey降格（technique）＋マスタ外presetId降格（palette）
 *   e: schemaVersion=CURRENT・createdAtは保持・updatedAt=now
 *
 * プリセットマスタ照会（§2.7 d）が非同期（fetch由来）のため、本関数全体を非同期にする。
 */
export async function normalizeImport(
  file: RecipeExportFile,
  deps: NormalizeImportDeps = defaultNormalizeImportDeps,
): Promise<NormalizeImportResult> {
  const { recipe: reassigned, photoIdMap } = reassignRecipeIds(file.recipe);

  // c. dangling photo除去: 実体（file.photos）のないphoto参照を文書から除去する
  const availablePhotoIds = new Set(file.photos.map((p) => p.id));
  const validNewPhotoIds = new Set<string>();
  for (const [oldId, newId] of photoIdMap) {
    if (availablePhotoIds.has(oldId)) {
      validNewPhotoIds.add(newId);
    }
  }

  const stripDanglingPhotoId = (id: string | null): string | null =>
    id !== null && validNewPhotoIds.has(id) ? id : null;

  const stripStepPhoto = (step: Step): Step => ({
    ...step,
    photoId: stripDanglingPhotoId(step.photoId),
  });

  let recipe: RecipeDoc = {
    ...reassigned,
    overviewPhotoIds: reassigned.overviewPhotoIds.filter((id) =>
      validNewPhotoIds.has(id),
    ),
    palette: reassigned.palette.map((color) => ({
      ...color,
      chipPhotoId: stripDanglingPhotoId(color.chipPhotoId),
    })),
    baseSteps: reassigned.baseSteps.map(stripStepPhoto),
    parts: reassigned.parts.map((part) => ({
      ...part,
      steps: part.steps.map(stripStepPhoto),
    })),
  };

  // d. マスタ外presetKey降格（technique）
  recipe = {
    ...recipe,
    baseSteps: recipe.baseSteps.map(demoteTechniquePresetKey),
    parts: recipe.parts.map((part) => ({
      ...part,
      steps: part.steps.map(demoteTechniquePresetKey),
    })),
  };

  // d. マスタ外presetId降格（palette）
  recipe = {
    ...recipe,
    palette: await demotePresetColors(recipe.palette, deps),
  };

  // e. schemaVersion=CURRENT・createdAtは保持・updatedAt=now
  const now = new Date().toISOString();
  recipe = {
    ...recipe,
    schemaVersion: CURRENT_SCHEMA_VERSION,
    updatedAt: now,
  };

  // photosはdangling除去後（実体があり、かつ文書内で実際に参照されている新IDのみ）に絞る
  const photos = file.photos
    .filter((p) => photoIdMap.has(p.id))
    .map((p) => {
      const newId = photoIdMap.get(p.id);
      return newId !== undefined && validNewPhotoIds.has(newId)
        ? { id: newId, dataUrl: p.dataUrl }
        : null;
    })
    .filter((p): p is { id: string; dataUrl: string } => p !== null);

  return { recipe, photos };
}

// ---------------------------------------------------------------------------
// dataUrl → Blob 変換（写真書き込み用）
// ---------------------------------------------------------------------------

/** `data:image/xxx;base64,...`形式のdataUrl文字列をBlobへ変換する */
async function dataUrlToBlob(dataUrl: string): Promise<Blob> {
  const res = await fetch(dataUrl);
  return res.blob();
}

// ---------------------------------------------------------------------------
// importRecipe — 3段検証 → 正規化 → Dexie rwトランザクション書き込み
// ---------------------------------------------------------------------------

/** importRecipeが依存する外部処理をテストから注入できるようにする束 */
export interface ImportRecipeDeps extends NormalizeImportDeps {
  /** dataUrl→Blob変換（省略時はfetch経由の本番実装） */
  dataUrlToBlob: (dataUrl: string) => Promise<Blob>;
}

const defaultImportRecipeDeps: ImportRecipeDeps = {
  loadBrandColorsResult,
  dataUrlToBlob,
};

/**
 * インポートパイプライン本体（§2.7）。JSON文字列を受け取り、3段検証→正規化→
 * Dexie rwトランザクション書き込みまでを行う。
 *
 * 1. JSON.parse（失敗→invalid-json）
 * 2. 第1段: ヘッダ検証（app/kind/schemaVersion。上位バージョンは拒否）
 * 3. 第2段: migrateExportFile（models/migrations.tsの既存チェーン）
 * 4. 第3段: フル検証（recipeExportFileSchema.parse）
 * 5. normalizeImport（正規化規則a〜e）
 * 6. Dexie rwトランザクションで photos.bulkAdd → recipes.add（失敗時ロールバック）
 */
export async function importRecipe(
  jsonText: string,
  deps: ImportRecipeDeps = defaultImportRecipeDeps,
): Promise<ImportResult> {
  // 0. JSON.parse
  let raw: unknown;
  try {
    raw = JSON.parse(jsonText);
  } catch {
    return failure("invalid-json", "JSONファイルとして不正です");
  }

  // 1. 第1段: ヘッダ検証
  const headerResult = importHeaderSchema.safeParse(raw);
  if (!headerResult.success) {
    const issues = issuesFromZodError(headerResult.error);
    const appIssue = issues.find((i) => i.path[0] === "app");
    const kindIssue = issues.find((i) => i.path[0] === "kind");
    if (appIssue) {
      return failure(
        "invalid-header",
        "coat-codexのファイルではありません",
        issues,
      );
    }
    if (kindIssue) {
      return failure(
        "invalid-header",
        "対応していない種類のcoat-codexファイルです",
        issues,
      );
    }
    return failure("invalid-header", "ヘッダの検証に失敗しました", issues);
  }

  const header = headerResult.data;
  if (header.schemaVersion > CURRENT_SCHEMA_VERSION) {
    return failure(
      "unsupported-version",
      "新しいバージョンで作成されたファイルです",
    );
  }

  // 2. 第2段: マイグレーション
  let migrated: unknown;
  try {
    migrated = migrateExportFile(raw, header.schemaVersion);
  } catch (err) {
    return failure(
      "unsupported-version",
      err instanceof Error ? err.message : "マイグレーションに失敗しました",
    );
  }

  // 3. 第3段: フル検証
  const fullResult = recipeExportFileSchema.safeParse(migrated);
  if (!fullResult.success) {
    return failure(
      "invalid-schema",
      "レシピデータの検証に失敗しました",
      issuesFromZodError(fullResult.error),
    );
  }

  // 4. 正規化
  const { recipe, photos } = await normalizeImport(fullResult.data, deps);

  // 4.5 dataUrl→Blob変換はtxの外（前）で完了させる。deps.dataUrlToBlob（本番実装はfetch）は
  // Dexie管理外のPromiseであり、tx内でawaitするとDexieがtxを自動コミット・失効させ、続く
  // db.photos.bulkAddがTransactionInactiveError（"Transaction has already completed or
  // failed"）になる（Dexieはtxコールバック内で発行されたDexie操作のPromiseチェーンのみを
  // 追跡できるため）。ここでの失敗はDB書き込み前に発生するため、部分書き込みは起こらない。
  const records: PhotoRecord[] = [];
  try {
    for (const photo of photos) {
      records.push({
        id: photo.id,
        recipeId: recipe.id,
        blob: await deps.dataUrlToBlob(photo.dataUrl),
        createdAt: new Date().toISOString(),
      });
    }
  } catch (err) {
    return failure(
      "transaction-failed",
      err instanceof Error ? err.message : "インポートの保存に失敗しました",
    );
  }

  // 5. Dexie rwトランザクション書き込み（失敗時ロールバック）。
  // コールバック内は純Dexie操作のみ（Dexie管理外のPromiseをawaitしない）。
  try {
    await db.transaction("rw", db.recipes, db.photos, async () => {
      if (records.length > 0) {
        await db.photos.bulkAdd(records);
      }
      await db.recipes.add(recipe);
    });
  } catch (err) {
    return failure(
      "transaction-failed",
      err instanceof Error ? err.message : "インポートの保存に失敗しました",
    );
  }

  return { ok: true, recipe };
}
