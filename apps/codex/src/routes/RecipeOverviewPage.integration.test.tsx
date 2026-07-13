// routes/RecipeOverviewPage.integration.test.tsx — 親子同時マウントの統合テスト
// （M8 T44レビューRound1 #2）
//
// RecipeOverviewPage（親）とPartEditorPage（子）を実router構造（親ルート＋子ネストルート）で
// マウントし、実物同士の同時マウント経路を通す。PartCardListは実物（dnd-kit経由）を使い、
// StepListのみ重い依存（PaintSlotList等）のためスタブ化する。
//
// 検証観点:
// ①パネル遷移後（/recipe/:id → /recipe/:id/part/:partId）に背面Overviewが
//   notFound表示へ落ちないこと（loadのオーナーが親に一本化され、子のload effectが
//   doc:nullリセットを起こさないことの確認＝#1の回帰テスト）。
// ②loadRecipeが1回しか呼ばれないこと（親子二重loadの解消確認）。

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
import RecipeOverviewPage from "./RecipeOverviewPage";
import PartEditorPage from "./PartEditorPage";
import ToastHost from "../components/common/ToastHost";
import { __resetRecipeStoreForTest } from "../stores/useRecipeStore";
import { reassignRecipeIds } from "@coat-codex/recipe-core";
import type { PaletteColor, RecipeDoc, Step } from "@coat-codex/recipe-core";

beforeAll(() => {
  void i18next.changeLanguage("ja");
});

vi.mock("../db/recipeStore", () => ({
  loadRecipe: vi.fn(),
  saveRecipe: vi.fn(),
}));

const deletePhotoMock = vi.fn<(photoId: string) => Promise<void>>();

vi.mock("../db/photoStore", async () => {
  const actual =
    await vi.importActual<typeof import("../db/photoStore")>(
      "../db/photoStore",
    );
  return {
    ...actual,
    resolvePhotoUrl: vi.fn().mockResolvedValue(null),
    deletePhoto: (photoId: string) => deletePhotoMock(photoId),
  };
});

vi.mock("../lib/storageHealth", async () => {
  const actual = await vi.importActual<typeof import("../lib/storageHealth")>(
    "../lib/storageHealth",
  );
  return {
    ...actual,
    readRecipeExport: vi.fn().mockResolvedValue(undefined),
    readReminderSnooze: vi.fn().mockResolvedValue(undefined),
  };
});

// StepList/PartEditorHeader/StepPhotoStripは重い依存（PaintSlotList等）を持つためスタブ化
// （既存PartEditorPage.test.tsxと同じ方針）。PartCardListは実物を使う。
vi.mock("../components/part-editor/StepList", () => ({
  default: ({
    steps,
  }: {
    steps: Step[];
    onChange: (index: number, next: Step) => void;
    onDelete: (index: number) => void;
    onReorder: (next: Step[]) => void;
    onAdd: (step: Step) => void;
    onAddColor: (color: PaletteColor) => void;
  }) => (
    <div data-testid="step-list-stub">
      <span data-testid="step-count">{steps.length}</span>
    </div>
  ),
}));

import { loadRecipe, saveRecipe } from "../db/recipeStore";

