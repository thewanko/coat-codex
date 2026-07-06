// exchange/exportFile.test.ts — JSONエクスポート純関数部（技術計画v2.2 §2.2/§4.2 T29）のテスト
//
// 小さなダミーBlobで以下を検証する:
//   - 出力構造が§2.2準拠（app/kind/schemaVersion/exportedAt/recipe/photos）であること
//   - 実体なきphotoId参照（overviewPhotoIds/steps[].photoId/palette[].chipPhotoId）が除去されること
//   - 写真なし選択（includePhotos=false）時にphotoデータが含まれないこと（recipe内参照は残る）
//
// 本ファイルはnode環境で完結する（FileReader/Dexie等のブラウザ・DB依存を持たない）。
// codex側のblobToDataUrl・exportRecipeToBlobのテストは
// apps/codex/src/lib/exporters/json.test.ts に残る。

import { describe, expect, test } from "vitest";
import type { RecipeDoc, RecipeExportFile } from "../schema/recipe";
import { recipeExportFileSchema } from "../schema/recipe";
import {
  assembleExportBlob,
  buildExportPlan,
  stripDanglingPhotoRefs,
} from "./exportFile";

/** テスト用の写真参照型（buildExportPlan/assembleExportBlobはidのみ使う） */
interface TestPhoto {
  id: string;
}

