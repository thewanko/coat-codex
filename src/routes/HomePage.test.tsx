import "../i18n";
import { beforeAll, beforeEach, describe, expect, test, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import i18next from "../i18n";
import HomePage from "./HomePage";
import ToastHost from "../components/common/ToastHost";
import { listRecipes } from "../db/recipeStore";
import { checkPersisted, readAllRecipeExports } from "../lib/storageHealth";
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

// StorageStatusBar/ExportReminderBanner（T34）がlib/storageHealth経由でDexie(meta)を
// 読むため、fake-indexeddb非依存のこのテストではAPI非対応環境相当（undefined/空）にモックする。
vi.mock("../lib/storageHealth", async () => {
  const actual = await vi.importActual<typeof import("../lib/storageHealth")>(
    "../lib/storageHealth",
  );
  return {
    ...actual,
    checkPersisted: vi.fn().mockResolvedValue(undefined),
    estimateUsage: vi.fn().mockResolvedValue(undefined),
    readAllRecipeExports: vi.fn().mockResolvedValue({}),
    readReminderSnooze: vi.fn().mockResolvedValue(undefined),
    readRecipeExport: vi.fn().mockResolvedValue(undefined),
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
    photoCrops: {},
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
    vi.mocked(checkPersisted).mockReset().mockResolvedValue(undefined);
    vi.mocked(readAllRecipeExports).mockReset().mockResolvedValue({});
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

  test("レシピ1件以上のとき、StorageStatusBarを表示する", async () => {
    vi.mocked(listRecipes).mockResolvedValue([
      makeRecipe("rcp_1", "既存レシピ"),
    ]);

    renderHome();

    expect(await screen.findByTestId("storage-status-bar")).toBeInTheDocument();
  });

  test("レシピ0件のときはStorageStatusBarを表示しない", async () => {
    vi.mocked(listRecipes).mockResolvedValue([]);

    renderHome();

    await screen.findByText("まだ秘伝書がありません");
    expect(screen.queryByTestId("storage-status-bar")).not.toBeInTheDocument();
  });

  test("未エクスポートのレシピが1件でもあればExportReminderBanner(full)を表示する", async () => {
    vi.mocked(listRecipes).mockResolvedValue([
      makeRecipe("rcp_1", "未バックアップ"),
    ]);
    vi.mocked(readAllRecipeExports).mockResolvedValue({});

    renderHome();

    expect(
      await screen.findByTestId("export-reminder-banner"),
    ).toBeInTheDocument();
  });

  test("全レシピがバックアップ済みならExportReminderBanner(full)は表示しない", async () => {
    vi.mocked(listRecipes).mockResolvedValue([
      makeRecipe("rcp_1", "バックアップ済み"),
    ]);
    vi.mocked(readAllRecipeExports).mockResolvedValue({
      rcp_1: "2026-06-02T00:00:00.000Z",
    });

    renderHome();

    await screen.findByText("バックアップ済み");
    expect(
      screen.queryByTestId("export-reminder-banner"),
    ).not.toBeInTheDocument();
  });

  test("ヒーロー（LIBRARY・YOUR CODEX・和文gloss）を常時表示する（0件時も含む）", async () => {
    vi.mocked(listRecipes).mockResolvedValue([]);

    renderHome();

    await screen.findByText("まだ秘伝書がありません");
    expect(screen.getByText("LIBRARY")).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: "YOUR CODEX" }),
    ).toBeInTheDocument();
    expect(screen.getByText("あなたの秘伝書")).toBeInTheDocument();
  });

  test("レシピ0件時はヒーローにVOLUMES行を表示しない", async () => {
    vi.mocked(listRecipes).mockResolvedValue([]);

    renderHome();

    await screen.findByText("まだ秘伝書がありません");
    expect(screen.queryByText(/VOLUMES/)).not.toBeInTheDocument();
  });

  test("レシピ1件以上のとき、ヒーローに{{count}} VOLUMESを表示する", async () => {
    vi.mocked(listRecipes).mockResolvedValue([
      makeRecipe("rcp_1", "既存レシピ"),
    ]);

    renderHome();

    await waitFor(() => {
      expect(screen.getByText("1 VOLUMES")).toBeInTheDocument();
    });
  });

  test("使い方ガイドへの導線リンクを表示する", async () => {
    vi.mocked(listRecipes).mockResolvedValue([]);

    renderHome();

    await screen.findByText("まだ秘伝書がありません");
    expect(
      screen.getByRole("link", { name: "使い方ガイド ›" }),
    ).toHaveAttribute("href", "/help");
  });
});
