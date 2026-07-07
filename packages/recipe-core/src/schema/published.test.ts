// schema/published.test.ts — PublishedRecipe v1（通常＋strict）の受理/拒否ペア（技術計画v1 §2.1/§2.3/ST-08）

import { describe, expect, test } from "vitest";
import {
  publishedPaletteColorSchema,
  publishedRecipeSchema,
  publishedRecipeStrictSchema,
  publishedStepSchema,
  publishedToolSchema,
  SCRIPTORIUM_SCHEMA_VERSION,
  type PublishedRecipe,
} from "./published";

function makeValidPublishedRecipe(): PublishedRecipe {
  return {
    scriptoriumSchemaVersion: 1,
    title: "Space Marine Captain",
    palette: [
      {
        id: "col_1",
        source: "preset",
        brand: "Citadel",
        name: "Mephiston Red",
        presetId: "citadel:mephiston-red",
        hex: "#960F0F",
      },
      {
        id: "col_2",
        source: "custom",
        brand: null,
        name: "自家調色ブラック",
        presetId: null,
        hex: null,
      },
    ],
    tools: [{ id: "tool_1", name: "エアブラシ" }],
    baseSteps: [
      {
        id: "stp_base_1",
        technique: { presetKey: "prime", label: null },
        paints: [],
        mix: null,
        toolIds: ["tool_1"],
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
            paints: [{ colorId: "col_1" }, { colorId: "col_2" }],
            mix: [60, 40],
            toolIds: ["tool_1"],
          },
        ],
      },
    ],
  };
}

function expectIssueMessage(
  result: { success: boolean; error?: unknown },
  needle: string,
) {
  expect(result.success).toBe(false);
  if (result.success) return;
  const error = result.error as { issues: { message: string }[] };
  expect(error.issues.some((issue) => issue.message.includes(needle))).toBe(
    true,
  );
}

describe("SCRIPTORIUM_SCHEMA_VERSION", () => {
  test("値は1", () => {
    expect(SCRIPTORIUM_SCHEMA_VERSION).toBe(1);
  });
});

describe("正常系フィクスチャ", () => {
  test("完全なPublishedRecipeを受理する", () => {
    expect(
      publishedRecipeSchema.safeParse(makeValidPublishedRecipe()).success,
    ).toBe(true);
  });
});

