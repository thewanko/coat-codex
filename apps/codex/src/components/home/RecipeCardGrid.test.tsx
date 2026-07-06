import "../../i18n";
import { beforeAll, beforeEach, describe, expect, test, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import i18next from "../../i18n";
import RecipeCardGrid from "./RecipeCardGrid";
import ToastHost from "../common/ToastHost";
import { deleteRecipe, listRecipes } from "../../db/recipeStore";
import { deletePhotosForRecipe } from "../../db/photoStore";
import { readAllRecipeExports } from "../../lib/storageHealth";
import type { RecipeDoc } from "@coat-codex/recipe-core";

beforeAll(() => {
  void i18next.changeLanguage("ja");
});

vi.mock("../../db/recipeStore", async () => {
  const actual = await vi.importActual<typeof import("../../db/recipeStore")>(
    "../../db/recipeStore",
  );
  return {
    ...actual,
    listRecipes: vi.fn(),
    deleteRecipe: vi.fn().mockResolvedValue(undefined),
  };
});

vi.mock("../../db/photoStore", async () => {
  const actual = await vi.importActual<typeof import("../../db/photoStore")>(
    "../../db/photoStore",
  );
  return {
    ...actual,
    resolvePhotoUrl: vi.fn().mockResolvedValue(null),
    deletePhotosForRecipe: vi.fn().mockResolvedValue(0),
  };
});

// D-6（未バックアップドット）・§3.5リマインダー判定がlib/storageHealth経由でDexie(meta)を
// 読むため、fake-indexeddb非依存のこのテストではAPI非対応環境相当（空データ）にモックする。
vi.mock("../../lib/storageHealth", async () => {
  const actual = await vi.importActual<
    typeof import("../../lib/storageHealth")
  >("../../lib/storageHealth");
  return {
    ...actual,
    readAllRecipeExports: vi.fn().mockResolvedValue({}),
    readReminderSnooze: vi.fn().mockResolvedValue(undefined),
  };
});

function makeRecipe(id: string, title: string, updatedAt: string): RecipeDoc {
  return {
    schemaVersion: 3,
    id,
    title,
    createdAt: updatedAt,
    updatedAt,
    overviewPhotoIds: [],
    palette: [],
    tools: [],
    baseSteps: [],
    parts: [],
    photoCrops: {},
    source: null,
  };
}

function renderGrid() {
  return render(
    <MemoryRouter>
      <ToastHost>
        <RecipeCardGrid />
      </ToastHost>
    </MemoryRouter>,
  );
}

describe("RecipeCardGrid", () => {
  beforeEach(() => {
    vi.mocked(listRecipes).mockReset();
    vi.mocked(deleteRecipe).mockClear();
    vi.mocked(deletePhotosForRecipe).mockClear();
    vi.mocked(readAllRecipeExports).mockReset();
    vi.mocked(readAllRecipeExports).mockResolvedValue({});
  });

  test("ロード中はSkeleton(card)を表示する", async () => {
    let resolveList: (value: RecipeDoc[]) => void = () => {};
    vi.mocked(listRecipes).mockReturnValue(
      new Promise((resolve) => {
        resolveList = resolve;
      }),
    );

    renderGrid();
    expect(screen.getByTestId("recipe-grid-loading")).toBeInTheDocument();

    resolveList([]);
    await waitFor(() =>
      expect(
        screen.queryByTestId("recipe-grid-loading"),
      ).not.toBeInTheDocument(),
    );
  });

  test("0件時はEmptyState(home)を表示する", async () => {
    vi.mocked(listRecipes).mockResolvedValue([]);

    renderGrid();

    expect(
      await screen.findByText("まだ秘伝書がありません"),
    ).toBeInTheDocument();
  });

  test("一覧をRecipeCardとして表示する（updatedAt降順はlistRecipesの責務）", async () => {
    vi.mocked(listRecipes).mockResolvedValue([
      makeRecipe("rcp_1", "新しい方", "2026-06-15T00:00:00.000Z"),
      makeRecipe("rcp_2", "古い方", "2026-06-01T00:00:00.000Z"),
    ]);

    renderGrid();

    expect(await screen.findByText("新しい方")).toBeInTheDocument();
    expect(screen.getByText("古い方")).toBeInTheDocument();
    expect(screen.getAllByTestId("recipe-card")).toHaveLength(2);
  });

  test("削除確認→確定でdeletePhotosForRecipeとdeleteRecipeが呼ばれ、一覧から除かれる", async () => {
    vi.mocked(listRecipes).mockResolvedValue([
      makeRecipe("rcp_1", "削除対象", "2026-06-15T00:00:00.000Z"),
    ]);

    renderGrid();
    await screen.findByText("削除対象");

    fireEvent.click(screen.getByLabelText("メニュー"));
    fireEvent.click(screen.getByRole("menuitem", { name: "削除" }));

    const dialog = await screen.findByRole("dialog");
    expect(dialog).toHaveTextContent("削除対象");

    fireEvent.click(screen.getByRole("button", { name: "削除する" }));

    await waitFor(() => {
      expect(deletePhotosForRecipe).toHaveBeenCalledWith("rcp_1");
    });
    expect(deleteRecipe).toHaveBeenCalledWith("rcp_1");
    await waitFor(() => {
      expect(screen.queryByText("削除対象")).not.toBeInTheDocument();
    });
  });

  test("削除キャンセルでは何も呼ばれない", async () => {
    vi.mocked(listRecipes).mockResolvedValue([
      makeRecipe("rcp_1", "残す", "2026-06-15T00:00:00.000Z"),
    ]);

    renderGrid();
    await screen.findByText("残す");

    fireEvent.click(screen.getByLabelText("メニュー"));
    fireEvent.click(screen.getByRole("menuitem", { name: "削除" }));
    await screen.findByRole("dialog");

    fireEvent.click(screen.getByRole("button", { name: "キャンセル" }));

    expect(deletePhotosForRecipe).not.toHaveBeenCalled();
    expect(deleteRecipe).not.toHaveBeenCalled();
    expect(screen.getByText("残す")).toBeInTheDocument();
  });

  test("onCountChangeにロード完了時の件数を通知する", async () => {
    vi.mocked(listRecipes).mockResolvedValue([
      makeRecipe("rcp_1", "A", "2026-06-15T00:00:00.000Z"),
    ]);
    const onCountChange = vi.fn();

    render(
      <MemoryRouter>
        <ToastHost>
          <RecipeCardGrid onCountChange={onCountChange} />
        </ToastHost>
      </MemoryRouter>,
    );

    await waitFor(() => expect(onCountChange).toHaveBeenCalledWith(1));
  });

  test("D-6: recipeExport:<id>が無いレシピは未バックアップドットが表示される", async () => {
    vi.mocked(listRecipes).mockResolvedValue([
      makeRecipe("rcp_1", "未バックアップ", "2026-06-15T00:00:00.000Z"),
    ]);
    vi.mocked(readAllRecipeExports).mockResolvedValue({});

    const { container } = renderGrid();
    await screen.findByText("未バックアップ");

    const dot = container.querySelector("[data-visible]");
    expect(dot).toHaveAttribute("data-visible", "true");
  });

  test("D-6: recipeExport:<id>がupdatedAt以降なら未バックアップドットは表示されない", async () => {
    vi.mocked(listRecipes).mockResolvedValue([
      makeRecipe("rcp_1", "バックアップ済み", "2026-06-15T00:00:00.000Z"),
    ]);
    vi.mocked(readAllRecipeExports).mockResolvedValue({
      rcp_1: "2026-06-16T00:00:00.000Z",
    });

    const { container } = renderGrid();
    await screen.findByText("バックアップ済み");

    const dot = container.querySelector("[data-visible]");
    expect(dot).toHaveAttribute("data-visible", "false");
  });

  test("D-6: recipeExport:<id>がupdatedAtより古いレシピは未バックアップドットが表示される", async () => {
    vi.mocked(listRecipes).mockResolvedValue([
      makeRecipe("rcp_1", "編集後未再エクスポート", "2026-06-15T00:00:00.000Z"),
    ]);
    vi.mocked(readAllRecipeExports).mockResolvedValue({
      rcp_1: "2026-06-01T00:00:00.000Z",
    });

    const { container } = renderGrid();
    await screen.findByText("編集後未再エクスポート");

    const dot = container.querySelector("[data-visible]");
    expect(dot).toHaveAttribute("data-visible", "true");
  });

  test("onReminderTargetsChangeにリマインダー対象レシピ一覧を通知する（未エクスポートを含む）", async () => {
    vi.mocked(listRecipes).mockResolvedValue([
      makeRecipe("rcp_1", "未エクスポート", "2026-06-15T00:00:00.000Z"),
    ]);
    vi.mocked(readAllRecipeExports).mockResolvedValue({});
    const onReminderTargetsChange = vi.fn();

    render(
      <MemoryRouter>
        <ToastHost>
          <RecipeCardGrid onReminderTargetsChange={onReminderTargetsChange} />
        </ToastHost>
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(onReminderTargetsChange).toHaveBeenCalledWith([
        expect.objectContaining({ id: "rcp_1" }),
      ]);
    });
  });

  test("onReminderTargetsChangeはバックアップ済みレシピを対象から除外する", async () => {
    vi.mocked(listRecipes).mockResolvedValue([
      makeRecipe("rcp_1", "バックアップ済み", "2026-06-15T00:00:00.000Z"),
    ]);
    vi.mocked(readAllRecipeExports).mockResolvedValue({
      rcp_1: "2026-06-16T00:00:00.000Z",
    });
    const onReminderTargetsChange = vi.fn();

    render(
      <MemoryRouter>
        <ToastHost>
          <RecipeCardGrid onReminderTargetsChange={onReminderTargetsChange} />
        </ToastHost>
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(onReminderTargetsChange).toHaveBeenCalledWith([]);
    });
  });
});
