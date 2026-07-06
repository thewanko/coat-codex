// models/recipe.ts — RecipeDoc/RecipeExportFileの型＋zodスキーマ（技術計画v2.2 §2.1/§2.2/§2.5）
//
// 不変条件1〜20（§2.5。5・6はv2.2で欠番）をzodで強制する。単一フィールドで表せない条件は
// superRefineで実装し、エラーメッセージに `[INV-nn]` を含める（テスト・デバッグでの突き合わせ用）。
//
// lib/mixRatio.ts からの import はしない（循環回避。構造的互換で足りる — 技術計画v2.2 §4.2 T9）。

import { z } from "zod";

/** 文書内で参照されるID文字列。`part_`等のプレフィックスは生成規約（§3.1）でありzodでは強制しない */
const idSchema = z.string().min(1);

/** ISO 8601日時（作成/更新/エクスポート時刻） */
const isoDateTimeSchema = z.iso.datetime();

/** 色見本HEX。`^#[0-9A-Fa-f]{6}$` またはnull（§2.1 palette[].hex, §2.5-14） */
const hexColorSchema = z
  .string()
  .regex(/^#[0-9A-Fa-f]{6}$/)
  .nullable();

/** §2.1 palette[] — 使用カラー一覧の1要素 */
export const paletteColorSchema = z.object({
  id: idSchema,
  source: z.enum(["preset", "custom"]),
  brand: z.string().nullable(),
  name: z.string().min(1),
  presetId: z.string().min(1).nullable(),
  hex: hexColorSchema,
  chipPhotoId: idSchema.nullable(),
});

/** §2.1 tools[] — 使用ツール一覧の1要素 */
export const toolSchema = z.object({
  id: idSchema,
  name: z.string().min(1),
  note: z.string().nullable(),
});

/** §2.1 Step.paints[] — 使用塗料（%はmix側にスロット順で保持。§2.3） */
const stepPaintSchema = z.object({
  colorId: idSchema,
});

/** §2.1 Step.technique */
const techniqueSchema = z.object({
  presetKey: z.string().nullable(),
  label: z.string().nullable(),
});

/** §2.1 Step — baseSteps / parts[].steps 共通形。配列順=工程順（orderフィールドなし） */
export const stepSchema = z
  .object({
    id: idSchema,
    technique: techniqueSchema,
    photoId: idSchema.nullable(),
    paints: z.array(stepPaintSchema).max(5),
    mix: z.array(z.int().min(0).max(100)).nullable(),
    toolIds: z.array(idSchema),
    memo: z.string(),
  })
  .superRefine((step, ctx) => {
    // INV-1: paints.length <= 5 — z.array().max(5)で担保済み（フィールド制約）

    // INV-2: paints.length >= 2 => mix !== null かつ mix.length === paints.length
    if (step.paints.length >= 2) {
      if (step.mix === null) {
        ctx.addIssue({
          code: "custom",
          message: "[INV-2] paints.length ≥ 2 のとき mix は null にできません",
          path: ["mix"],
        });
      } else if (step.mix.length !== step.paints.length) {
        ctx.addIssue({
          code: "custom",
          message:
            "[INV-2] mix.length は paints.length と一致する必要があります",
          path: ["mix"],
        });
      }
    }

    // INV-3: mix !== null => 各要素は整数かつ0〜100 — z.array(z.int().min(0).max(100))で担保済み（フィールド制約）

    // INV-4: paints.length <= 1 => mix = null（2と4の対で双方向を構成）
    if (step.paints.length <= 1 && step.mix !== null) {
      ctx.addIssue({
        code: "custom",
        message:
          "[INV-4] paints.length ≤ 1 のとき mix は null である必要があります",
        path: ["mix"],
      });
    }

    // INV-5, INV-6: 欠番（v2.2でmix再設計により統合。§2.5参照）

    // INV-7: paints内のcolorIdに重複なし
    const colorIds = step.paints.map((p) => p.colorId);
    if (new Set(colorIds).size !== colorIds.length) {
      ctx.addIssue({
        code: "custom",
        message: "[INV-7] paints[].colorId に重複があります",
        path: ["paints"],
      });
    }

    // INV-8: technique.presetKeyとtechnique.labelが同時に非nullでない
    if (step.technique.presetKey !== null && step.technique.label !== null) {
      ctx.addIssue({
        code: "custom",
        message:
          "[INV-8] technique.presetKey と technique.label を同時に指定できません",
        path: ["technique"],
      });
    }

    // INV-9: toolIds内に重複なし
    if (new Set(step.toolIds).size !== step.toolIds.length) {
      ctx.addIssue({
        code: "custom",
        message: "[INV-9] toolIds に重複があります",
        path: ["toolIds"],
      });
    }

    // INV-10: mix合計100は検証しない（意図的に未実装。§2.3/§2.5-10）
  });

/** §2.1 parts[] — パーツ（配列順=表示順） */
const partSchema = z.object({
  id: idSchema,
  name: z.string().min(1),
  steps: z.array(stepSchema),
});

/**
 * §2.1/§3.4 photoCrops[photoId] — 元画像に対する正規化クロップ矩形（非破壊クロップ。
 * 元画像は保持し、表示・共有カード生成時にこの矩形で切り出す）。
 * 制約: 0<=x<=1・0<=y<=1・0<w<=1・0<h<=1・x+w<=1・y+h<=1（矩形が元画像内に収まること）。
 * 和の判定はEPSILON許容付き — クロップUIの任意ドラッグ座標（除算由来の循環小数）では
 * x+w が浮動小数点加算誤差で1をごく僅かに超え得るため、真の超過のみを拒否する。
 */
const CROP_SUM_EPSILON = 1e-9;

export const cropRectSchema = z
  .object({
    x: z.number().finite().min(0).max(1),
    y: z.number().finite().min(0).max(1),
    w: z.number().finite().gt(0).max(1),
    h: z.number().finite().gt(0).max(1),
  })
  .refine((rect) => rect.x + rect.w <= 1 + CROP_SUM_EPSILON, {
    message: "x + w は1以下である必要があります",
    path: ["w"],
  })
  .refine((rect) => rect.y + rect.h <= 1 + CROP_SUM_EPSILON, {
    message: "y + h は1以下である必要があります",
    path: ["h"],
  });

/**
 * §2.5 source — scriptoriumからインポートされたレシピの出典情報。
 * codex内で新規作成されたレシピ・scriptorium連携前にv2以前で作成されたレシピはnull
 * （v2→v3マイグレーションで補完。migrations.ts docRegistry[2]参照）。
 */
export const recipeSourceSchema = z.object({
  scriptoriumId: z.string().min(1),
  author: z.string(),
  importedAt: isoDateTimeSchema,
});

/** §2.1 RecipeDoc（IndexedDB内スキーマ） */
export const recipeDocSchema = z
  .object({
    schemaVersion: z.number().int(),
    id: idSchema,
    title: z.string().min(1),
    createdAt: isoDateTimeSchema,
    updatedAt: isoDateTimeSchema,
    overviewPhotoIds: z.array(idSchema),
    palette: z.array(paletteColorSchema),
    tools: z.array(toolSchema),
    baseSteps: z.array(stepSchema),
    parts: z.array(partSchema),
    // dangling（文書内で未参照 or 実体のないphotoId）なキーはINVを追加せず無害として扱う
    // （INV-16「写真参照の実体存在は検証しない」と同方針。exportやreassignで整合処理する）
    photoCrops: z.record(idSchema, cropRectSchema),
    // §2.5 v3: scriptoriumからのインポート出典（必須・nullable。§2.7 v2→v3マイグレーションでnull補完）
    source: recipeSourceSchema.nullable(),
  })
  .superRefine((doc, ctx) => {
    // INV-11: palette[].id / tools[].id / parts[].id / 全Step id（baseSteps・parts横断）は各々文書内一意
    const checkUnique = (
      values: string[],
      label: string,
      path: (string | number)[],
    ) => {
      if (new Set(values).size !== values.length) {
        ctx.addIssue({
          code: "custom",
          message: `[INV-11] ${label} が文書内で重複しています`,
          path,
        });
      }
    };
    checkUnique(
      doc.palette.map((c) => c.id),
      "palette[].id",
      ["palette"],
    );
    checkUnique(
      doc.tools.map((t) => t.id),
      "tools[].id",
      ["tools"],
    );
    checkUnique(
      doc.parts.map((p) => p.id),
      "parts[].id",
      ["parts"],
    );
    const allStepIds = [
      ...doc.baseSteps.map((s) => s.id),
      ...doc.parts.flatMap((p) => p.steps.map((s) => s.id)),
    ];
    checkUnique(allStepIds, "Step id（baseSteps・parts横断）", ["baseSteps"]);

    // INV-17: parts[].id に予約語 "base" は使用できない（/recipe/:id/part/base がベース工程編集に予約）
    doc.parts.forEach((part, index) => {
      if (part.id === "base") {
        ctx.addIssue({
          code: "custom",
          message: '[INV-17] parts[].id に "base" は使用できません',
          path: ["parts", index, "id"],
        });
      }
    });

    // INV-12/13向けの参照集合
    const colorIds = new Set(doc.palette.map((c) => c.id));
    const toolIds = new Set(doc.tools.map((t) => t.id));

    const allSteps: {
      step: (typeof doc.baseSteps)[number];
      path: (string | number)[];
    }[] = [
      ...doc.baseSteps.map((step, i) => ({
        step,
        path: ["baseSteps", i] as (string | number)[],
      })),
      ...doc.parts.flatMap((part, pi) =>
        part.steps.map((step, si) => ({
          step,
          path: ["parts", pi, "steps", si] as (string | number)[],
        })),
      ),
    ];

    for (const { step, path } of allSteps) {
      // INV-12: 全StepPaintのcolorId ∈ palette[].id
      step.paints.forEach((paint, pi) => {
        if (!colorIds.has(paint.colorId)) {
          ctx.addIssue({
            code: "custom",
            message: `[INV-12] paints[].colorId "${paint.colorId}" は palette[].id に存在しません`,
            path: [...path, "paints", pi, "colorId"],
          });
        }
      });

      // INV-13: 全StepのtoolIds ⊆ tools[].id
      step.toolIds.forEach((toolId, ti) => {
        if (!toolIds.has(toolId)) {
          ctx.addIssue({
            code: "custom",
            message: `[INV-13] toolIds[] "${toolId}" は tools[].id に存在しません`,
            path: [...path, "toolIds", ti],
          });
        }
      });
    }

    // INV-14: palette[]: source='preset' ⇔ presetId非null（hexの形式はhexColorSchemaで担保済み）
    doc.palette.forEach((color, index) => {
      const isPreset = color.source === "preset";
      const hasPresetId = color.presetId !== null;
      if (isPreset !== hasPresetId) {
        ctx.addIssue({
          code: "custom",
          message:
            '[INV-14] palette[].source="preset" のとき、かつそのときに限り presetId は非nullである必要があります',
          path: ["palette", index, "presetId"],
        });
      }
    });

    // INV-15: title・palette[].name・tools[].name・parts[].name は空文字不可（z.string().min(1)で担保済み）、
    //         日時はISO 8601（z.iso.datetime()で担保済み） — フィールド制約

    // INV-16: 写真参照（overviewPhotoIds/steps[].photoId/chipPhotoId）の実体存在は検証しない（意図的に未実装。§2.5-16）
  });

/** §2.2 RecipeExportFile.photos[] */
export const exportPhotoSchema = z.object({
  id: idSchema,
  dataUrl: z.string().regex(/^data:image\/(png|jpeg|webp);base64,/),
});

/** §2.2 RecipeExportFile（エクスポートファイル形式） */
export const recipeExportFileSchema = z
  .object({
    app: z.literal("coat-codex"),
    kind: z.literal("recipe-export"),
    schemaVersion: z.number().int(),
    exportedAt: isoDateTimeSchema,
    recipe: recipeDocSchema,
    photos: z.array(exportPhotoSchema),
  })
  .superRefine((file, ctx) => {
    // INV-18: app='coat-codex' ・ kind='recipe-export' のリテラル一致 — z.literal()で担保済み（フィールド制約）

    // INV-19: schemaVersion === recipe.schemaVersion
    if (file.schemaVersion !== file.recipe.schemaVersion) {
      ctx.addIssue({
        code: "custom",
        message:
          "[INV-19] schemaVersion は recipe.schemaVersion と一致する必要があります",
        path: ["schemaVersion"],
      });
    }

    // INV-20: photos[].id に重複なし、dataUrlの形式はexportPhotoSchemaで担保済み（フィールド制約）
    const photoIds = file.photos.map((p) => p.id);
    if (new Set(photoIds).size !== photoIds.length) {
      ctx.addIssue({
        code: "custom",
        message: "[INV-20] photos[].id に重複があります",
        path: ["photos"],
      });
    }
  });

export type PaletteColor = z.infer<typeof paletteColorSchema>;
export type Tool = z.infer<typeof toolSchema>;
export type StepPaint = z.infer<typeof stepPaintSchema>;
export type Step = z.infer<typeof stepSchema>;
export type CropRect = z.infer<typeof cropRectSchema>;
export type RecipeSource = z.infer<typeof recipeSourceSchema>;
export type RecipeDoc = z.infer<typeof recipeDocSchema>;
export type ExportPhoto = z.infer<typeof exportPhotoSchema>;
export type RecipeExportFile = z.infer<typeof recipeExportFileSchema>;
