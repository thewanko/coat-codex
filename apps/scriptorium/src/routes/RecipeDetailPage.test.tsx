// routes/RecipeDetailPage.test.tsx — シード相当fixtureでの表示・警告・分岐テスト
// （技術計画v1 §5.1・§5.2・§7 ST-15）
//
// mix合計≠100の工程を含むPublishedRecipeでMixBadge警告出現・カスタム技法label表示・
// coverなし分岐・notFound分岐・インポートリンクのhref逐語を検証する。

import "../i18n";
import { beforeAll, describe, expect, test, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router";
import { PhotoSourceProvider } from "@coat-codex/recipe-ui";
import type { PublishedRecipe } from "@coat-codex/recipe-core";
import i18next from "../i18n";
import RecipeDetailPage from "./RecipeDetailPage";
import type { RecipeDetailResponse } from "../lib/api";

async function resolveNoPhoto(): Promise<string | null> {
  return null;
}

function jsonResponse(body: unknown, ok = true, status = 200): Response {
  return { ok, status, json: async () => body } as Response;
}

const PUBLISHED_RECIPE: PublishedRecipe = {
  scriptoriumSchemaVersion: 1,
  title: "Weathered Tank",
  palette: [
    {
      id: "col_1",
      source: "preset",
      brand: "Citadel",
      name: "Mephiston Red",
      presetId: "preset_mephiston_red",
      hex: "#7A2E1F",
    },
    {
      id: "col_2",
      source: "custom",
      brand: null,
      name: "Custom Grey",
      presetId: null,
      hex: "#888888",
    },
  ],
  tools: [{ id: "tool_1", name: "Small brush", note: "size 0" }],
  baseSteps: [
    {
      id: "step_base_1",
      technique: { presetKey: "basecoat", label: null },
      paints: [{ colorId: "col_1" }],
      mix: null,
      toolIds: ["tool_1"],
    },
  ],
  parts: [
    {
      id: "part_1",
      name: "Hull",
      steps: [
        {
          id: "step_1",
          technique: { presetKey: null, label: "Custom stippling" },
          paints: [{ colorId: "col_1" }, { colorId: "col_2" }],
          // mix合計70 ≠ 100 → MixBadge警告出現を検証する
          mix: [50, 20],
          toolIds: [],
        },
      ],
    },
  ],
};

function renderDetailPage(id = "scr_1") {
  return render(
    <MemoryRouter initialEntries={[`/r/${id}`]}>
      <PhotoSourceProvider resolvePhotoUrl={resolveNoPhoto}>
        <Routes>
          <Route path="/r/:id" element={<RecipeDetailPage />} />
        </Routes>
      </PhotoSourceProvider>
    </MemoryRouter>,
  );
}

describe("RecipeDetailPage", () => {
  beforeAll(async () => {
    await i18next.changeLanguage("en");
  });

  test("fixtureのレシピをレンダーし、MixBadge警告・カスタム技法labelを表示する", async () => {
    const detail: RecipeDetailResponse = {
      id: "scr_1",
      handle: "painter1",
      lang: "en",
      publishedAt: "2026-07-01T00:00:00.000Z",
      coverUrl: "/img/covers/scr_1.webp",
      thumbUrl: "/img/thumbs/scr_1.webp",
      recipe: PUBLISHED_RECIPE,
    };
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse(detail)));

    renderDetailPage();

    expect(await screen.findByText("Weathered Tank")).toBeInTheDocument();
    expect(screen.getByText("@painter1")).toBeInTheDocument();

    // step-list-row（baseSteps 1件 + parts[0].steps 1件）
    const rows = await screen.findAllByTestId("step-list-row");
    expect(rows).toHaveLength(2);

    // mix合計70%の警告バッジ（mix.badgeWarning）
    expect(screen.getByText("⚠ Total 70%")).toBeInTheDocument();

    // カスタム技法label（presetKey:null, label:"Custom stippling"）
    expect(screen.getByText("Custom stippling")).toBeInTheDocument();

    // ツールのnoteが表示される
    expect(screen.getByText("size 0")).toBeInTheDocument();

    // coverUrl非null → cover画像を表示
    const coverImg = document.querySelector(
      "img[src='/img/covers/scr_1.webp']",
    );
    expect(coverImg).not.toBeNull();

    // インポートリンクのhref逐語
    const importLink = screen.getByTestId("import-link");
    expect(importLink).toHaveAttribute(
      "href",
      "https://coat-codex.com/?import=" +
        encodeURIComponent(
          "https://scriptorium.coat-codex.com/api/recipes/scr_1",
        ),
    );

    vi.unstubAllGlobals();
  });

  test("coverUrlがnullならcover画像を描画しない", async () => {
    const detail: RecipeDetailResponse = {
      id: "scr_2",
      handle: "painter2",
      lang: "en",
      publishedAt: "2026-07-01T00:00:00.000Z",
      coverUrl: null,
      thumbUrl: null,
      recipe: PUBLISHED_RECIPE,
    };
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse(detail)));

    renderDetailPage("scr_2");

    expect(await screen.findByText("Weathered Tank")).toBeInTheDocument();
    // coverUrl=nullなのでcover画像は描画されない（SwatchChipはvariant=hexでimgを使わない）
    expect(document.querySelector("img")).toBeNull();

    vi.unstubAllGlobals();
  });

  test("404時はnotFound表示とFeedへ戻るLinkを出す", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValue(jsonResponse({ error: "not found" }, false, 404)),
    );

    renderDetailPage("scr_missing");

    expect(
      await screen.findByText("This recipe was not found."),
    ).toBeInTheDocument();
    const backLink = screen.getByRole("link", {
      name: "Back to new recipes",
    });
    expect(backLink).toHaveAttribute("href", "/");

    vi.unstubAllGlobals();
  });
});
