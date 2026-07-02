// models/recipe.test.ts — 不変条件1〜20（5・6欠番）の受理/拒否ペア＋正常系フィクスチャ
// （技術計画v2.2 §2.1/§2.2/§2.5）

import { describe, expect, test } from "vitest";
import {
  recipeDocSchema,
  recipeExportFileSchema,
  stepSchema,
  type RecipeDoc,
  type RecipeExportFile,
  type Step,
} from "./recipe";

// --- §2.1のJSONC例に相当する完全なRecipeDocフィクスチャ ---
function makeValidRecipeDoc(): RecipeDoc {
  return {
    schemaVersion: 1,
    id: "rcp_1",
    title: "Space Marine Captain",
    createdAt: "2026-07-02T10:00:00.000Z",
    updatedAt: "2026-07-02T12:34:56.000Z",
    overviewPhotoIds: ["ph_1"],
    palette: [
      {
        id: "col_1",
        source: "preset",
        brand: "Citadel",
        name: "Mephiston Red",
        presetId: "citadel:mephiston-red",
        hex: "#960F0F",
        chipPhotoId: null,
      },
      {
        id: "col_2",
        source: "custom",
        brand: null,
        name: "自家調色ブラック",
        presetId: null,
        hex: null,
        chipPhotoId: null,
      },
    ],
    tools: [{ id: "tool_1", name: "エアブラシ", note: "0.3mm" }],
    baseSteps: [
      {
        id: "stp_base_1",
        technique: { presetKey: "prime", label: null },
        photoId: null,
        paints: [],
        mix: null,
        toolIds: ["tool_1"],
        memo: "",
      },
    ],
    parts: [
      {
        id: "part_1",
        name: "兜",
        steps: [
          {
            id: "stp_1",
            technique: { presetKey: "basecoat", label: null },
            photoId: "ph_2",
            paints: [{ colorId: "col_1" }, { colorId: "col_2" }],
            mix: [60, 40],
            toolIds: ["tool_1"],
            memo: "",
          },
        ],
      },
    ],
  };
}

function makeValidStep(overrides: Partial<Step> = {}): Step {
  return {
    id: "stp_x",
    technique: { presetKey: "wash", label: null },
    photoId: null,
    paints: [],
    mix: null,
    toolIds: [],
    memo: "",
    ...overrides,
  };
}

function makeValidExportFile(): RecipeExportFile {
  return {
    app: "coat-codex",
    kind: "recipe-export",
    schemaVersion: 1,
    exportedAt: "2026-07-02T13:00:00.000Z",
    recipe: makeValidRecipeDoc(),
    photos: [
      {
        id: "ph_2",
        dataUrl: "data:image/jpeg;base64,AAAA",
      },
    ],
  };
}

function expectIssueCode(
  result: { success: boolean; error?: unknown },
  code: string,
) {
  expect(result.success).toBe(false);
  if (result.success) return;
  const error = result.error as { issues: { message: string }[] };
  expect(error.issues.some((issue) => issue.message.includes(code))).toBe(true);
}

describe("正常系フィクスチャ", () => {
  test("§2.1相当の完全なRecipeDocを受理する", () => {
    expect(recipeDocSchema.safeParse(makeValidRecipeDoc()).success).toBe(true);
  });

  test("§2.2相当の完全なRecipeExportFileを受理する", () => {
    expect(
      recipeExportFileSchema.safeParse(makeValidExportFile()).success,
    ).toBe(true);
  });
});

describe("INV-1: paints.length ≤ 5", () => {
  test("受理: 5件", () => {
    const doc = makeValidRecipeDoc();
    // colorId重複はINV-7対象のため、ここではpaletteを5色に拡張して重複なしにする
    doc.palette = Array.from({ length: 5 }, (_, i) => ({
      id: `col_${i}`,
      source: "custom" as const,
      brand: null,
      name: `Color ${i}`,
      presetId: null,
      hex: null,
      chipPhotoId: null,
    }));
    doc.parts[0].steps[0].paints = doc.palette.map((c) => ({ colorId: c.id }));
    doc.parts[0].steps[0].mix = [20, 20, 20, 20, 20];
    expect(recipeDocSchema.safeParse(doc).success).toBe(true);
  });

  test("拒否: 6件", () => {
    const step = {
      id: "stp_x",
      technique: { presetKey: null, label: null },
      photoId: null,
      paints: Array.from({ length: 6 }, (_, i) => ({ colorId: `col_${i}` })),
      mix: Array.from({ length: 6 }, () => 16),
      toolIds: [],
      memo: "",
    };
    expect(stepSchema.safeParse(step).success).toBe(false);
  });
});