/** テスト用Step生成ヘルパー。他フィールドは最小固定値で埋める（recipeRefs.test.tsの慣行に倣う） */
function makeStep(
  overrides: Partial<RecipeDoc["baseSteps"][number]> & { id: string },
): RecipeDoc["baseSteps"][number] {
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

/** テスト用RecipeDoc生成ヘルパー */
function makeDoc(overrides: Partial<RecipeDoc> = {}): RecipeDoc {
  return {
    schemaVersion: 1,
    id: "rcp_1",
    title: "テストレシピ",
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-02T00:00:00.000Z",
    overviewPhotoIds: [],
    palette: [],
    tools: [],
    baseSteps: [],
    parts: [],
    photoCrops: {},
    ...overrides,
  };
}

/** テスト用写真参照生成ヘルパー */
function makePhoto(id: string): TestPhoto {
  return { id };
}

describe("stripDanglingPhotoRefs", () => {
  test("実体のないoverviewPhotoIds参照を除去する", () => {
    const doc = makeDoc({ overviewPhotoIds: ["ph_1", "ph_missing"] });
    const result = stripDanglingPhotoRefs(doc, new Set(["ph_1"]));
    expect(result.overviewPhotoIds).toEqual(["ph_1"]);
  });

  test("実体のないsteps[].photoId参照をnull化する（baseSteps）", () => {
    const doc = makeDoc({
      baseSteps: [
        makeStep({ id: "stp_1", photoId: "ph_missing" }),
        makeStep({ id: "stp_2", photoId: "ph_1" }),
      ],
    });
    const result = stripDanglingPhotoRefs(doc, new Set(["ph_1"]));
    expect(result.baseSteps[0].photoId).toBeNull();
    expect(result.baseSteps[1].photoId).toBe("ph_1");
  });

  test("実体のないsteps[].photoId参照をnull化する（parts横断）", () => {
    const doc = makeDoc({
      parts: [
        {
          id: "part_1",
          name: "パーツ1",
          steps: [makeStep({ id: "stp_1", photoId: "ph_missing" })],
        },
      ],
    });
    const result = stripDanglingPhotoRefs(doc, new Set());
    expect(result.parts[0].steps[0].photoId).toBeNull();
  });

  test("実体のないpalette[].chipPhotoId参照をnull化する", () => {
    const doc = makeDoc({
      palette: [
        {
          id: "col_1",
          source: "custom",
          brand: null,
          name: "赤",
          presetId: null,
          hex: null,
          chipPhotoId: "ph_missing",
        },
      ],
    });
    const result = stripDanglingPhotoRefs(doc, new Set());
    expect(result.palette[0].chipPhotoId).toBeNull();
  });

  test("実体のある参照は保持する（誤除去しない）", () => {
    const doc = makeDoc({
      overviewPhotoIds: ["ph_1"],
      baseSteps: [makeStep({ id: "stp_1", photoId: "ph_2" })],
      palette: [
        {
          id: "col_1",
          source: "custom",
          brand: null,
          name: "赤",
          presetId: null,
          hex: null,
          chipPhotoId: "ph_3",
        },
      ],
    });
    const result = stripDanglingPhotoRefs(
      doc,
      new Set(["ph_1", "ph_2", "ph_3"]),
    );
    expect(result.overviewPhotoIds).toEqual(["ph_1"]);
    expect(result.baseSteps[0].photoId).toBe("ph_2");
    expect(result.palette[0].chipPhotoId).toBe("ph_3");
  });

  test("元のdocを変更しない（純関数・非破壊）", () => {
    const doc = makeDoc({ overviewPhotoIds: ["ph_1", "ph_missing"] });
    const original = JSON.parse(JSON.stringify(doc)) as RecipeDoc;
    stripDanglingPhotoRefs(doc, new Set(["ph_1"]));
    expect(doc).toEqual(original);
  });

  test("photoCrops: 実体のないphotoId・stripで未参照になったphotoIdのキーを除去する", () => {
    const doc = makeDoc({
      overviewPhotoIds: ["ph_1"],
      photoCrops: {
        ph_1: { x: 0, y: 0, w: 0.5, h: 0.5 },
        ph_missing_entity: { x: 0.1, y: 0.1, w: 0.2, h: 0.2 },
      },
    });
    // ph_1は実体なし（existingPhotoIdsに含まれない）→ overviewPhotoIdsから除去され、
    // その結果photoCropsのph_1キーも参照なしとして除去される
    const result = stripDanglingPhotoRefs(doc, new Set());
    expect(result.photoCrops).toEqual({});
  });

  test("photoCrops: 参照ありのcropは保持する（誤除去しない）", () => {
    const doc = makeDoc({
      overviewPhotoIds: ["ph_1"],
      baseSteps: [makeStep({ id: "stp_1", photoId: "ph_2" })],
      photoCrops: {
        ph_1: { x: 0, y: 0, w: 0.5, h: 0.5 },
        ph_2: { x: 0.1, y: 0.1, w: 0.3, h: 0.3 },
      },
    });
    const result = stripDanglingPhotoRefs(doc, new Set(["ph_1", "ph_2"]));
    expect(result.photoCrops).toEqual({
      ph_1: { x: 0, y: 0, w: 0.5, h: 0.5 },
      ph_2: { x: 0.1, y: 0.1, w: 0.3, h: 0.3 },
    });
  });
});

describe("buildExportPlan", () => {
  test("§2.2準拠のheader（app/kind/schemaVersion一致/exportedAt）を返す", () => {
    const doc = makeDoc();
    const plan = buildExportPlan(doc, [], true, "2026-07-03T00:00:00.000Z");
    expect(plan.header.app).toBe("coat-codex");
    expect(plan.header.kind).toBe("recipe-export");
    expect(plan.header.schemaVersion).toBe(doc.schemaVersion);
    expect(plan.header.exportedAt).toBe("2026-07-03T00:00:00.000Z");
  });

  test("includePhotos=falseのときphotosToEmbedは空配列（recipe内参照は残す）", () => {
    const doc = makeDoc({
      overviewPhotoIds: ["ph_1"],
      baseSteps: [makeStep({ id: "stp_1", photoId: "ph_1" })],
    });
    const photos = [makePhoto("ph_1")];
    const plan = buildExportPlan(
      doc,
      photos,
      false,
      "2026-07-03T00:00:00.000Z",
    );
    expect(plan.photosToEmbed).toEqual([]);
    // recipe内のphotoId参照は除去しない（インポート正規化側で無害化される。§2.2）
    expect(plan.recipe.overviewPhotoIds).toEqual(["ph_1"]);
    expect(plan.recipe.baseSteps[0].photoId).toBe("ph_1");
  });

  test("includePhotos=trueのとき実体のある写真のみphotosToEmbedに含める", () => {
    const doc = makeDoc({ overviewPhotoIds: ["ph_1", "ph_missing"] });
    const photos = [makePhoto("ph_1")];
    const plan = buildExportPlan(doc, photos, true, "2026-07-03T00:00:00.000Z");
    expect(plan.photosToEmbed.map((p) => p.id)).toEqual(["ph_1"]);
    expect(plan.recipe.overviewPhotoIds).toEqual(["ph_1"]);
  });
});

describe("assembleExportBlob", () => {
  test("パーツ配列連結で§2.2準拠のJSON構造をBlobとして組み立てる", async () => {
    const header = {
      app: "coat-codex" as const,
      kind: "recipe-export" as const,
      schemaVersion: 1,
      exportedAt: "2026-07-03T00:00:00.000Z",
    };
    const recipe = makeDoc({ overviewPhotoIds: ["ph_1"] });
    const photos = [makePhoto("ph_1")];
    const dataUrls = ["data:image/png;base64,aGVsbG8="];

    const blob = assembleExportBlob(header, recipe, photos, dataUrls);
    const text = await blob.text();
    const parsed = JSON.parse(text) as RecipeExportFile;

    expect(parsed.app).toBe("coat-codex");
    expect(parsed.kind).toBe("recipe-export");
    expect(parsed.schemaVersion).toBe(1);
    expect(parsed.exportedAt).toBe("2026-07-03T00:00:00.000Z");
    expect(parsed.recipe).toEqual(recipe);
    expect(parsed.photos).toEqual([
      { id: "ph_1", dataUrl: "data:image/png;base64,aGVsbG8=" },
    ]);

    // zodスキーマでも構造検証（§2.2 / recipe-core recipeExportFileSchema）
    expect(() => recipeExportFileSchema.parse(parsed)).not.toThrow();
  });

  test("複数写真をカンマ区切りで正しく連結する", async () => {
    const header = {
      app: "coat-codex" as const,
      kind: "recipe-export" as const,
      schemaVersion: 1,
      exportedAt: "2026-07-03T00:00:00.000Z",
    };
    const recipe = makeDoc();
    const photos = [makePhoto("ph_1"), makePhoto("ph_2")];
    const dataUrls = [
      "data:image/png;base64,AAAA",
      "data:image/png;base64,BBBB",
    ];

    const blob = assembleExportBlob(header, recipe, photos, dataUrls);
    const parsed = JSON.parse(await blob.text()) as RecipeExportFile;

    expect(parsed.photos).toEqual([
      { id: "ph_1", dataUrl: "data:image/png;base64,AAAA" },
      { id: "ph_2", dataUrl: "data:image/png;base64,BBBB" },
    ]);
  });

  test("写真0件のときphotos: []になる", async () => {
    const header = {
      app: "coat-codex" as const,
      kind: "recipe-export" as const,
      schemaVersion: 1,
      exportedAt: "2026-07-03T00:00:00.000Z",
    };
    const recipe = makeDoc();
    const blob = assembleExportBlob(header, recipe, [], []);
    const parsed = JSON.parse(await blob.text()) as RecipeExportFile;
    expect(parsed.photos).toEqual([]);
  });
});