describe("published非対応フィールドの除外", () => {
  test("publishedPaletteColorSchemaはchipPhotoIdを持たない（余剰キーはstrip）", () => {
    const result = publishedPaletteColorSchema.safeParse({
      id: "col_1",
      source: "custom",
      brand: null,
      name: "test",
      presetId: null,
      hex: null,
      chipPhotoId: "ph_1",
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect("chipPhotoId" in result.data).toBe(false);
    }
  });

  test("publishedToolSchemaはnoteを持たない（余剰キーはstrip）", () => {
    const result = publishedToolSchema.safeParse({
      id: "tool_1",
      name: "エアブラシ",
      note: "0.3mm",
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect("note" in result.data).toBe(false);
    }
  });

  test("publishedStepSchemaはphotoId・memoを持たない（余剰キーはstrip）", () => {
    const result = publishedStepSchema.safeParse({
      id: "stp_1",
      technique: { presetKey: null, label: null },
      photoId: "ph_1",
      paints: [],
      mix: null,
      toolIds: [],
      memo: "メモ",
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect("photoId" in result.data).toBe(false);
      expect("memo" in result.data).toBe(false);
    }
  });
});

describe("参照整合の不変条件（recipe.tsのcheckStructuralReferentialIntegrity流用）", () => {
  test("拒否: paletteに存在しないcolorIdを参照（INV-12相当）", () => {
    const doc = makeValidPublishedRecipe();
    doc.parts[0].steps[0].paints = [
      { colorId: "col_missing" },
      { colorId: "col_2" },
    ];
    expectIssueMessage(publishedRecipeSchema.safeParse(doc), "[INV-12]");
  });

  test("拒否: toolsに存在しないtoolIdを参照（INV-13相当）", () => {
    const doc = makeValidPublishedRecipe();
    doc.baseSteps[0].toolIds = ["tool_missing"];
    expectIssueMessage(publishedRecipeSchema.safeParse(doc), "[INV-13]");
  });

  test("拒否: palette[].idが重複（INV-11相当）", () => {
    const doc = makeValidPublishedRecipe();
    doc.palette[1].id = doc.palette[0].id;
    expectIssueMessage(publishedRecipeSchema.safeParse(doc), "[INV-11]");
  });

  test('拒否: parts[].idが"base"（INV-17相当）', () => {
    const doc = makeValidPublishedRecipe();
    doc.parts[0].id = "base";
    expectIssueMessage(publishedRecipeSchema.safeParse(doc), "[INV-17]");
  });

  test("拒否: source=preset だが presetId=null（INV-14相当）", () => {
    const doc = makeValidPublishedRecipe();
    doc.palette[0].presetId = null;
    expectIssueMessage(publishedRecipeSchema.safeParse(doc), "[INV-14]");
  });

  test("拒否: 2色でmix=null（INV-2相当・stepレベル）", () => {
    const doc = makeValidPublishedRecipe();
    doc.parts[0].steps[0].mix = null;
    expectIssueMessage(publishedRecipeSchema.safeParse(doc), "[INV-2]");
  });

  test("拒否: toolIdsに重複（INV-9相当・stepレベル）", () => {
    const doc = makeValidPublishedRecipe();
    doc.baseSteps[0].toolIds = ["tool_1", "tool_1"];
    expectIssueMessage(publishedRecipeSchema.safeParse(doc), "[INV-9]");
  });
});

// ---------------------------------------------------------------------------
// strict検証（§2.3）— 境界値の受理/拒否ペア
// ---------------------------------------------------------------------------

describe("strict: title文字数上限（≤120）", () => {
  test("受理: 120文字", () => {
    const doc = makeValidPublishedRecipe();
    doc.title = "あ".repeat(120);
    expect(publishedRecipeStrictSchema.safeParse(doc).success).toBe(true);
  });

  test("拒否: 121文字", () => {
    const doc = makeValidPublishedRecipe();
    doc.title = "あ".repeat(121);
    expectIssueMessage(
      publishedRecipeStrictSchema.safeParse(doc),
      "[STRICT-LEN]",
    );
  });
});

describe("strict: name系文字数上限（≤80）", () => {
  test("受理: palette[].nameが80文字", () => {
    const doc = makeValidPublishedRecipe();
    doc.palette[0].name = "あ".repeat(80);
    expect(publishedRecipeStrictSchema.safeParse(doc).success).toBe(true);
  });

  test("拒否: palette[].nameが81文字", () => {
    const doc = makeValidPublishedRecipe();
    doc.palette[0].name = "あ".repeat(81);
    expectIssueMessage(
      publishedRecipeStrictSchema.safeParse(doc),
      "[STRICT-LEN]",
    );
  });

  test("受理: tools[].nameが80文字", () => {
    const doc = makeValidPublishedRecipe();
    doc.tools[0].name = "あ".repeat(80);
    expect(publishedRecipeStrictSchema.safeParse(doc).success).toBe(true);
  });

  test("拒否: tools[].nameが81文字", () => {
    const doc = makeValidPublishedRecipe();
    doc.tools[0].name = "あ".repeat(81);
    expectIssueMessage(
      publishedRecipeStrictSchema.safeParse(doc),
      "[STRICT-LEN]",
    );
  });

  test("受理: parts[].nameが80文字", () => {
    const doc = makeValidPublishedRecipe();
    doc.parts[0].name = "あ".repeat(80);
    expect(publishedRecipeStrictSchema.safeParse(doc).success).toBe(true);
  });

  test("拒否: parts[].nameが81文字", () => {
    const doc = makeValidPublishedRecipe();
    doc.parts[0].name = "あ".repeat(81);
    expectIssueMessage(
      publishedRecipeStrictSchema.safeParse(doc),
      "[STRICT-LEN]",
    );
  });
});

describe("strict: technique.label文字数上限（≤60）", () => {
  test("受理: 60文字", () => {
    const doc = makeValidPublishedRecipe();
    doc.baseSteps[0].technique = { presetKey: null, label: "あ".repeat(60) };
    expect(publishedRecipeStrictSchema.safeParse(doc).success).toBe(true);
  });

  test("拒否: 61文字", () => {
    const doc = makeValidPublishedRecipe();
    doc.baseSteps[0].technique = { presetKey: null, label: "あ".repeat(61) };
    expectIssueMessage(
      publishedRecipeStrictSchema.safeParse(doc),
      "[STRICT-LEN]",
    );
  });
});

describe("strict: 構造上限 parts（≤50）", () => {
  function makeDocWithParts(count: number): PublishedRecipe {
    const doc = makeValidPublishedRecipe();
    doc.parts = Array.from({ length: count }, (_, i) => ({
      id: `part_${i}`,
      name: `パーツ${i}`,
      steps: [],
    }));
    return doc;
  }

  test("受理: 50件", () => {
    expect(
      publishedRecipeStrictSchema.safeParse(makeDocWithParts(50)).success,
    ).toBe(true);
  });

  test("拒否: 51件", () => {
    expectIssueMessage(
      publishedRecipeStrictSchema.safeParse(makeDocWithParts(51)),
      "[STRICT-STRUCT]",
    );
  });
});

describe("strict: 構造上限 steps合計（baseSteps＋全parts、≤200）", () => {
  function makeStep(id: string) {
    return {
      id,
      technique: { presetKey: null, label: null },
      paints: [],
      mix: null,
      toolIds: [],
    };
  }

  function makeDocWithSteps(count: number): PublishedRecipe {
    const doc = makeValidPublishedRecipe();
    doc.baseSteps = Array.from({ length: count }, (_, i) =>
      makeStep(`stp_${i}`),
    );
    doc.parts = [];
    return doc;
  }

  test("受理: 200件", () => {
    expect(
      publishedRecipeStrictSchema.safeParse(makeDocWithSteps(200)).success,
    ).toBe(true);
  });

  test("拒否: 201件", () => {
    expectIssueMessage(
      publishedRecipeStrictSchema.safeParse(makeDocWithSteps(201)),
      "[STRICT-STRUCT]",
    );
  });
});

describe("strict: 構造上限 palette（≤100）", () => {
  function makeDocWithPalette(count: number): PublishedRecipe {
    const doc = makeValidPublishedRecipe();
    doc.palette = Array.from({ length: count }, (_, i) => ({
      id: `col_${i}`,
      source: "custom" as const,
      brand: null,
      name: `Color ${i}`,
      presetId: null,
      hex: null,
    }));
    doc.baseSteps = [];
    doc.parts = [];
    return doc;
  }

  test("受理: 100件", () => {
    expect(
      publishedRecipeStrictSchema.safeParse(makeDocWithPalette(100)).success,
    ).toBe(true);
  });

  test("拒否: 101件", () => {
    expectIssueMessage(
      publishedRecipeStrictSchema.safeParse(makeDocWithPalette(101)),
      "[STRICT-STRUCT]",
    );
  });
});

describe("strict: シリアライズ後64KB上限", () => {
  function makeStepWithLabel(id: string) {
    return {
      id,
      technique: { presetKey: null, label: "あ".repeat(60) },
      paints: [],
      mix: null,
      toolIds: ["tool_1"],
    };
  }

  test("受理: 各上限いっぱいでも64KB未満に収まる小さめの構成", () => {
    const doc = makeValidPublishedRecipe();
    doc.title = "あ".repeat(120);
    doc.baseSteps = Array.from({ length: 50 }, (_, i) =>
      makeStepWithLabel(`stp_${i}`),
    );
    doc.parts = [];
    const bytes = new TextEncoder().encode(JSON.stringify(doc)).length;
    expect(bytes).toBeLessThanOrEqual(64 * 1024);
    expect(publishedRecipeStrictSchema.safeParse(doc).success).toBe(true);
  });

  test("拒否: シリアライズ後64KBを超える（parts=50・steps合計=200は各上限内に収めたまま超過させる）", () => {
    const doc = makeValidPublishedRecipe();
    doc.title = "あ".repeat(120);
    doc.palette = Array.from({ length: 100 }, (_, i) => ({
      id: `col_${i}`,
      source: "custom" as const,
      brand: "あ".repeat(80),
      name: "あ".repeat(80),
      presetId: null,
      hex: null,
    }));
    doc.tools = [{ id: "tool_1", name: "a" }];
    doc.baseSteps = Array.from({ length: 200 }, (_, i) =>
      makeStepWithLabel(`stp_${i}`),
    );
    doc.parts = [];
    const bytes = new TextEncoder().encode(JSON.stringify(doc)).length;
    expect(bytes).toBeGreaterThan(64 * 1024);
    expectIssueMessage(
      publishedRecipeStrictSchema.safeParse(doc),
      "[STRICT-STRUCT]",
    );
  });
});

describe("strict: 自由テキストのURL・山括弧・javascript:拒否", () => {
  test("受理: 平文のtitle", () => {
    const doc = makeValidPublishedRecipe();
    doc.title = "普通のタイトルです";
    expect(publishedRecipeStrictSchema.safeParse(doc).success).toBe(true);
  });

  test("拒否: titleにURLを含む", () => {
    const doc = makeValidPublishedRecipe();
    doc.title = "見てね https://example.com/spam";
    expectIssueMessage(
      publishedRecipeStrictSchema.safeParse(doc),
      "[STRICT-TEXT]",
    );
  });

  test("拒否: palette[].nameに<を含む", () => {
    const doc = makeValidPublishedRecipe();
    doc.palette[0].name = "<script>test";
    expectIssueMessage(
      publishedRecipeStrictSchema.safeParse(doc),
      "[STRICT-TEXT]",
    );
  });

  test("拒否: palette[].brandにjavascript:を含む", () => {
    const doc = makeValidPublishedRecipe();
    doc.palette[0].brand = "javascript:alert(1)";
    expectIssueMessage(
      publishedRecipeStrictSchema.safeParse(doc),
      "[STRICT-TEXT]",
    );
  });

  test("拒否: tools[].nameにURLを含む", () => {
    const doc = makeValidPublishedRecipe();
    doc.tools[0].name = "http://evil.example/tool";
    expectIssueMessage(
      publishedRecipeStrictSchema.safeParse(doc),
      "[STRICT-TEXT]",
    );
  });

  test("拒否: parts[].nameにjavascript:を含む", () => {
    const doc = makeValidPublishedRecipe();
    doc.parts[0].name = "javascript:void(0)";
    expectIssueMessage(
      publishedRecipeStrictSchema.safeParse(doc),
      "[STRICT-TEXT]",
    );
  });

  test("拒否: technique.labelに<を含む", () => {
    const doc = makeValidPublishedRecipe();
    doc.baseSteps[0].technique = { presetKey: null, label: "<b>label</b>" };
    expectIssueMessage(
      publishedRecipeStrictSchema.safeParse(doc),
      "[STRICT-TEXT]",
    );
  });
});

describe("strict: technique.presetKey経路の検査（レビューR1 High指摘: マスタ外presetKeyの素通し）", () => {
  test("受理: 正規presetKey（マスタ所属。例: basecoat）", () => {
    const doc = makeValidPublishedRecipe();
    doc.baseSteps[0].technique = { presetKey: "basecoat", label: null };
    expect(publishedRecipeStrictSchema.safeParse(doc).success).toBe(true);
  });

  test("受理: マスタ外だが無害なpresetKey（60字以内・禁止パターンなし）", () => {
    const doc = makeValidPublishedRecipe();
    doc.baseSteps[0].technique = { presetKey: "my-technique", label: null };
    expect(publishedRecipeStrictSchema.safeParse(doc).success).toBe(true);
  });

  test("拒否: presetKeyにjavascript:を含む", () => {
    const doc = makeValidPublishedRecipe();
    doc.baseSteps[0].technique = {
      presetKey: "javascript:alert(1)",
      label: null,
    };
    expectIssueMessage(
      publishedRecipeStrictSchema.safeParse(doc),
      "[STRICT-TEXT]",
    );
  });

  test("拒否: presetKeyに<script>を含む", () => {
    const doc = makeValidPublishedRecipe();
    doc.baseSteps[0].technique = { presetKey: "<script>", label: null };
    expectIssueMessage(
      publishedRecipeStrictSchema.safeParse(doc),
      "[STRICT-TEXT]",
    );
  });

  test("拒否: presetKeyにURL(https://)を含む", () => {
    const doc = makeValidPublishedRecipe();
    doc.baseSteps[0].technique = {
      presetKey: "https://example.com",
      label: null,
    };
    expectIssueMessage(
      publishedRecipeStrictSchema.safeParse(doc),
      "[STRICT-TEXT]",
    );
  });

  test("拒否: presetKeyが61文字（LABEL_MAX超過）", () => {
    const doc = makeValidPublishedRecipe();
    doc.baseSteps[0].technique = { presetKey: "a".repeat(61), label: null };
    expectIssueMessage(
      publishedRecipeStrictSchema.safeParse(doc),
      "[STRICT-LEN]",
    );
  });
});

describe("strict: 大文字回避耐性の回帰（禁止パターンはiフラグで大文字小文字を区別しない）", () => {
  test("拒否: titleに大文字URL（HTTPS://EXAMPLE.COM）を含む", () => {
    const doc = makeValidPublishedRecipe();
    doc.title = "見てね HTTPS://EXAMPLE.COM/spam";
    expectIssueMessage(
      publishedRecipeStrictSchema.safeParse(doc),
      "[STRICT-TEXT]",
    );
  });

  test("拒否: presetKeyに大文字javascriptスキーム（JavaScript:alert(1)）を含む", () => {
    const doc = makeValidPublishedRecipe();
    doc.baseSteps[0].technique = {
      presetKey: "JavaScript:alert(1)",
      label: null,
    };
    expectIssueMessage(
      publishedRecipeStrictSchema.safeParse(doc),
      "[STRICT-TEXT]",
    );
  });
});
