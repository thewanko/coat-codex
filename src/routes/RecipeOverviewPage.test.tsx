// routes/RecipeOverviewPage.test.tsx — RecipeOverviewPageのテスト（技術計画v2.2 §4.2 T28）
//
// db/recipeStoreをモックしuseRecipeStore（実物）経由でのload連携・ロード中/不存在/
// loadError分岐・onSaveError購読でのトースト表示・パーツ並び替え/追加時のupdateRecipe
// 呼び出し（参照同一性はtoBeで検証=M4必須事項②）・ベース工程編集への遷移・パーツ詳細への
// 遷移を検証する。PartCardListは重い依存（dnd-kit経由のPartCard等）を持つためモックする。

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
import ToastHost from "../components/common/ToastHost";
import {
  __resetRecipeStoreForTest,
  useRecipeStore,
} from "../stores/useRecipeStore";
import { StorageQuotaError } from "../db/photoStore";
import { readRecipeExport } from "../lib/storageHealth";
import type { RecipeDoc } from "../models/recipe";

type RecipePart = RecipeDoc["parts"][number];

beforeAll(() => {
  void i18next.changeLanguage("ja");
});

vi.mock("../db/recipeStore", () => ({
  loadRecipe: vi.fn(),
  saveRecipe: vi.fn(),
}));

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

// ExportReminderBanner(compact)（T34）がlib/storageHealth経由でDexie(meta)を読むため、
// fake-indexeddb非依存のこのテストではAPI非対応環境相当（undefined）にモックする。
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

