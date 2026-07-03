// components/overview/ExportActionBar.test.tsx — JSON・素MD・note MD結線（T33）＋
// 印刷/PDF/X/Bluesky配置は引き続きdisabled（結線はT36/T39/T40）
// （技術計画v2.3 §3.3 ExportActionBar行・T28・T33）
//
// PC幅(>=768px): 従来のピル群がそのまま描画されることを確認。
// mobile幅(<768px, v2.3): 「出力・共有」ボタン1つに集約→タップでボトムシートが
// 開閉すること、シート内に全アクションが存在しJSON・素MDが隣接すること、
// Esc・backdropクリックで閉じることを確認（RTL。matchMediaはここでモックする）。

import "../../i18n";
import {
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  test,
  vi,
} from "vitest";
import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import i18next from "../../i18n";
import ExportActionBar from "./ExportActionBar";
import ToastHost from "../common/ToastHost";
import { exportRecipeToBlob } from "../../lib/exporters/json";
import { recordRecipeExport } from "../../lib/storageHealth";
import { downloadBlob } from "../common/downloadBlob";
import type { RecipeDoc } from "../../models/recipe";

beforeAll(() => {
  void i18next.changeLanguage("ja");
});

vi.mock("../../lib/exporters/json", async () => {
  const actual = await vi.importActual<
    typeof import("../../lib/exporters/json")
  >("../../lib/exporters/json");
  return {
    ...actual,
    exportRecipeToBlob: vi.fn(),
  };
});

vi.mock("../../lib/storageHealth", async () => {
  const actual = await vi.importActual<
    typeof import("../../lib/storageHealth")
  >("../../lib/storageHealth");
  return {
    ...actual,
    recordRecipeExport: vi.fn().mockResolvedValue(undefined),
  };
});

vi.mock("../common/downloadBlob", async () => {
  const actual = await vi.importActual<typeof import("../common/downloadBlob")>(
    "../common/downloadBlob",
  );
  return {
    ...actual,
    downloadBlob: vi.fn(),
  };
});

type Listener = (event: MediaQueryListEvent) => void;

function mockMatchMedia(matches: boolean) {
  const listeners = new Set<Listener>();
  const mql: Partial<MediaQueryList> = {
    matches,
    media: "(max-width: 767px)",
    addEventListener: (
      _type: string,
      listener: EventListenerOrEventListenerObject,
    ) => {
      listeners.add(listener as Listener);
    },
    removeEventListener: (
      _type: string,
      listener: EventListenerOrEventListenerObject,
    ) => {
      listeners.delete(listener as Listener);
    },
    addListener: (listener: Listener | null) => {
      if (listener) listeners.add(listener);
    },
    removeListener: (listener: Listener | null) => {
      if (listener) listeners.delete(listener);
    },
  };

  vi.stubGlobal(
    "matchMedia",
    vi.fn().mockImplementation(() => mql as MediaQueryList),
  );
}

function makeRecipe(overrides: Partial<RecipeDoc> = {}): RecipeDoc {
  return {
    schemaVersion: 1,
    id: "rcp_1",
    title: "赤い装甲",
    createdAt: "2026-06-01T00:00:00.000Z",
    updatedAt: "2026-06-15T00:00:00.000Z",
    overviewPhotoIds: [],
    palette: [],
    tools: [],
    baseSteps: [],
    parts: [],
    ...overrides,
  };
}

