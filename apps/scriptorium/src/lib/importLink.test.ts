// lib/importLink.test.ts — インポートリンク組み立ての単体テスト（技術計画v1 §6-2）

import { describe, expect, test } from "vitest";
import { buildImportLink, buildScriptoriumRecipeApiUrl } from "./importLink";

describe("buildScriptoriumRecipeApiUrl", () => {
  test("codex allowlistパターンと逐語一致するURLを組み立てる", () => {
    expect(buildScriptoriumRecipeApiUrl("scr_abc123")).toBe(
      "https://scriptorium.coat-codex.com/api/recipes/scr_abc123",
    );
  });
});

describe("buildImportLink", () => {
  test("coat-codex.comの?import=にencodeURIComponentしたAPI URLを付与する", () => {
    const link = buildImportLink("scr_abc123");
    expect(link).toBe(
      "https://coat-codex.com/?import=" +
        encodeURIComponent(
          "https://scriptorium.coat-codex.com/api/recipes/scr_abc123",
        ),
    );
  });

  test("特殊文字を含むIDでもencodeURIComponentされる", () => {
    const link = buildImportLink("scr_a b&c");
    expect(link).toContain(
      encodeURIComponent(
        "https://scriptorium.coat-codex.com/api/recipes/scr_a b&c",
      ),
    );
    expect(link).not.toContain(" ");
  });
});