vi.mock("../components/overview/PartCardList", () => ({
  default: ({
    parts,
    onOpen,
    onReorder,
    onAdd,
  }: {
    parts: RecipePart[];
    onOpen: (partId: string) => void;
    onReorder: (next: RecipePart[]) => void;
    onAdd: (part: RecipePart) => void;
  }) => (
    <div data-testid="part-card-list-stub">
      <span data-testid="part-count">{parts.length}</span>
      <button type="button" onClick={() => onOpen("part_1")}>
        open-part-1
      </button>
      <button type="button" onClick={() => onReorder([...parts].reverse())}>
        reorder
      </button>
      <button
        type="button"
        onClick={() => onAdd({ id: "part_new", name: "新パーツ", steps: [] })}
      >
        add-part
      </button>
    </div>
  ),
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

function renderPage(path: string) {
  return render(
    <ToastHost>
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route path="/recipe/:id" element={<RecipeOverviewPage />} />
          <Route
            path="/recipe/:id/part/base"
            element={<div>ベース工程編集画面</div>}
          />
          <Route
            path="/recipe/:id/part/:partId"
            element={<div>パーツ編集画面</div>}
          />
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
  vi.mocked(readRecipeExport).mockReset().mockResolvedValue(undefined);
  __resetRecipeStoreForTest();
});

afterEach(() => {
  __resetRecipeStoreForTest();
});

describe("RecipeOverviewPage — ロード状態分岐", () => {
  test("ロード成功時はタイトルとパーツ一覧を表示する", async () => {
    vi.mocked(loadRecipe).mockResolvedValue(
      makeDoc({ parts: [{ id: "part_1", name: "腕", steps: [] }] }),
    );
    renderPage("/recipe/rcp_1");

    await waitFor(() => {
      expect(screen.getByText("テストレシピ")).toBeInTheDocument();
    });
    expect(screen.getByTestId("part-count")).toHaveTextContent("1");
  });

  test("loadError時はエラーメッセージを表示する", async () => {
    vi.mocked(loadRecipe).mockRejectedValue(new Error("boom"));
    renderPage("/recipe/rcp_1");

    await waitFor(() => {
      expect(
        screen.getByText("レシピの読み込みに失敗しました"),
      ).toBeInTheDocument();
    });
  });
});

describe("RecipeOverviewPage — PartCardListへのprops変換（updateRecipe呼び出し・参照同一性）", () => {
  test("onReorderはpartsを渡された配列で差し替える", async () => {
    const p1: RecipePart = { id: "part_1", name: "腕", steps: [] };
    const p2: RecipePart = { id: "part_2", name: "脚", steps: [] };
    vi.mocked(loadRecipe).mockResolvedValue(makeDoc({ parts: [p1, p2] }));
    renderPage("/recipe/rcp_1");

    await screen.findByTestId("part-card-list-stub");
    fireEvent.click(screen.getByText("reorder"));

    const nextDoc = useRecipeStore.getState().doc;
    expect(nextDoc?.parts).toEqual([p2, p1]);
    expect(nextDoc?.parts[0]).toBe(p2);
    expect(nextDoc?.parts[1]).toBe(p1);
  });

  test("onAddはpartsへスプレッド追加し、既存part要素の参照を保つ", async () => {
    const existingPart: RecipePart = { id: "part_1", name: "腕", steps: [] };
    vi.mocked(loadRecipe).mockResolvedValue(makeDoc({ parts: [existingPart] }));
    renderPage("/recipe/rcp_1");

    await screen.findByTestId("part-card-list-stub");
    fireEvent.click(screen.getByText("add-part"));

    const nextDoc = useRecipeStore.getState().doc;
    expect(nextDoc?.parts).toHaveLength(2);
    expect(nextDoc?.parts[0]).toBe(existingPart);
    expect(nextDoc?.parts[1].id).toBe("part_new");
  });

  test("onOpenは/recipe/:id/part/:partIdへnavigateする", async () => {
    vi.mocked(loadRecipe).mockResolvedValue(
      makeDoc({ parts: [{ id: "part_1", name: "腕", steps: [] }] }),
    );
    renderPage("/recipe/rcp_1");

    await screen.findByTestId("part-card-list-stub");
    fireEvent.click(screen.getByText("open-part-1"));

    expect(screen.getByText("パーツ編集画面")).toBeInTheDocument();
  });

  test("add-partはpartを追加した上で新規パーツの編集画面へnavigateする", async () => {
    vi.mocked(loadRecipe).mockResolvedValue(makeDoc({ parts: [] }));
    renderPage("/recipe/rcp_1");

    await screen.findByTestId("part-card-list-stub");
    fireEvent.click(screen.getByText("add-part"));

    expect(screen.getByText("パーツ編集画面")).toBeInTheDocument();
  });
});

describe("RecipeOverviewPage — ベース工程編集への遷移", () => {
  test("ベース工程0件時の破線ピルをタップすると/recipe/:id/part/baseへnavigateする", async () => {
    vi.mocked(loadRecipe).mockResolvedValue(makeDoc({ baseSteps: [] }));
    renderPage("/recipe/rcp_1");

    await waitFor(() => {
      expect(
        screen.getByRole("button", { name: "＋ ベース工程を追加" }),
      ).toBeInTheDocument();
    });
    fireEvent.click(
      screen.getByRole("button", { name: "＋ ベース工程を追加" }),
    );

    expect(screen.getByText("ベース工程編集画面")).toBeInTheDocument();
  });
});

describe("RecipeOverviewPage — onSaveError購読でのトースト表示", () => {
  test("StorageQuotaErrorの場合はstorageQuotaメッセージをトースト表示する", async () => {
    const p1: RecipePart = { id: "part_1", name: "腕", steps: [] };
    const p2: RecipePart = { id: "part_2", name: "脚", steps: [] };
    vi.mocked(loadRecipe).mockResolvedValue(makeDoc({ parts: [p1, p2] }));
    vi.mocked(saveRecipe).mockRejectedValue(new StorageQuotaError());
    renderPage("/recipe/rcp_1");

    await screen.findByTestId("part-card-list-stub");

    // reorder（navigateしないアクション）でupdateRecipeを発火させる。add-partはnavigateを
    // 伴いRecipeOverviewPageがアンマウントされるため、onSaveError購読の検証には使えない。
    vi.useFakeTimers({ shouldAdvanceTime: true });
    fireEvent.click(screen.getByText("reorder"));
    await vi.advanceTimersByTimeAsync(600);
    vi.useRealTimers();

    await waitFor(() => {
      expect(
        screen.getByText(
          "容量不足です。写真を減らすか、バックアップ後に不要なレシピを削除してください",
        ),
      ).toBeInTheDocument();
    });
  });
});

describe("RecipeOverviewPage — 戻るリンク", () => {
  test("レシピ一覧へ戻るリンクが/を指す", async () => {
    vi.mocked(loadRecipe).mockResolvedValue(makeDoc());
    renderPage("/recipe/rcp_1");

    await waitFor(() => {
      expect(screen.getByText("テストレシピ")).toBeInTheDocument();
    });
    const link = screen.getByRole("link", { name: /レシピ一覧へ/ });
    expect(link).toHaveAttribute("href", "/");
  });
});

describe("RecipeOverviewPage — ExportReminderBanner(compact)（§3.5・T34）", () => {
  test("未エクスポートのレシピはコンパクト帯を表示する", async () => {
    vi.mocked(loadRecipe).mockResolvedValue(makeDoc());
    vi.mocked(readRecipeExport).mockResolvedValue(undefined);
    renderPage("/recipe/rcp_1");

    expect(
      await screen.findByTestId("export-reminder-banner"),
    ).toBeInTheDocument();
  });

  test("recipeExport:<id>がupdatedAt以降ならコンパクト帯を表示しない", async () => {
    vi.mocked(loadRecipe).mockResolvedValue(
      makeDoc({ updatedAt: "2026-07-01T00:00:00.000Z" }),
    );
    vi.mocked(readRecipeExport).mockResolvedValue("2026-07-02T00:00:00.000Z");
    renderPage("/recipe/rcp_1");

    await waitFor(() => {
      expect(screen.getByText("テストレシピ")).toBeInTheDocument();
    });
    expect(
      screen.queryByTestId("export-reminder-banner"),
    ).not.toBeInTheDocument();
  });
});
