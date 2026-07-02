import { describe, expect, test } from "vitest";
import {
  CURRENT_SCHEMA_VERSION,
  migrateRecipeDoc,
  migrateExportFile,
  MissingMigrationError,
  UnsupportedSchemaVersionError,
  type DocMigrationRegistry,
  type PhotosMigrationRegistry,
} from "./migrations";

describe("migrateRecipeDoc", () => {
  test("fromVersion === CURRENT_SCHEMA_VERSION（v1）→入力がそのまま返る（恒等）", () => {
    const doc = { schemaVersion: 1, id: "rcp_1", title: "test" };
    expect(migrateRecipeDoc(doc, CURRENT_SCHEMA_VERSION)).toBe(doc);
  });

  test("ダミーマイグレーションの適用順検証: fromVersion=0→registry[0]が1回だけ順次適用される", () => {
    const calls: string[] = [];
    const dummyRegistry: DocMigrationRegistry = {
      0: (doc) => {
        calls.push("0→1");
        const d = doc as { schemaVersion: number; legacyField?: string };
        return { ...d, schemaVersion: 1, migratedFrom: d.legacyField };
      },
    };

    const raw = { schemaVersion: 0, legacyField: "old-value" };
    const result = migrateRecipeDoc(raw, 0, dummyRegistry) as {
      schemaVersion: number;
      migratedFrom: string;
    };

    expect(calls).toEqual(["0→1"]);
    expect(result.schemaVersion).toBe(1);
    expect(result.migratedFrom).toBe("old-value");
  });

  test("fromVersion > CURRENT_SCHEMA_VERSIONでUnsupportedSchemaVersionErrorをthrow", () => {
    const doc = { schemaVersion: 99 };
    expect(() => migrateRecipeDoc(doc, 99)).toThrow(
      UnsupportedSchemaVersionError,
    );
  });

  test("UnsupportedSchemaVersionErrorはname付きのErrorサブクラス", () => {
    try {
      migrateRecipeDoc({}, CURRENT_SCHEMA_VERSION + 1);
      throw new Error("should have thrown");
    } catch (e) {
      expect(e).toBeInstanceOf(UnsupportedSchemaVersionError);
      expect(e).toBeInstanceOf(Error);
      expect((e as Error).name).toBe("UnsupportedSchemaVersionError");
    }
  });

  test("目標バージョン注入による多段チェーン適用: registry{0:f, 1:g}をfromVersion=0・targetVersion=2でf→gの順に累積適用", () => {
    const calls: string[] = [];
    const dummyRegistry: DocMigrationRegistry = {
      0: (doc) => {
        calls.push("0→1");
        const d = doc as { schemaVersion: number; value: number };
        return { ...d, schemaVersion: 1, value: d.value + 1 };
      },
      1: (doc) => {
        calls.push("1→2");
        const d = doc as { schemaVersion: number; value: number };
        return { ...d, schemaVersion: 2, value: d.value * 10 };
      },
    };

    const raw = { schemaVersion: 0, value: 1 };
    const result = migrateRecipeDoc(raw, 0, dummyRegistry, 2) as {
      schemaVersion: number;
      value: number;
    };

    // 適用順の検証（f→gの順で1回ずつ）
    expect(calls).toEqual(["0→1", "1→2"]);
    // 累積結果の検証（(1+1)*10 = 20 — fの結果にgが適用されている）
    expect(result.schemaVersion).toBe(2);
    expect(result.value).toBe(20);
  });

  test("中間バージョンの変換が欠落している場合（0→2でregistry[1]が無い）はMissingMigrationErrorをthrow", () => {
    const dummyRegistry: DocMigrationRegistry = {
      0: (doc) => ({ ...(doc as object), schemaVersion: 1 }),
      // registry[1]が欠落
    };

    const raw = { schemaVersion: 0 };
    expect(() => migrateRecipeDoc(raw, 0, dummyRegistry, 2)).toThrow(
      MissingMigrationError,
    );
  });
});

describe("migrateExportFile", () => {
  test("fromVersion === CURRENT_SCHEMA_VERSION（v1）→入力がそのまま返る（恒等）", () => {
    const file = {
      app: "coat-codex",
      kind: "recipe-export",
      schemaVersion: 1,
      recipe: { schemaVersion: 1 },
      photos: [],
    };
    expect(migrateExportFile(file, CURRENT_SCHEMA_VERSION)).toBe(file);
  });

  test("ダミーマイグレーションの適用順検証: recipe部・photos部の両レジストリが順次適用される", () => {
    const docCalls: string[] = [];
    const photosCalls: string[] = [];
    const dummyDocRegistry: DocMigrationRegistry = {
      0: (doc) => {
        docCalls.push("0→1");
        return { ...(doc as object), schemaVersion: 1 };
      },
    };
    const dummyPhotosRegistry: PhotosMigrationRegistry = {
      0: (photos) => {
        photosCalls.push("0→1");
        return (photos as unknown[]).map((p) => ({
          ...(p as object),
          migrated: true,
        }));
      },
    };

    const raw = {
      app: "coat-codex",
      kind: "recipe-export",
      schemaVersion: 0,
      recipe: { schemaVersion: 0, id: "rcp_1" },
      photos: [{ id: "ph_1" }],
    };

    const result = migrateExportFile(
      raw,
      0,
      dummyDocRegistry,
      dummyPhotosRegistry,
    ) as {
      schemaVersion: number;
      recipe: { schemaVersion: number };
      photos: { migrated: boolean }[];
    };

    expect(docCalls).toEqual(["0→1"]);
    expect(photosCalls).toEqual(["0→1"]);
    expect(result.schemaVersion).toBe(CURRENT_SCHEMA_VERSION);
    expect(result.recipe.schemaVersion).toBe(1);
    expect(result.photos[0].migrated).toBe(true);
  });

  test("fromVersion > CURRENT_SCHEMA_VERSIONでUnsupportedSchemaVersionErrorをthrow", () => {
    const file = { schemaVersion: 99, recipe: {}, photos: [] };
    expect(() => migrateExportFile(file, 99)).toThrow(
      UnsupportedSchemaVersionError,
    );
  });
});
