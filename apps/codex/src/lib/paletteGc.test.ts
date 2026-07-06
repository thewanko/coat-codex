// lib/paletteGc.test.ts — 未使用palette色の自動GCのテスト（技術計画v2.3 §4.2 M4必須事項③）

import { describe, expect, test } from "vitest";
import { gcUnusedPaletteColors } from "./paletteGc";
import type { PaletteColor, RecipeDoc, Step } from "@coat-codex/recipe-core";

function makeColor(overrides: Partial<PaletteColor> = {}): PaletteColor {
  return {
    id: "col_a",
    source: "custom",
    brand: null,
    name: "朱金",
    presetId: null,
    hex: "#7A2E1F",
    chipPhotoId: null,
    ...overrides,
  };
}

function makeStep(overrides: Partial<Step> = {}): Step {
  return {
    id: "stp_1",
    technique: { presetKey: null, label: null },
    photoId: null,
    paints: [],
    mix: null,
    toolIds: [],
    memo: "",
    ...overrides,
  };
}

function makeDoc(overrides: Partial<RecipeDoc> = {}): RecipeDoc {
  return {
    schemaVersion: 1,
    id: "rcp_1",
    title: "テスト",
    createdAt: "2026-07-01T00:00:00.000Z",
    updatedAt: "2026-07-01T00:00:00.000Z",
    overviewPhotoIds: [],
    palette: [],
    tools: [],
    baseSteps: [],
    parts: [],
    photoCrops: {},
    ...overrides,
  };
}

describe("gcUnusedPaletteColors", () => {
  test("baseStepsから参照されている色は保持される", () => {
    const colorA = makeColor({ id: "col_a" });
    const doc = makeDoc({
      palette: [colorA],
      baseSteps: [makeStep({ paints: [{ colorId: "col_a" }], mix: null })],
    });

    const result = gcUnusedPaletteColors(doc);

    expect(result.doc.palette).toEqual([colorA]);
  });

  test("parts[].stepsから参照されている色は保持される", () => {
    const colorA = makeColor({ id: "col_a" });
    const doc = makeDoc({
      palette: [colorA],
      parts: [
        {
          id: "part_1",
          name: "兜",
          steps: [makeStep({ paints: [{ colorId: "col_a" }], mix: null })],
        },
      ],
    });

    const result = gcUnusedPaletteColors(doc);

    expect(result.doc.palette).toEqual([colorA]);
  });

  test("どこからも参照されていない色は除去される（順序維持）", () => {
    const colorA = makeColor({ id: "col_a", name: "A" });
    const colorB = makeColor({ id: "col_b", name: "B" });
    const colorC = makeColor({ id: "col_c", name: "C" });
    const doc = makeDoc({
      palette: [colorA, colorB, colorC],
      baseSteps: [makeStep({ paints: [{ colorId: "col_c" }], mix: null })],
    });

    const result = gcUnusedPaletteColors(doc);

    expect(result.doc.palette).toEqual([colorC]);
  });

  test("除去した色のchipPhotoIdをremovedChipPhotoIdsで返す（nullは含めない）", () => {
    const colorA = makeColor({ id: "col_a", chipPhotoId: "ph_1" });
    const colorB = makeColor({ id: "col_b", chipPhotoId: null });
    const doc = makeDoc({ palette: [colorA, colorB] });

    const result = gcUnusedPaletteColors(doc);

    expect(result.doc.palette).toEqual([]);
    expect(result.removedChipPhotoIds).toEqual(["ph_1"]);
  });

  test("除去対象が無い場合はdocを同一参照で返す", () => {
    const colorA = makeColor({ id: "col_a" });
    const doc = makeDoc({
      palette: [colorA],
      baseSteps: [makeStep({ paints: [{ colorId: "col_a" }], mix: null })],
    });

    const result = gcUnusedPaletteColors(doc);

    expect(result.doc).toBe(doc);
    expect(result.removedChipPhotoIds).toEqual([]);
  });

  test("palette自体が空の場合もdocを同一参照で返す", () => {
    const doc = makeDoc();

    const result = gcUnusedPaletteColors(doc);

    expect(result.doc).toBe(doc);
    expect(result.removedChipPhotoIds).toEqual([]);
  });
});