function makeStep(overrides: Partial<Step> & { id: string }): Step {
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

function makeDoc(overrides: Partial<RecipeDoc> = {}): RecipeDoc {
  return {
    schemaVersion: 3,
    id: "rcp_1",
    title: "テストレシピ",
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

function renderApp(path: string) {
  return render(
    <ToastHost>
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route path="/recipe/:id" element={<RecipeOverviewPage />}>
            <Route path="part/base" element={<PartEditorPage isBaseMode />} />
            <Route path="part/:partId" element={<PartEditorPage />} />
          </Route>
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
  deletePhotoMock.mockReset();
  deletePhotoMock.mockResolvedValue(undefined);
  __resetRecipeStoreForTest();
});

afterEach(() => {
  __resetRecipeStoreForTest();
});

describe("RecipeOverviewPage×PartEditorPage — 親子同時マウント統合テスト（M8 T44レビューRound1 #1/#2）", () => {
  test("パネル遷移後も背面Overviewはタイトル表示のままで、notFound表示へ落ちない。loadRecipeは1回のみ呼ばれる", async () => {
    vi.mocked(loadRecipe).mockResolvedValue(
      makeDoc({ parts: [{ id: "part_1", name: "腕", steps: [] }] }),
    );
    renderApp("/recipe/rcp_1");

    // 親Overviewの初期表示を待つ
    await waitFor(() => {
      expect(screen.getByText("テストレシピ")).toBeInTheDocument();
    });

    // パーツカード（実PartCard。role="button"のdiv要素、data-testid="part-card"）をクリックし、
    // 子ルートへ遷移させる。
    const partCards = screen.getAllByTestId("part-card");
    expect(partCards.length).toBeGreaterThan(0);
    fireEvent.click(partCards[0]);

    // 子ルート（PartEditorPage）が描画されるのを待つ
    await screen.findByTestId("step-list-stub");

    // ①背面Overviewが引き続きタイトル表示のままで、notFound表示へ落ちていないこと
    expect(screen.getByText("テストレシピ")).toBeInTheDocument();
    expect(
      screen.queryByText("レシピが見つかりません"),
    ).not.toBeInTheDocument();

    // ②loadRecipeが1回しか呼ばれていないこと（親子二重loadの解消）
    expect(vi.mocked(loadRecipe)).toHaveBeenCalledTimes(1);
  });

  test("パネル開→閉→開を繰り返してもloadRecipeは初回の1回のみで、背面表示は壊れない", async () => {
    vi.mocked(loadRecipe).mockResolvedValue(
      makeDoc({ parts: [{ id: "part_1", name: "腕", steps: [] }] }),
    );
    renderApp("/recipe/rcp_1");

    await waitFor(() => {
      expect(screen.getByText("テストレシピ")).toBeInTheDocument();
    });

    // 開く
    fireEvent.click(screen.getAllByTestId("part-card")[0]);
    await screen.findByTestId("step-list-stub");
    expect(screen.getByText("テストレシピ")).toBeInTheDocument();

    // 閉じる（PartEditorPageの閉じるボタン）
    fireEvent.click(screen.getByRole("button", { name: "閉じる" }));
    await waitFor(() => {
      expect(screen.queryByTestId("step-list-stub")).not.toBeInTheDocument();
    });
    expect(screen.getByText("テストレシピ")).toBeInTheDocument();
    expect(
      screen.queryByText("レシピが見つかりません"),
    ).not.toBeInTheDocument();

    // 再度開く
    fireEvent.click(screen.getAllByTestId("part-card")[0]);
    await screen.findByTestId("step-list-stub");
    expect(screen.getByText("テストレシピ")).toBeInTheDocument();
    expect(
      screen.queryByText("レシピが見つかりません"),
    ).not.toBeInTheDocument();

    expect(vi.mocked(loadRecipe)).toHaveBeenCalledTimes(1);
  });

  test("直接URLで子ルート(/recipe/:id/part/:partId)へアクセスしても、親Overviewが読み込まれ背面に表示される", async () => {
    vi.mocked(loadRecipe).mockResolvedValue(
      makeDoc({ parts: [{ id: "part_1", name: "腕", steps: [] }] }),
    );
    renderApp("/recipe/rcp_1/part/part_1");

    await waitFor(() => {
      expect(screen.getByText("テストレシピ")).toBeInTheDocument();
    });
    await screen.findByTestId("step-list-stub");
    expect(
      screen.queryByText("レシピが見つかりません"),
    ).not.toBeInTheDocument();
    expect(vi.mocked(loadRecipe)).toHaveBeenCalledTimes(1);
  });
});

describe("RecipeOverviewPage — パーツ削除（T50）", () => {
  test("削除ボタン→キャンセルではパーツ数・写真とも変化しない", async () => {
    vi.mocked(loadRecipe).mockResolvedValue(
      makeDoc({
        parts: [
          {
            id: "part_1",
            name: "腕",
            steps: [makeStep({ id: "step_1", photoId: "photo_arm" })],
          },
        ],
      }),
    );
    renderApp("/recipe/rcp_1");

    await waitFor(() => {
      expect(screen.getByText("テストレシピ")).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole("button", { name: "腕を削除" }));
    expect(
      screen.getByRole("dialog", { name: "「腕」を削除しますか？" }),
    ).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "キャンセル" }));

    await waitFor(() => {
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    });
    expect(screen.getAllByTestId("part-card")).toHaveLength(1);
    expect(deletePhotoMock).not.toHaveBeenCalled();
  });

  test("削除ボタン→確定でパーツが減り、他から参照されない写真はdeletePhotoされる", async () => {
    vi.mocked(loadRecipe).mockResolvedValue(
      makeDoc({
        parts: [
          {
            id: "part_1",
            name: "腕",
            steps: [makeStep({ id: "step_1", photoId: "photo_arm" })],
          },
          { id: "part_2", name: "胴体", steps: [] },
        ],
      }),
    );
    renderApp("/recipe/rcp_1");

    await waitFor(() => {
      expect(screen.getByText("テストレシピ")).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole("button", { name: "腕を削除" }));
    fireEvent.click(screen.getByRole("button", { name: "削除する" }));

    await waitFor(() => {
      expect(screen.getAllByTestId("part-card")).toHaveLength(1);
    });
    expect(screen.getByText("胴体")).toBeInTheDocument();
    await waitFor(() => {
      expect(deletePhotoMock).toHaveBeenCalledWith("photo_arm");
    });
  });

  test("削除対象パーツの写真が全体写真としても参照されている場合はdeletePhotoされない", async () => {
    vi.mocked(loadRecipe).mockResolvedValue(
      makeDoc({
        overviewPhotoIds: ["photo_shared"],
        parts: [
          {
            id: "part_1",
            name: "腕",
            steps: [makeStep({ id: "step_1", photoId: "photo_shared" })],
          },
        ],
      }),
    );
    renderApp("/recipe/rcp_1");

    await waitFor(() => {
      expect(screen.getByText("テストレシピ")).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole("button", { name: "腕を削除" }));
    fireEvent.click(screen.getByRole("button", { name: "削除する" }));

    await waitFor(() => {
      expect(screen.queryAllByTestId("part-card")).toHaveLength(0);
    });
    expect(deletePhotoMock).not.toHaveBeenCalled();
  });

  test("複製回帰: reassignRecipeIdsで新規採番された複製レシピのパーツを削除しても、元レシピの写真id(deletePhoto引数)は使われない", async () => {
    const sourceDoc = makeDoc({
      id: "rcp_source",
      parts: [
        {
          id: "part_1",
          name: "腕",
          steps: [makeStep({ id: "step_1", photoId: "photo_source_arm" })],
        },
      ],
    });
    const { recipe: duplicatedDoc } = reassignRecipeIds(sourceDoc);
    const duplicatedPart = duplicatedDoc.parts[0];
    const duplicatedPhotoId = duplicatedPart.steps[0]?.photoId;
    expect(duplicatedPhotoId).not.toBe("photo_source_arm");

    vi.mocked(loadRecipe).mockResolvedValue({ ...duplicatedDoc, id: "rcp_1" });
    renderApp("/recipe/rcp_1");

    await waitFor(() => {
      expect(screen.getByText("テストレシピ")).toBeInTheDocument();
    });

    fireEvent.click(
      screen.getByRole("button", { name: `${duplicatedPart.name}を削除` }),
    );
    fireEvent.click(screen.getByRole("button", { name: "削除する" }));

    await waitFor(() => {
      expect(deletePhotoMock).toHaveBeenCalledWith(duplicatedPhotoId);
    });
    expect(deletePhotoMock).not.toHaveBeenCalledWith("photo_source_arm");
  });
});
