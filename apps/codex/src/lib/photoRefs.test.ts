// lib/photoRefs.test.ts — collectReferencedPhotoIdsのテスト（T49）

import { describe, expect, test } from "vitest";
import { collectReferencedPhotoIds } from "./photoRefs";
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
    schemaVersion: 3,
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
    source: null,
    ...overrides,
  };
}

describe("collectReferencedPhotoIds", () => {
  test("overviewPhotoIdsを含む", () => {
    const doc = makeDoc({ overviewPhotoIds: ["ph_overview"] });

    const result = collectReferencedPhotoIds(doc);

    expect(result.has("ph_overview")).toBe(true);
  });

  test("baseSteps[].photoIdを含む", () => {
    const doc = makeDoc({
      baseSteps: [makeStep({ id: "stp_1", photoId: "ph_base" })],
    });

    const result = collectReferencedPhotoIds(doc);

    expect(result.has("ph_base")).toBe(true);
  });

  test("parts[].steps[].photoIdを含む", () => {
    const doc = makeDoc({
      parts: [
        {
          id: "part_1",
          name: "腕",
          steps: [makeStep({ id: "stp_1", photoId: "ph_part" })],
        },
      ],
    });

    const result = collectReferencedPhotoIds(doc);

    expect(result.has("ph_part")).toBe(true);
  });

  test("photoIdがnullのstepは含めない", () => {
    const doc = makeDoc({
      baseSteps: [makeStep({ id: "stp_1", photoId: null })],
    });

    const result = collectReferencedPhotoIds(doc);

    expect(result.size).toBe(0);
  });

  test("palette[].chipPhotoIdは含めない（chip写真の削除判定への流用禁止）", () => {
    const doc = makeDoc({
      palette: [makeColor({ id: "col_a", chipPhotoId: "ph_chip" })],
    });

    const result = collectReferencedPhotoIds(doc);

    expect(result.has("ph_chip")).toBe(false);
    expect(result.size).toBe(0);
  });
});