describe("INV-2: paints.length ≥ 2 ⇒ mix ≠ null ∧ mix.length === paints.length", () => {
  test("受理: 2色でmix長2", () => {
    const step = makeValidStep({
      paints: [{ colorId: "col_1" }, { colorId: "col_2" }],
      mix: [60, 40],
    });
    expect(stepSchema.safeParse(step).success).toBe(true);
  });

  test("拒否: 2色でmix=null", () => {
    const step = makeValidStep({
      paints: [{ colorId: "col_1" }, { colorId: "col_2" }],
      mix: null,
    });
    expectIssueCode(stepSchema.safeParse(step), "[INV-2]");
  });

  test("拒否: 2色でmix長不一致", () => {
    const step = makeValidStep({
      paints: [{ colorId: "col_1" }, { colorId: "col_2" }],
      mix: [60, 30, 10],
    });
    expectIssueCode(stepSchema.safeParse(step), "[INV-2]");
  });
});

describe("INV-3: mix ≠ null ⇒ 各要素は整数0〜100", () => {
  test("受理: [60, 40]", () => {
    const step = makeValidStep({
      paints: [{ colorId: "col_1" }, { colorId: "col_2" }],
      mix: [60, 40],
    });
    expect(stepSchema.safeParse(step).success).toBe(true);
  });

  test("拒否: 小数を含む", () => {
    const step = makeValidStep({
      paints: [{ colorId: "col_1" }, { colorId: "col_2" }],
      mix: [60.5, 39.5],
    });
    expect(stepSchema.safeParse(step).success).toBe(false);
  });

  test("拒否: 範囲外（101）", () => {
    const step = makeValidStep({
      paints: [{ colorId: "col_1" }, { colorId: "col_2" }],
      mix: [101, -1],
    });
    expect(stepSchema.safeParse(step).success).toBe(false);
  });
});

describe("INV-4: paints.length ≤ 1 ⇒ mix = null", () => {
  test("受理: 単色でmix=null", () => {
    const step = makeValidStep({ paints: [{ colorId: "col_1" }], mix: null });
    expect(stepSchema.safeParse(step).success).toBe(true);
  });

  test("拒否: 単色でmix非null", () => {
    const step = makeValidStep({
      paints: [{ colorId: "col_1" }],
      mix: [100],
    });
    expectIssueCode(stepSchema.safeParse(step), "[INV-4]");
  });

  test("拒否: 塗料0件でmix非null", () => {
    const step = makeValidStep({ paints: [], mix: [100] });
    expectIssueCode(stepSchema.safeParse(step), "[INV-4]");
  });
});

describe("INV-7: paints内のcolorIdに重複なし", () => {
  test("受理: 重複なし", () => {
    const step = makeValidStep({
      paints: [{ colorId: "col_1" }, { colorId: "col_2" }],
      mix: [50, 50],
    });
    expect(stepSchema.safeParse(step).success).toBe(true);
  });

  test("拒否: 同一colorIdが2枠", () => {
    const step = makeValidStep({
      paints: [{ colorId: "col_1" }, { colorId: "col_1" }],
      mix: [50, 50],
    });
    expectIssueCode(stepSchema.safeParse(step), "[INV-7]");
  });
});

describe("INV-8: technique.presetKeyとtechnique.labelが同時に非nullでない", () => {
  test("受理: presetKeyのみ", () => {
    const step = makeValidStep({
      technique: { presetKey: "basecoat", label: null },
    });
    expect(stepSchema.safeParse(step).success).toBe(true);
  });

  test("受理: 両方null", () => {
    const step = makeValidStep({ technique: { presetKey: null, label: null } });
    expect(stepSchema.safeParse(step).success).toBe(true);
  });

  test("拒否: 両方非null", () => {
    const step = makeValidStep({
      technique: { presetKey: "basecoat", label: "自由入力" },
    });
    expectIssueCode(stepSchema.safeParse(step), "[INV-8]");
  });
});

