// routes/RecipeSetupPage.test.tsx — RecipeSetupPageのテスト（技術計画v2.3 §4.2 T23）
//
// db/recipeStoreをモックしuseRecipeStore（実物）経由でのload連携・タイトル編集の
// autosave結線・ロード失敗/未存在の表示分岐を検証する。
// v2.3: 使用カラー先行登録（PaletteEditor）は廃止済みのため本ページからは検証しない。

import "../i18n";
import {
  beforeAll,
  beforeEach,
  afterEach,
  describe,
  expect,
  test,
  vi,
} from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Routes, Route } from "react-router";
import i18next from "../i18n";
import RecipeSetupPage from "./RecipeSetupPage";
import ToastHost from "../components/common/ToastHost";
import { __resetRecipeStoreForTest } from "../stores/useRecipeStore";
import type { RecipeDoc } from "../models/recipe";

beforeAll(() => {
  void i18next.changeLanguage("ja");
});

vi.mock("../db/recipeStore", () => ({
  loadRecipe: vi.fn(),
  saveRecipe: vi.fn(),
}));

vi.mock("../lib/paintPresets", () => ({
  loadBrandIndex: vi.fn().mockResolvedValue([]),
  loadBrandColors: vi.fn().mockResolvedValue([]),
  loadBrandColorsResult: vi
    .fn()
    .mockResolvedValue({ ok: false, reason: "index-unavailable" }),
}));

vi.mock("../db/photoStore", () => ({
  savePhoto: vi.fn(),
  resolvePhotoUrl: vi.fn().mockResolvedValue("blob:mock-url"),
  deletePhoto: vi.fn().mockResolvedValue(undefined),
}));

import { loadRecipe, saveRecipe } from "../db/recipeStore";

function makeDoc(overrides: Partial<RecipeDoc> = {}): RecipeDoc {
  return {
    schemaVersion: 1,
    id: "rcp_1",
    title: "テストレシピ",
    createdAt: "2026-07-01T00:00:00.000Z",
    updatedAt: "2026-07-01T00:00:00.000Z",
    overviewPhotoIds: [],
    palette: [],
    tools: [],
    baseSteps: [],
    parts: [],
    ...overrides,
  };
}

function renderPage(id = "rcp_1") {
  return render(
    <ToastHost>
      <MemoryRouter initialEntries={[`/recipe/${id}/setup`]}>
        <Routes>
          <Route path="/recipe/:id/setup" element={<RecipeSetupPage />} />
          <Route path="/recipe/:id" element={<div>Overview画面</div>} />
        </Routes>
      </MemoryRouter>
    </ToastHost>,
  );
}

beforeEach(() => {
  vi.mocked(loadRecipe).mockReset();
  vi.mocked(saveRecipe).mockReset();
  vi.mocked(saveRecipe).mockImplementation((doc: RecipeDoc) =>
    Promise.resolve(doc),
  );
  __resetRecipeStoreForTest();
});

afterEach(() => {
  __resetRecipeStoreForTest();
});

describe("RecipeSetupPage", () => {
  test("ロード成功時、タイトル・各セクション見出しが表示される", async () => {
    vi.mocked(loadRecipe).mockResolvedValue(makeDoc());
    renderPage();

    await waitFor(() => {
      expect(
        screen.getByRole("textbox", { name: "タイトル" }),
      ).toBeInTheDocument();
    });
    expect(screen.getByText("全体写真")).toBeInTheDocument();
    expect(screen.getByText("使用ツール")).toBeInTheDocument();
    expect(screen.getByText("make codex!")).toBeInTheDocument();
  });

  test("全体写真セクションに後日アップロード/変更が可能な旨の注記が表示される（FB-C）", async () => {
    vi.mocked(loadRecipe).mockResolvedValue(makeDoc());
    renderPage();

    await waitFor(() => {
      expect(
        screen.getByText("完成画像はあとからアップロード・変更できます"),
      ).toBeInTheDocument();
    });
  });

  test("レシピが存在しない場合（loadRecipeがnullを返す）はnot found表示になる", async () => {
    vi.mocked(loadRecipe).mockResolvedValue(null);
    renderPage("rcp_missing");

    await waitFor(() => {
      expect(
        screen.queryByRole("textbox", { name: "タイトル" }),
      ).not.toBeInTheDocument();
    });
  });

  test("loadRecipeが失敗した場合はエラー表示になる", async () => {
    vi.mocked(loadRecipe).mockRejectedValue(new Error("boom"));
    renderPage();

    await waitFor(() => {
      expect(
        screen.queryByRole("textbox", { name: "タイトル" }),
      ).not.toBeInTheDocument();
    });
  });

  test("タイトルをblurするとautosave（saveRecipe）が呼ばれる", async () => {
    vi.mocked(loadRecipe).mockResolvedValue(makeDoc());
    renderPage();

    const input = await screen.findByRole("textbox", { name: "タイトル" });

    vi.useFakeTimers({ shouldAdvanceTime: true });
    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: "新タイトル" } });
    fireEvent.blur(input);

    await vi.advanceTimersByTimeAsync(600);

    expect(saveRecipe).toHaveBeenCalledTimes(1);
    expect(vi.mocked(saveRecipe).mock.calls[0][0].title).toBe("新タイトル");
    vi.useRealTimers();
  });

  test("make codex!クリックで/recipe/:idへ遷移する", async () => {
    vi.mocked(loadRecipe).mockResolvedValue(makeDoc());
    renderPage();

    const button = await screen.findByText("make codex!");
    fireEvent.click(button);

    expect(screen.getByText("Overview画面")).toBeInTheDocument();
  });

  test("レシピ一覧へ戻るリンクが/を指す", async () => {
    vi.mocked(loadRecipe).mockResolvedValue(makeDoc());
    renderPage();

    await screen.findByRole("textbox", { name: "タイトル" });
    const link = screen.getByRole("link", { name: /レシピ一覧へ/ });
    expect(link).toHaveAttribute("href", "/");
  });
});
