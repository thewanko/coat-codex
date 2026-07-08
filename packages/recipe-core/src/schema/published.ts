// schema/published.ts — PublishedRecipe v1（技術計画v1 §2.1/§2.3）
//
// scriptoriumへ公開するレシピの交換フォーマット。RecipeDocのサブセットで、
// codex専用フィールド（photoId・chipPhotoId・createdAt/updatedAt・
// overviewPhotoIds・photoCrops）を除外する（§2.2 削減規則。memo・Tool.noteは
// §2.2改訂〔ユーザー裁定〕で公開に含める）。
//
// 参照整合の不変条件（INV-2/7/9/11/12/13/14/17相当）はrecipe.tsの
// checkStepInvariants / checkStructuralReferentialIntegrityを流用する
// （§2.1「参照整合の不変条件はrecipe.tsのsuperRefineを流用」）。

import { z } from "zod";
import {
  checkStepInvariants,
  checkStructuralReferentialIntegrity,
} from "./recipe";

export const SCRIPTORIUM_SCHEMA_VERSION = 1;

const idSchema = z.string().min(1);

/** §2.1 palette[] から chipPhotoId を除外したもの（INV-14: source='preset' ⇔ presetId非null は維持） */
export const publishedPaletteColorSchema = z.object({
  id: idSchema,
  source: z.enum(["preset", "custom"]),
  brand: z.string().nullable(),
  name: z.string().min(1),
  presetId: z.string().min(1).nullable(),
  hex: z
    .string()
    .regex(/^#[0-9A-Fa-f]{6}$/)
    .nullable(),
});

/**
 * §2.1 tools[]。noteはoptional（§2.2改訂で公開に含める。旧レコード〔note無し〕との
 * 後方互換のためoptionalとし、必須にはしない）
 */
export const publishedToolSchema = z.object({
  id: idSchema,
  name: z.string().min(1),
  note: z.string().nullable().optional(),
});

const publishedStepPaintSchema = z.object({
  colorId: idSchema,
});

const publishedTechniqueSchema = z.object({
  presetKey: z.string().nullable(),
  label: z.string().nullable(),
});

/**
 * §2.1 Step から photoId を除外したもの（memo は §2.2改訂〔ユーザー裁定〕で公開に含める）。
 * memoはoptional（旧レコード〔memo無し〕との後方互換のためoptionalとし、必須にはしない）。
 * mix整合検査はcheckStepInvariantsで維持する。
 */
export const publishedStepSchema = z
  .object({
    id: idSchema,
    technique: publishedTechniqueSchema,
    paints: z.array(publishedStepPaintSchema).max(5),
    mix: z.array(z.int().min(0).max(100)).nullable(),
    toolIds: z.array(idSchema),
    memo: z.string().optional(),
  })
  .superRefine(checkStepInvariants);

const publishedPartSchema = z.object({
  id: idSchema,
  name: z.string().min(1),
  steps: z.array(publishedStepSchema),
});

/** §2.1 PublishedRecipe（通常検証。参照整合はcheckStructuralReferentialIntegrityを流用） */
export const publishedRecipeSchema = z
  .object({
    scriptoriumSchemaVersion: z.literal(1),
    title: z.string().min(1),
    palette: z.array(publishedPaletteColorSchema),
    tools: z.array(publishedToolSchema),
    baseSteps: z.array(publishedStepSchema),
    parts: z.array(publishedPartSchema),
  })
  .superRefine((doc, ctx) => {
    checkStructuralReferentialIntegrity(doc, ctx);
  });

// ---------------------------------------------------------------------------
// strict検証（§2.3）— サーバーとcodex投稿UIで共有
// ---------------------------------------------------------------------------

const TITLE_MAX = 120;
const NAME_MAX = 80;
const LABEL_MAX = 60;
// §2.3の「handle≤40」はpublishedRecipeSchemaにhandleフィールドが無い（handleは投稿者アカウント
// 相当のフィールドでありレシピ本体には含まれない）ため、ここでは検証しない。
// API payload側（投稿エンドポイントのリクエストボディ全体）で扱う想定＝S3スコープ。
const PARTS_MAX = 50;
const STEPS_TOTAL_MAX = 200;
const PALETTE_MAX = 100;
const SERIALIZED_BYTES_MAX = 64 * 1024;
// §2.2改訂: memo・Tool.noteは公開に含めるため、他の自由テキストと同様にstrict検証の対象にする
const MEMO_MAX = 2000;

const FORBIDDEN_TEXT_PATTERNS: { pattern: RegExp; label: string }[] = [
  { pattern: /https?:\/\//i, label: "URL" },
  { pattern: /</, label: "山括弧" },
  { pattern: /javascript:/i, label: "javascript:スキーム" },
];

/** 自由テキストにURL・`<`・`javascript:`が含まれないかを検査し、該当があればissueを追加する */
function checkForbiddenText(
  value: string,
  path: (string | number)[],
  ctx: z.RefinementCtx,
): void {
  for (const { pattern, label } of FORBIDDEN_TEXT_PATTERNS) {
    if (pattern.test(value)) {
      ctx.addIssue({
        code: "custom",
        message: `[STRICT-TEXT] ${label}を含むテキストは許可されません`,
        path,
      });
    }
  }
}

function checkMaxLength(
  value: string,
  max: number,
  label: string,
  path: (string | number)[],
  ctx: z.RefinementCtx,
): void {
  if (value.length > max) {
    ctx.addIssue({
      code: "custom",
      message: `[STRICT-LEN] ${label}は${max}文字以下である必要があります`,
      path,
    });
  }
}

/**
 * publishedRecipeStrictSchema（§2.3）— strict検証。
 * 文字数上限・構造上限・自由テキストの禁止パターン・シリアライズ後64KB上限を検査する。
 * サーバー（Workers）とcodex投稿UIの双方がこの同一スキーマをimportして使う想定。
 */
export const publishedRecipeStrictSchema = publishedRecipeSchema.superRefine(
  (doc, ctx) => {
    checkMaxLength(doc.title, TITLE_MAX, "title", ["title"], ctx);
    checkForbiddenText(doc.title, ["title"], ctx);

    doc.palette.forEach((color, i) => {
      checkMaxLength(
        color.name,
        NAME_MAX,
        "palette[].name",
        ["palette", i, "name"],
        ctx,
      );
      checkForbiddenText(color.name, ["palette", i, "name"], ctx);
      if (color.brand !== null) {
        checkMaxLength(
          color.brand,
          NAME_MAX,
          "palette[].brand",
          ["palette", i, "brand"],
          ctx,
        );
        checkForbiddenText(color.brand, ["palette", i, "brand"], ctx);
      }
    });

    doc.tools.forEach((tool, i) => {
      checkMaxLength(
        tool.name,
        NAME_MAX,
        "tools[].name",
        ["tools", i, "name"],
        ctx,
      );
      checkForbiddenText(tool.name, ["tools", i, "name"], ctx);
      if (tool.note != null) {
        checkMaxLength(
          tool.note,
          MEMO_MAX,
          "tools[].note",
          ["tools", i, "note"],
          ctx,
        );
        checkForbiddenText(tool.note, ["tools", i, "note"], ctx);
      }
    });

    doc.parts.forEach((part, pi) => {
      checkMaxLength(
        part.name,
        NAME_MAX,
        "parts[].name",
        ["parts", pi, "name"],
        ctx,
      );
      checkForbiddenText(part.name, ["parts", pi, "name"], ctx);
    });

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
      if (step.technique.label !== null) {
        checkMaxLength(
          step.technique.label,
          LABEL_MAX,
          "technique.label",
          [...path, "technique", "label"],
          ctx,
        );
        checkForbiddenText(
          step.technique.label,
          [...path, "technique", "label"],
          ctx,
        );
      }
      // マスタ外presetKeyはresolveTechniqueLabel分岐③でそのまま表示文字列として使われるため、
      // labelと同様に文字数上限・禁止パターン検査を適用する（レビューR1指摘: presetKeyの素通し）。
      // マスタ所属presetKey（basecoat等）は禁止文字を含まないため受理側に影響しない。
      if (step.technique.presetKey !== null) {
        checkMaxLength(
          step.technique.presetKey,
          LABEL_MAX,
          "technique.presetKey",
          [...path, "technique", "presetKey"],
          ctx,
        );
        checkForbiddenText(
          step.technique.presetKey,
          [...path, "technique", "presetKey"],
          ctx,
        );
      }
      if (step.memo) {
        checkMaxLength(
          step.memo,
          MEMO_MAX,
          "step.memo",
          [...path, "memo"],
          ctx,
        );
        checkForbiddenText(step.memo, [...path, "memo"], ctx);
      }
    }

    // 構造上限: parts ≤50・steps合計（baseSteps＋全parts）≤200・palette ≤100
    if (doc.parts.length > PARTS_MAX) {
      ctx.addIssue({
        code: "custom",
        message: `[STRICT-STRUCT] parts は${PARTS_MAX}件以下である必要があります`,
        path: ["parts"],
      });
    }
    const totalSteps =
      doc.baseSteps.length +
      doc.parts.reduce((sum, p) => sum + p.steps.length, 0);
    if (totalSteps > STEPS_TOTAL_MAX) {
      ctx.addIssue({
        code: "custom",
        message: `[STRICT-STRUCT] steps合計は${STEPS_TOTAL_MAX}件以下である必要があります`,
        path: ["baseSteps"],
      });
    }
    if (doc.palette.length > PALETTE_MAX) {
      ctx.addIssue({
        code: "custom",
        message: `[STRICT-STRUCT] palette は${PALETTE_MAX}件以下である必要があります`,
        path: ["palette"],
      });
    }

    // シリアライズ後64KB上限（D1の1MB/行制限への多重防御。payloadのJSON部にのみ効く）
    const serializedBytes = new TextEncoder().encode(
      JSON.stringify(doc),
    ).length;
    if (serializedBytes > SERIALIZED_BYTES_MAX) {
      ctx.addIssue({
        code: "custom",
        message: `[STRICT-STRUCT] シリアライズ後のサイズは${SERIALIZED_BYTES_MAX}バイト以下である必要があります`,
        path: [],
      });
    }
  },
);

export type PublishedPaletteColor = z.infer<typeof publishedPaletteColorSchema>;
export type PublishedTool = z.infer<typeof publishedToolSchema>;
export type PublishedStep = z.infer<typeof publishedStepSchema>;
export type PublishedRecipe = z.infer<typeof publishedRecipeSchema>;
