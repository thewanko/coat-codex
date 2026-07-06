import { describe, expect, test } from "vitest";
import type { RecipeDoc, Step } from "../models/recipe";
import { countColorUsage, countToolUsage } from "./recipeRefs";

/** テスト用Step生成ヘルパー。paints/toolIdsのみ指定し他は最小固定値で埋める */
function makeStep(overrides: Partial<Step> & { id: string }): Step {
  return {
    technique: { presetKey: null, label: null },
    photoId: null,
    paints: [],
    mix: null,
    toolIds: [],
    memo: "",
    ...overrides,
  };
}

/** テスト用RecipeDoc生成ヘルパー。baseSteps/partsのみ指定し他は最小固定値で埋める */
function makeDoc(
  overrides: Partial<Pick<RecipeDoc, "baseSteps" | "parts">>,
): RecipeDoc {
  return {
    schemaVersion: 1,
    id: "recipe_1",
    title: "テストレシピ",
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    overviewPhotoIds: [],
    palette: [],
    tools: [],
    baseSteps: [],
    parts: [],
    photoCrops: {},
    ...overrides,
  };
}

describe("countColorUsage", () => {
  test("baseStepsのみで該当色を参照するStep数を返す", () => {
    const doc = makeDoc({
      baseSteps: [
        makeStep({ id: "step_1", paints: [{ colorId: "col_a" }] }),
        makeStep({ id: "step_2", paints: [{ colorId: "col_b" }] }),
        makeStep({
          id: "step_3",
          paints: [{ colorId: "col_a" }, { colorId: "col_b" }],
          mix: [50, 50],
        }),
      ],
    });
    expect(countColorUsage(doc, "col_a")).toBe(2);
  });

  test("partsのみで該当色を参照するStep数を返す", () => {
    const doc = makeDoc({
      parts: [
        {
          id: "part_1",
          name: "パーツ1",
          steps: [
            makeStep({ id: "step_1", paints: [{ colorId: "col_a" }] }),
            makeStep({ id: "step_2", paints: [{ colorId: "col_a" }] }),
          ],
        },
        {
          id: "part_2",
          name: "パーツ2",
          steps: [makeStep({ id: "step_3", paints: [{ colorId: "col_b" }] })],
        },
      ],
    });
    expect(countColorUsage(doc, "col_a")).toBe(2);
  });

  test("baseStepsとparts両方に跨って参照するStep数を合算する", () => {
    const doc = makeDoc({
      baseSteps: [makeStep({ id: "step_1", paints: [{ colorId: "col_a" }] })],
      parts: [
        {
          id: "part_1",
          name: "パーツ1",
          steps: [
            makeStep({ id: "step_2", paints: [{ colorId: "col_a" }] }),
            makeStep({ id: "step_3", paints: [{ colorId: "col_b" }] }),
          ],
        },
      ],
    });
    expect(countColorUsage(doc, "col_a")).toBe(2);
  });

  test("参照が0件のときは0を返す", () => {
    const doc = makeDoc({
      baseSteps: [makeStep({ id: "step_1", paints: [{ colorId: "col_b" }] })],
    });
    expect(countColorUsage(doc, "col_a")).toBe(0);
  });

  test("文書内に存在しないcolorIdを渡しても0を返す", () => {
    const doc = makeDoc({
      baseSteps: [makeStep({ id: "step_1", paints: [{ colorId: "col_a" }] })],
    });
    expect(countColorUsage(doc, "col_nonexistent")).toBe(0);
  });
});

describe("countToolUsage", () => {
  test("baseStepsのみで該当ツールを参照するStep数を返す", () => {
    const doc = makeDoc({
      baseSteps: [
        makeStep({ id: "step_1", toolIds: ["tool_a"] }),
        makeStep({ id: "step_2", toolIds: ["tool_b"] }),
        makeStep({ id: "step_3", toolIds: ["tool_a", "tool_b"] }),
      ],
    });
    expect(countToolUsage(doc, "tool_a")).toBe(2);
  });

  test("partsのみで該当ツールを参照するStep数を返す", () => {
    const doc = makeDoc({
      parts: [
        {
          id: "part_1",
          name: "パーツ1",
          steps: [
            makeStep({ id: "step_1", toolIds: ["tool_a"] }),
            makeStep({ id: "step_2", toolIds: ["tool_a"] }),
          ],
        },
        {
          id: "part_2",
          name: "パーツ2",
          steps: [makeStep({ id: "step_3", toolIds: ["tool_b"] })],
        },
      ],
    });
    expect(countToolUsage(doc, "tool_a")).toBe(2);
  });

  test("baseStepsとparts両方に跨って参照するStep数を合算する", () => {
    const doc = makeDoc({
      baseSteps: [makeStep({ id: "step_1", toolIds: ["tool_a"] })],
      parts: [
        {
          id: "part_1",
          name: "パーツ1",
          steps: [
            makeStep({ id: "step_2", toolIds: ["tool_a"] }),
            makeStep({ id: "step_3", toolIds: ["tool_b"] }),
          ],
        },
      ],
    });
    expect(countToolUsage(doc, "tool_a")).toBe(2);
  });

  test("参照が0件のときは0を返す", () => {
    const doc = makeDoc({
      baseSteps: [makeStep({ id: "step_1", toolIds: ["tool_b"] })],
    });
    expect(countToolUsage(doc, "tool_a")).toBe(0);
  });

  test("文書内に存在しないtoolIdを渡しても0を返す", () => {
    const doc = makeDoc({
      baseSteps: [makeStep({ id: "step_1", toolIds: ["tool_a"] })],
    });
    expect(countToolUsage(doc, "tool_nonexistent")).toBe(0);
  });
});