function renderBar(recipe: RecipeDoc | null = null) {
  return render(
    <ToastHost>
      <ExportActionBar recipe={recipe} />
    </ToastHost>,
  );
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("ExportActionBar — PC幅（従来のピル群）", () => {
  beforeEach(() => {
    mockMatchMedia(false);
  });

  test("recipeがnullのとき印刷・PDF・X・Bluesky・note MD・JSON・素MDの7ボタンをすべてdisabledで配置する", () => {
    renderBar(null);

    const labels = ["印刷", "PDF", "X", "Bluesky", "note MD", "JSON", "素MD"];
    for (const label of labels) {
      const button = screen.getByRole("button", { name: label });
      expect(button).toBeDisabled();
    }
  });

  test("recipeがある場合、印刷・PDF・X・Blueskyは引き続きdisabled（結線はT36/T39/T40）", () => {
    renderBar(makeRecipe());

    for (const label of ["印刷", "PDF", "X", "Bluesky"]) {
      expect(screen.getByRole("button", { name: label })).toBeDisabled();
    }
  });

  test("recipeがある場合、note MD・JSON・素MDは有効化される", () => {
    renderBar(makeRecipe());

    for (const label of ["note MD", "JSON", "素MD"]) {
      expect(screen.getByRole("button", { name: label })).not.toBeDisabled();
    }
  });

  test("JSON・素MDは隣接する結合ピル内に配置される（要件どおりの隣接配置）", () => {
    renderBar(makeRecipe());

    const jsonButton = screen.getByRole("button", { name: "JSON" });
    const mdButton = screen.getByRole("button", { name: "素MD" });
    expect(jsonButton.parentElement).toBe(mdButton.parentElement);
  });

  test("「出力・共有」メニューボタンは描画されない", () => {
    renderBar(makeRecipe());
    expect(
      screen.queryByRole("button", { name: "出力・共有" }),
    ).not.toBeInTheDocument();
  });

  test("JSONボタン押下で写真あり/なし選択ダイアログが開く", () => {
    renderBar(makeRecipe());
    fireEvent.click(screen.getByRole("button", { name: "JSON" }));
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(screen.getByText("写真を含めますか？")).toBeInTheDocument();
  });

  test("写真を含める選択でexportRecipeToBlob→downloadBlob→recordRecipeExportが呼ばれる", async () => {
    const blob = new Blob(["{}"], { type: "application/json" });
    vi.mocked(exportRecipeToBlob).mockResolvedValue(blob);

    renderBar(makeRecipe());
    fireEvent.click(screen.getByRole("button", { name: "JSON" }));
    fireEvent.click(screen.getByRole("button", { name: "写真を含める" }));

    await waitFor(() => {
      expect(exportRecipeToBlob).toHaveBeenCalledWith("rcp_1", {
        includePhotos: true,
      });
    });
    await waitFor(() => {
      expect(downloadBlob).toHaveBeenCalledWith(blob, "赤い装甲.json");
    });
    await waitFor(() => {
      expect(recordRecipeExport).toHaveBeenCalledWith(
        "rcp_1",
        expect.any(String),
      );
    });
  });

  test("素MDボタン押下でクリップボードコピーが試行される", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator, { clipboard: { writeText } });

    renderBar(makeRecipe({ title: "テストレシピ" }));
    fireEvent.click(screen.getByRole("button", { name: "素MD" }));

    await waitFor(() => {
      expect(writeText).toHaveBeenCalledTimes(1);
    });
    expect(writeText.mock.calls[0][0]).toContain("# テストレシピ");
  });

  test("note MDボタン押下でクリップボードコピーが試行される（ハッシュタグ付き）", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator, { clipboard: { writeText } });

    renderBar(makeRecipe({ title: "テストレシピ" }));
    fireEvent.click(screen.getByRole("button", { name: "note MD" }));

    await waitFor(() => {
      expect(writeText).toHaveBeenCalledTimes(1);
    });
    expect(writeText.mock.calls[0][0]).toContain("#coat-codex");
  });

  test("クリップボード非対応時はファイルDLへフォールバックする", async () => {
    Object.assign(navigator, { clipboard: undefined });

    renderBar(makeRecipe({ title: "テストレシピ" }));
    fireEvent.click(screen.getByRole("button", { name: "素MD" }));

    await waitFor(() => {
      expect(downloadBlob).toHaveBeenCalledWith(
        expect.any(Blob),
        "テストレシピ.md",
      );
    });
  });

  test("JSONエクスポート失敗時はエラートーストを表示する", async () => {
    vi.mocked(exportRecipeToBlob).mockRejectedValue(new Error("boom"));

    renderBar(makeRecipe());
    fireEvent.click(screen.getByRole("button", { name: "JSON" }));
    fireEvent.click(screen.getByRole("button", { name: "写真を含める" }));

    await waitFor(() => {
      expect(
        screen.getByText("JSONエクスポートに失敗しました"),
      ).toBeInTheDocument();
    });
  });
});