describe("INV-9: toolIds内に重複なし", () => {
  test("受理: 重複なし", () => {
    const step = makeValidStep({ toolIds: ["tool_1", "tool_2"] });
    expect(stepSchema.safeParse(step).success).toBe(true);
  });

  test("拒否: 同一toolIdが2件", () => {
    const step = makeValidStep({ toolIds: ["tool_1", "tool_1"] });
    expectIssueCode(stepSchema.safeParse(step), "[INV-9]");
  });
});

describe("INV-10: mix合計100は検証しない", () => {
  test("受理: 合計110でもStep単体としては受理される", () => {
    const step = makeValidStep({
      paints: [{ colorId: "col_1" }, { colorId: "col_2" }],
      mix: [60, 50],
    });
    expect(stepSchema.safeParse(step).success).toBe(true);
  });
});

describe("INV-11: palette[].id / tools[].id / parts[].id / 全Step idは文書内一意", () => {
  test("受理: すべて一意", () => {
    expect(recipeDocSchema.safeParse(makeValidRecipeDoc()).success).toBe(true);
  });

  test("拒否: palette[].idが重複", () => {
    const doc = makeValidRecipeDoc();
    doc.palette[1].id = doc.palette[0].id;
    expectIssueCode(recipeDocSchema.safeParse(doc), "[INV-11]");
  });

  test("拒否: parts[].idが重複", () => {
    const doc = makeValidRecipeDoc();
    doc.parts.push({ ...doc.parts[0] });
    expectIssueCode(recipeDocSchema.safeParse(doc), "[INV-11]");
  });

  test("拒否: baseStepsとparts横断でStep idが重複", () => {
    const doc = makeValidRecipeDoc();
    doc.parts[0].steps[0].id = doc.baseSteps[0].id;
    expectIssueCode(recipeDocSchema.safeParse(doc), "[INV-11]");
  });
});

describe("INV-12: 全StepPaintのcolorId ∈ palette[].id", () => {
  test("受理: palette内のcolorIdのみ参照", () => {
    expect(recipeDocSchema.safeParse(makeValidRecipeDoc()).success).toBe(true);
  });

  test("拒否: paletteに存在しないcolorIdを参照", () => {
    const doc = makeValidRecipeDoc();
    doc.parts[0].steps[0].paints = [
      { colorId: "col_missing" },
      { colorId: "col_2" },
    ];
    expectIssueCode(recipeDocSchema.safeParse(doc), "[INV-12]");
  });
});

describe("INV-13: 全StepのtoolIds ⊆ tools[].id", () => {
  test("受理: tools内のtoolIdのみ参照", () => {
    expect(recipeDocSchema.safeParse(makeValidRecipeDoc()).success).toBe(true);
  });

  test("拒否: toolsに存在しないtoolIdを参照", () => {
    const doc = makeValidRecipeDoc();
    doc.baseSteps[0].toolIds = ["tool_missing"];
    expectIssueCode(recipeDocSchema.safeParse(doc), "[INV-13]");
  });
});

describe('INV-14: palette[]: source="preset" ⇔ presetId非null、hexは形式一致またはnull', () => {
  test("受理: source=preset かつ presetId非null", () => {
    expect(recipeDocSchema.safeParse(makeValidRecipeDoc()).success).toBe(true);
  });

  test("拒否: source=preset だが presetId=null", () => {
    const doc = makeValidRecipeDoc();
    doc.palette[0].presetId = null;
    expectIssueCode(recipeDocSchema.safeParse(doc), "[INV-14]");
  });

  test("拒否: source=custom だが presetId非null", () => {
    const doc = makeValidRecipeDoc();
    doc.palette[1].presetId = "citadel:something";
    expectIssueCode(recipeDocSchema.safeParse(doc), "[INV-14]");
  });

  test("拒否: hexが不正形式", () => {
    const doc = makeValidRecipeDoc();
    doc.palette[0].hex = "red";
    expect(recipeDocSchema.safeParse(doc).success).toBe(false);
  });
});

