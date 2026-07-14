// lib/toolLibraryFile.test.ts — ツールライブラリ専用エクスポート/インポート形式のテスト（T54）

import { describe, expect, it } from "vitest";
import {
  buildToolLibraryExport,
  mergeImportedTools,
  parseToolLibraryFile,
} from "./toolLibraryFile";
import type { UserToolRecord } from "../db/db";

function makeTool(overrides: Partial<UserToolRecord> = {}): UserToolRecord {
  return {
    id: "utool_1",
    name: "エアブラシ",
    note: null,
    tags: [],
    createdAt: "2026-07-01T00:00:00.000Z",
    updatedAt: "2026-07-01T00:00:00.000Z",
    ...overrides,
  };
}

describe("buildToolLibraryExport / parseToolLibraryFile roundtrip", () => {
  it("builds a file and parses it back to the same value", () => {
    const tools = [
      makeTool({ name: "エアブラシ", note: "0.3mm", tags: ["下地", "細吹き"] }),
      makeTool({ id: "utool_2", name: "筆", note: null, tags: [] }),
    ];
    const file = buildToolLibraryExport(tools);
    const json = JSON.stringify(file);
    const result = parseToolLibraryFile(json);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.file).toEqual(file);
      expect(result.file.tools).toEqual([
        { name: "エアブラシ", note: "0.3mm", tags: ["下地", "細吹き"] },
        { name: "筆", note: null, tags: [] },
      ]);
    }
  });
});

describe("parseToolLibraryFile — 拒否ケース", () => {
  it("returns invalid-json for unparsable input", () => {
    const result = parseToolLibraryFile("{not json");
    expect(result).toEqual({ ok: false, error: "invalid-json" });
  });

  it("returns invalid-format for wrong kind", () => {
    const json = JSON.stringify({
      app: "coat-codex",
      kind: "recipe-export",
      version: 1,
      exportedAt: "2026-07-01T00:00:00.000Z",
      tools: [],
    });
    const result = parseToolLibraryFile(json);
    expect(result).toEqual({ ok: false, error: "invalid-format" });
  });

  it("returns invalid-format when a tool name is empty", () => {
    const json = JSON.stringify({
      app: "coat-codex",
      kind: "tool-library",
      version: 1,
      exportedAt: "2026-07-01T00:00:00.000Z",
      tools: [{ name: "", note: null, tags: [] }],
    });
    const result = parseToolLibraryFile(json);
    expect(result).toEqual({ ok: false, error: "invalid-format" });
  });

  it("returns unsupported-version for version 2", () => {
    const json = JSON.stringify({
      app: "coat-codex",
      kind: "tool-library",
      version: 2,
      exportedAt: "2026-07-01T00:00:00.000Z",
      tools: [],
    });
    const result = parseToolLibraryFile(json);
    expect(result).toEqual({ ok: false, error: "unsupported-version" });
  });
});

describe("mergeImportedTools", () => {
  it("adds tools that don't match any existing name", () => {
    const existing: UserToolRecord[] = [];
    const imported = [{ name: "エアブラシ", note: "0.3mm", tags: ["下地"] }];
    const result = mergeImportedTools(existing, imported);

    expect(result.addedCount).toBe(1);
    expect(result.mergedCount).toBe(0);
    expect(result.added).toEqual([
      { name: "エアブラシ", note: "0.3mm", tags: ["下地"] },
    ]);
    expect(result.updates).toEqual([]);
  });

  it("merges by toolNameKey ignoring case/trim/NFC differences", () => {
    const existing = [
      makeTool({ id: "utool_1", name: "airbrush", tags: ["a"] }),
    ];
    const imported = [{ name: "  AirBrush  ", note: null, tags: ["b"] }];
    const result = mergeImportedTools(existing, imported);

    expect(result.addedCount).toBe(0);
    expect(result.mergedCount).toBe(1);
    expect(result.updates).toEqual([{ id: "utool_1", tags: ["a", "b"] }]);
  });

  it("unions tags case-insensitively without duplicates", () => {
    const existing = [
      makeTool({ id: "utool_1", name: "筆", tags: ["細吹き", "下地"] }),
    ];
    const imported = [
      { name: "筆", note: null, tags: ["細吹き", "シタデル", "下地"] },
    ];
    const result = mergeImportedTools(existing, imported);

    expect(result.updates).toEqual([
      { id: "utool_1", tags: ["細吹き", "下地", "シタデル"] },
    ]);
  });

  it("fills note only when existing note is null", () => {
    const existing = [
      makeTool({ id: "utool_1", name: "筆", note: null, tags: [] }),
      makeTool({
        id: "utool_2",
        name: "エアブラシ",
        note: "既存メモ",
        tags: [],
      }),
    ];
    const imported = [
      { name: "筆", note: "新しいメモ", tags: [] },
      { name: "エアブラシ", note: "上書きされないメモ", tags: [] },
    ];
    const result = mergeImportedTools(existing, imported);

    expect(result.updates).toEqual([
      { id: "utool_1", tags: [], note: "新しいメモ" },
      { id: "utool_2", tags: [] },
    ]);
  });

  it("collapses duplicate names within the imported file into a single entry", () => {
    const existing: UserToolRecord[] = [];
    const imported = [
      { name: "筆", note: null, tags: ["細吹き"] },
      { name: "  筆  ", note: "メモ", tags: ["下地"] },
    ];
    const result = mergeImportedTools(existing, imported);

    expect(result.addedCount).toBe(1);
    expect(result.added).toEqual([
      { name: "筆", note: "メモ", tags: ["細吹き", "下地"] },
    ]);
  });
});