describe("ExportActionBar — mobile幅（出力・共有ボタン→ボトムシート）", () => {
  beforeEach(() => {
    mockMatchMedia(true);
  });

  test("「出力・共有」ボタン1つに集約され、従来のピル群は描画されない", () => {
    renderBar(makeRecipe());

    expect(
      screen.getByRole("button", { name: "出力・共有" }),
    ).toBeInTheDocument();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "印刷" }),
    ).not.toBeInTheDocument();
  });

  test("メニューボタンをタップするとボトムシートが開き、全アクション項目が存在する", () => {
    renderBar(null);

    fireEvent.click(screen.getByRole("button", { name: "出力・共有" }));

    const dialog = screen.getByRole("dialog");
    expect(dialog).toHaveAttribute("aria-modal", "true");

    const labels = ["印刷", "PDF", "X", "Bluesky", "note MD", "JSON", "素MD"];
    for (const label of labels) {
      expect(
        within(dialog).getByRole("button", { name: label }),
      ).toBeDisabled();
    }
  });

  test("recipeがある場合、シート内のnote MD・JSON・素MDは有効化される", () => {
    renderBar(makeRecipe());
    fireEvent.click(screen.getByRole("button", { name: "出力・共有" }));

    const dialog = screen.getByRole("dialog");
    for (const label of ["note MD", "JSON", "素MD"]) {
      expect(
        within(dialog).getByRole("button", { name: label }),
      ).not.toBeDisabled();
    }
  });

  test("JSON・素MDはシート内で隣接する結合グループに配置される（隣接維持）", () => {
    renderBar(makeRecipe());
    fireEvent.click(screen.getByRole("button", { name: "出力・共有" }));

    const jsonButton = screen.getByRole("button", { name: "JSON" });
    const mdButton = screen.getByRole("button", { name: "素MD" });
    expect(jsonButton.parentElement).toBe(mdButton.parentElement);
  });

  test("Escapeキーでシートが閉じる", () => {
    renderBar(makeRecipe());
    fireEvent.click(screen.getByRole("button", { name: "出力・共有" }));
    expect(screen.getByRole("dialog")).toBeInTheDocument();

    fireEvent.keyDown(window, { key: "Escape" });
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  test("backdropクリックでシートが閉じる", () => {
    renderBar(makeRecipe());
    fireEvent.click(screen.getByRole("button", { name: "出力・共有" }));
    expect(screen.getByRole("dialog")).toBeInTheDocument();

    fireEvent.click(screen.getByTestId("export-sheet-backdrop"));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  test("シート内クリックでは閉じない", () => {
    renderBar(makeRecipe());
    fireEvent.click(screen.getByRole("button", { name: "出力・共有" }));

    fireEvent.click(screen.getByRole("dialog"));
    expect(screen.getByRole("dialog")).toBeInTheDocument();
  });

  test("閉じるボタンでシートが閉じる", () => {
    renderBar(makeRecipe());
    fireEvent.click(screen.getByRole("button", { name: "出力・共有" }));

    fireEvent.click(screen.getByRole("button", { name: "閉じる" }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  test("ドラッグゾーンを大きく下にドラッグするとonClose相当でシートが閉じる（setPointerCapture未定義でも落ちない）", () => {
    renderBar(makeRecipe());
    fireEvent.click(screen.getByRole("button", { name: "出力・共有" }));
    expect(screen.getByRole("dialog")).toBeInTheDocument();

    const dragZone = screen.getByTestId("export-sheet-drag-zone");
    // jsdomにはsetPointerCaptureが実装されていない環境を想定（`?.`ガードで無害）。
    fireEvent.pointerDown(dragZone, { pointerId: 1, clientY: 0, button: 0 });
    fireEvent.pointerMove(dragZone, { pointerId: 1, clientY: 200 });
    fireEvent.pointerUp(dragZone, { pointerId: 1, clientY: 200 });

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  test("ドラッグゾーンを小さく下にドラッグしただけではシートは閉じない（スナップバック）", () => {
    renderBar(makeRecipe());
    fireEvent.click(screen.getByRole("button", { name: "出力・共有" }));
    const dialog = screen.getByRole("dialog");
    expect(dialog).toBeInTheDocument();

    // jsdomはレイアウトを計算しないためgetBoundingClientRect()は既定で0を返す。
    // シート高30%判定を実条件（十分な高さ）で検証するためスタブする。
    vi.spyOn(dialog, "getBoundingClientRect").mockReturnValue({
      height: 600,
      width: 400,
      top: 0,
      left: 0,
      bottom: 600,
      right: 400,
      x: 0,
      y: 0,
      toJSON: () => "",
    });

    const dragZone = screen.getByTestId("export-sheet-drag-zone");
    fireEvent.pointerDown(dragZone, { pointerId: 1, clientY: 0, button: 0 });
    fireEvent.pointerMove(dragZone, { pointerId: 1, clientY: 20 });
    fireEvent.pointerUp(dragZone, { pointerId: 1, clientY: 20 });

    expect(screen.getByRole("dialog")).toBeInTheDocument();
  });
});