describe("INV-15: title・palette[].name・tools[].name・parts[].nameは空文字不可、日時はISO 8601", () => {
  test("受理: すべて非空・ISO日時", () => {
    expect(recipeDocSchema.safeParse(makeValidRecipeDoc()).success).toBe(true);
  });

  test("拒否: titleが空文字", () => {
    const doc = makeValidRecipeDoc();
    doc.title = "";
    expect(recipeDocSchema.safeParse(doc).success).toBe(false);
  });

  test("拒否: parts[].nameが空文字", () => {
    const doc = makeValidRecipeDoc();
    doc.parts[0].name = "";
    expect(recipeDocSchema.safeParse(doc).success).toBe(false);
  });

  test("拒否: createdAtがISO 8601でない", () => {
    const doc = makeValidRecipeDoc();
    doc.createdAt = "2026/07/02 10:00:00";
    expect(recipeDocSchema.safeParse(doc).success).toBe(false);
  });
});

describe("INV-16: 写真参照の実体存在は検証しない", () => {
  test("受理: 実体のないphotoId参照でもRecipeDoc単体としては受理される", () => {
    const doc = makeValidRecipeDoc();
    doc.overviewPhotoIds = ["ph_nonexistent"];
    doc.parts[0].steps[0].photoId = "ph_also_nonexistent";
    expect(recipeDocSchema.safeParse(doc).success).toBe(true);
  });
});

describe('INV-17: parts[].id ≠ "base"', () => {
  test("受理: part_1のような通常ID", () => {
    expect(recipeDocSchema.safeParse(makeValidRecipeDoc()).success).toBe(true);
  });

  test('拒否: parts[].idが"base"', () => {
    const doc = makeValidRecipeDoc();
    doc.parts[0].id = "base";
    expectIssueCode(recipeDocSchema.safeParse(doc), "[INV-17]");
  });
});

describe("INV-18: app='coat-codex'・kind='recipe-export'のリテラル一致", () => {
  test("受理: 正しいリテラル", () => {
    expect(
      recipeExportFileSchema.safeParse(makeValidExportFile()).success,
    ).toBe(true);
  });

  test("拒否: appが不一致", () => {
    const file = makeValidExportFile() as unknown as Record<string, unknown>;
    file.app = "other-app";
    expect(recipeExportFileSchema.safeParse(file).success).toBe(false);
  });

  test("拒否: kindが不一致", () => {
    const file = makeValidExportFile() as unknown as Record<string, unknown>;
    file.kind = "other-kind";
    expect(recipeExportFileSchema.safeParse(file).success).toBe(false);
  });
});

describe("INV-19: schemaVersion === recipe.schemaVersion", () => {
  test("受理: 一致", () => {
    expect(
      recipeExportFileSchema.safeParse(makeValidExportFile()).success,
    ).toBe(true);
  });

  test("拒否: 不一致", () => {
    const file = makeValidExportFile();
    file.schemaVersion = 2;
    expectIssueCode(recipeExportFileSchema.safeParse(file), "[INV-19]");
  });
});

describe("INV-20: photos[].idに重複なし、dataUrlは3形式のいずれか", () => {
  test("受理: 重複なし・png/jpeg/webp", () => {
    expect(
      recipeExportFileSchema.safeParse(makeValidExportFile()).success,
    ).toBe(true);
  });

  test("拒否: photos[].idが重複", () => {
    const file = makeValidExportFile();
    file.photos = [file.photos[0], { ...file.photos[0] }];
    expectIssueCode(recipeExportFileSchema.safeParse(file), "[INV-20]");
  });

  test("拒否: dataUrlが対応外mime（gif）", () => {
    const file = makeValidExportFile();
    file.photos = [{ id: "ph_2", dataUrl: "data:image/gif;base64,AAAA" }];
    expect(recipeExportFileSchema.safeParse(file).success).toBe(false);
  });

  test("拒否: dataUrlがbase64ヘッダ形式でない", () => {
    const file = makeValidExportFile();
    file.photos = [{ id: "ph_2", dataUrl: "not-a-data-url" }];
    expect(recipeExportFileSchema.safeParse(file).success).toBe(false);
  });
});
