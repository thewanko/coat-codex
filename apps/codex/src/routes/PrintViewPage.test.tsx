// routes/PrintViewPage.test.tsx — PrintViewPageのテスト（技術計画v2.2 §4.2 T36）
//
// db/recipeStoreをモックしuseRecipeStore（実物）経由でのload連携・ロード成功時の
// タイトル/パレット行/工程行/混合バッジ（合計≠100の警告継承）表示・写真なし工程の
// 空セル表示・レシピ不在時（loadError/notFound）分岐を検証する。resolvePhotoUrlは
// photoStore.tsのモックで解決有無を切り替える。

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
import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Routes, Route } from "react-router";
import i18next from "../i18n";
import PrintViewPage from "./PrintViewPage";
import {
  __resetRecipeStoreForTest,
  useRecipeStore,
} from "../stores/useRecipeStore";
import type { RecipeDoc } from "@coat-codex/recipe-core";

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

import { loadRecipe } from "../db/recipeStore";
import { resolvePhotoUrl } from "../db/photoStore";

function makeDoc(overrides: Partial<RecipeDoc> = {}): RecipeDoc {
  return {
    schemaVersion: 3,
    id: "rcp_1",
    title: "テストレシピ",
    createdAt: "2026-07-01T00:00:00.000Z",
    updatedAt: "2026-07-02T00:00:00.000Z",
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

function renderPage(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/recipe/:id/print" element={<PrintViewPage />} />
      </Routes>
    </MemoryRouter>,
  );
}

beforeEach(() => {
  vi.mocked(loadRecipe).mockReset();
  __resetRecipeStoreForTest();
});

afterEach(() => {
  __resetRecipeStoreForTest();
});

describe("PrintViewPage — ロード状態分岐", () => {
  test("loadError時はprint.loadErrorメッセージを表示する", async () => {
    vi.mocked(loadRecipe).mockRejectedValue(new Error("boom"));
    renderPage("/recipe/rcp_1/print");

    await waitFor(() => {
      expect(
        screen.getByText("レシピの読み込みに失敗しました"),
      ).toBeInTheDocument();
    });
  });

  test("doc取得後nullになるケース（不存在）はprint.notFoundメッセージを表示する", async () => {
    vi.mocked(loadRecipe).mockResolvedValue(makeDoc());
    renderPage("/recipe/rcp_1/print");
    await waitFor(() => {
      expect(useRecipeStore.getState().doc).not.toBeNull();
    });

    // 不存在遷移の再現: ストアのdocを直接nullへ戻す
    useRecipeStore.setState({ doc: null, isLoading: false, loadError: null });

    await waitFor(() => {
      expect(screen.getByText("レシピが見つかりません")).toBeInTheDocument();
    });
  });
});

describe("PrintViewPage — PrintRecipeSheetのレンダリング", () => {
  test("タイトル・パレット行・工程行・写真なし工程の空セルを表示する", async () => {
    const doc = makeDoc({
      title: "宵闇の騎士",
      palette: [
        {
          id: "col_1",
          source: "preset",
          brand: "Citadel",
          name: "アバドンブラック",
          presetId: "preset_1",
          hex: "#2D2A2B",
          chipPhotoId: null,
        },
      ],
      baseSteps: [
        {
          id: "step_1",
          technique: { presetKey: "prime", label: null },
          photoId: null,
          paints: [{ colorId: "col_1" }],
          mix: null,
          toolIds: [],
          memo: "",
        },
      ],
      parts: [
        {
          id: "part_1",
          name: "兜",
          steps: [
            {
              id: "step_2",
              technique: { presetKey: "layer", label: null },
              photoId: null,
              paints: [{ colorId: "col_1" }],
              mix: null,
              toolIds: [],
              memo: "",
            },
          ],
        },
      ],
    });
    vi.mocked(loadRecipe).mockResolvedValue(doc);
    renderPage("/recipe/rcp_1/print");

    await waitFor(() => {
      expect(screen.getByText("宵闇の騎士")).toBeInTheDocument();
    });

    expect(screen.getByTestId("print-recipe-sheet")).toBeInTheDocument();
    expect(screen.getAllByText("アバドンブラック").length).toBeGreaterThan(0);
    expect(screen.getAllByTestId("print-step-row")).toHaveLength(2);
    expect(screen.getAllByTestId("print-step-photo-empty")).toHaveLength(2);
  });

  test("合計≠100の工程は警告バッジを表示する（§2.3の継承）", async () => {
    const doc = makeDoc({
      palette: [
        {
          id: "col_1",
          source: "preset",
          brand: "Citadel",
          name: "アバドンブラック",
          presetId: "preset_1",
          hex: "#2D2A2B",
          chipPhotoId: null,
        },
        {
          id: "col_2",
          source: "preset",
          brand: "Citadel",
          name: "メフィストンレッド",
          presetId: "preset_2",
          hex: "#960F0F",
          chipPhotoId: null,
        },
      ],
      parts: [
        {
          id: "part_1",
          name: "兜",
          steps: [
            {
              id: "step_1",
              technique: { presetKey: "layer", label: null },
              photoId: null,
              paints: [{ colorId: "col_1" }, { colorId: "col_2" }],
              mix: [60, 50],
              toolIds: [],
              memo: "",
            },
          ],
        },
      ],
    });
    vi.mocked(loadRecipe).mockResolvedValue(doc);
    renderPage("/recipe/rcp_1/print");

    await waitFor(() => {
      expect(screen.getByTestId("print-mix-warning")).toBeInTheDocument();
    });
    expect(screen.getByTestId("print-mix-warning")).toHaveTextContent(
      "⚠ 計 110%",
    );
  });

  test("工程写真ありの場合は写真セルを表示する", async () => {
    const doc = makeDoc({
      palette: [
        {
          id: "col_1",
          source: "preset",
          brand: "Citadel",
          name: "アバドンブラック",
          presetId: "preset_1",
          hex: "#2D2A2B",
          chipPhotoId: null,
        },
      ],
      parts: [
        {
          id: "part_1",
          name: "兜",
          steps: [
            {
              id: "step_1",
              technique: { presetKey: "layer", label: null },
              photoId: "ph_1",
              paints: [],
              mix: null,
              toolIds: [],
              memo: "",
            },
          ],
        },
      ],
    });
    vi.mocked(loadRecipe).mockResolvedValue(doc);
    renderPage("/recipe/rcp_1/print");

    await waitFor(() => {
      expect(screen.getByTestId("print-step-photo")).toBeInTheDocument();
    });
    expect(
      screen.queryByTestId("print-step-photo-empty"),
    ).not.toBeInTheDocument();
  });

  test("パレット行のSwatchChipは空のラベルspanを生成しない（レビュー指摘4）", async () => {
    const doc = makeDoc({
      palette: [
        {
          id: "col_1",
          source: "preset",
          brand: "Citadel",
          name: "アバドンブラック",
          presetId: "preset_1",
          hex: "#2D2A2B",
          chipPhotoId: null,
        },
      ],
    });
    vi.mocked(loadRecipe).mockResolvedValue(doc);
    renderPage("/recipe/rcp_1/print");

    await waitFor(() => {
      expect(screen.getByTestId("print-recipe-sheet")).toBeInTheDocument();
    });

    const frame = screen.getByTestId("swatch-chip-frame");
    // SwatchChipのラベル領域（name/meta）は size="sm" のときレンダリングされない
    // （sm/lgのフレーム兄弟要素が存在しない = 空の.labelラッパーspanが出ない）
    expect(frame.parentElement?.children).toHaveLength(1);
  });

  test("代表写真・工程写真のaltが内容のあるテキストになる（レビュー指摘5）", async () => {
    vi.mocked(resolvePhotoUrl).mockImplementation(async (photoId) => {
      if (photoId === "ph_cover") return "blob:cover";
      if (photoId === "ph_step") return "blob:step";
      return null;
    });

    const doc = makeDoc({
      overviewPhotoIds: ["ph_cover"],
      palette: [],
      parts: [
        {
          id: "part_1",
          name: "兜",
          steps: [
            {
              id: "step_1",
              technique: { presetKey: "layer", label: null },
              photoId: "ph_step",
              paints: [],
              mix: null,
              toolIds: [],
              memo: "",
            },
          ],
        },
      ],
    });
    vi.mocked(loadRecipe).mockResolvedValue(doc);
    renderPage("/recipe/rcp_1/print");

    await waitFor(() => {
      expect(screen.getByTestId("print-step-photo")).toBeInTheDocument();
    });

    const coverImg = screen.getByAltText("完成状態の代表写真");
    expect(coverImg).toBeInTheDocument();
    const stepImg = screen.getByAltText("工程 1 の写真");
    expect(stepImg).toBeInTheDocument();
  });

  test("代表写真なしレシピでもCoverPhotoのプレースホルダ枠とfig.1キャプションを描画する（レビュー指摘3）", async () => {
    const doc = makeDoc({
      overviewPhotoIds: [],
      palette: [],
    });
    vi.mocked(loadRecipe).mockResolvedValue(doc);
    renderPage("/recipe/rcp_1/print");

    await waitFor(() => {
      expect(screen.getByTestId("print-recipe-sheet")).toBeInTheDocument();
    });

    expect(screen.getByText("fig. 1 — 完成状態")).toBeInTheDocument();
  });
});

describe("PrintViewPage — モバイル自動スケールラッパーの配線", () => {
  test("紙面ラッパーが利用可能幅に応じてscaleを反映するCSSカスタムプロパティを持つ", async () => {
    const doc = makeDoc({ title: "宵闇の騎士" });
    vi.mocked(loadRecipe).mockResolvedValue(doc);

    const clientWidthSpy = vi
      .spyOn(Element.prototype, "clientWidth", "get")
      .mockReturnValue(375);

    renderPage("/recipe/rcp_1/print");

    await waitFor(() => {
      expect(screen.getByTestId("print-recipe-sheet")).toBeInTheDocument();
    });

    const sheet = screen.getByTestId("print-recipe-sheet");
    const scaleWrapper = sheet.parentElement?.parentElement;
    expect(scaleWrapper).not.toBeNull();
    const style = (scaleWrapper as HTMLElement).style;
    expect(style.getPropertyValue("--print-scale")).toBe(String(375 / 794));

    clientWidthSpy.mockRestore();
  });

  test("利用可能幅が紙面幅以上のときはscale=1（縮小しない）", async () => {
    const doc = makeDoc({ title: "宵闇の騎士" });
    vi.mocked(loadRecipe).mockResolvedValue(doc);

    const clientWidthSpy = vi
      .spyOn(Element.prototype, "clientWidth", "get")
      .mockReturnValue(1024);

    renderPage("/recipe/rcp_1/print");

    await waitFor(() => {
      expect(screen.getByTestId("print-recipe-sheet")).toBeInTheDocument();
    });

    const sheet = screen.getByTestId("print-recipe-sheet");
    const scaleWrapper = sheet.parentElement?.parentElement;
    const style = (scaleWrapper as HTMLElement).style;
    expect(style.getPropertyValue("--print-scale")).toBe("1");

    clientWidthSpy.mockRestore();
  });
});
