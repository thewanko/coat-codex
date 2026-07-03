import "../i18n";
import { beforeAll, beforeEach, describe, expect, test, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import i18next from "../i18n";
import HomePage from "./HomePage";
import ToastHost from "../components/common/ToastHost";
import { listRecipes } from "../db/recipeStore";
import type { RecipeDoc } from "../models/recipe";

beforeAll(() => {
  void i18next.changeLanguage("ja");
});

vi.mock("../db/recipeStore", async () => {
  const actual =
    await vi.importActual<typeof import("../db/recipeStore")>(
      "../db/recipeStore",
    );
  return {
    ...actual,
    listRecipes: vi.fn(),
  };
});

vi.mock("../db/photoStore", async () => {
  const actual =
    await vi.importActual<typeof import("../db/photoStore")>(
      "../db/photoStore",
    );
  return {
    ...actual,
    resolvePhotoUrl: vi.fn().mockResolvedValue(null),
  };
});

function makeRecipe(id: string, title: string): RecipeDoc {
  return {
    schemaVersion: 1,
    id,
    title,
    createdAt: "2026-06-01T00:00:00.000Z",
    updatedAt: "2026-06-01T00:00:00.000Z",
    overviewPhotoIds: [],
    palette: [],
    tools: [],
    baseSteps: [],
    parts: [],
  };
}

function renderHome() {
  return render(
    <MemoryRouter>
      <ToastHost>
        <HomePage />
      </ToastHost>
    </MemoryRouter>,
  );
}

describe("HomePage", () => {
  beforeEach(() => {
    vi.mocked(listRecipes).mockReset();
  });

  test("レシピ0件時、ヘッダーの新規作成ボタンは出さずEmptyState側のCTAのみ表示する（重複回避）", async () => {
    vi.mocked(listRecipes).mockResolvedValue([]);

    renderHome();

    expect(
      await screen.findByText("まだ秘伝書がありません"),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "最初の秘伝書を作る" }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "新規作成" }),
    ).not.toBeInTheDocument();
  });

  test("レシピ0件時、インポート導線を表示する（結線T33）", async () => {
    vi.mocked(listRecipes).mockResolvedValue([]);

    renderHome();

    const importButton = await screen.findByRole("button", {
      name: "JSONをインポート",
    });
    expect(importButton).not.toBeDisabled();
  });

  test("レシピ1件以上のとき、ヘッダーに新規作成ボタンを表示する", async () => {
    vi.mocked(listRecipes).mockResolvedValue([
      makeRecipe("rcp_1", "既存レシピ"),
    ]);

    renderHome();

    await waitFor(() => {
      expect(
        screen.getByRole("button", { name: "新規作成" }),
      ).toBeInTheDocument();
    });
    expect(screen.getByText("既存レシピ")).toBeInTheDocument();
  });

  test("レシピ1件以上のとき、ヘッダーにインポートボタンも並べて表示する", async () => {
    vi.mocked(listRecipes).mockResolvedValue([
      makeRecipe("rcp_1", "既存レシピ"),
    ]);

    renderHome();

    await waitFor(() => {
      expect(
        screen.getByRole("button", { name: "JSONをインポート" }),
      ).toBeInTheDocument();
    });
  });
});
