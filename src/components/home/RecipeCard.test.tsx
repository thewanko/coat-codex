import "../../i18n";
import { beforeAll, beforeEach, describe, expect, test, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import i18next from "../../i18n";
import RecipeCard from "./RecipeCard";
import ToastHost from "../common/ToastHost";
import { duplicateRecipe } from "./duplicateRecipe";
import { exportRecipeToBlob } from "../../lib/exporters/json";
import { recordRecipeExport } from "../../lib/storageHealth";
import { downloadBlob } from "../common/downloadBlob";
import type { RecipeDoc } from "../../models/recipe";

beforeAll(() => {
  void i18next.changeLanguage("ja");
});

vi.mock("../../db/photoStore", async () => {
  const actual = await vi.importActual<typeof import("../../db/photoStore")>(
    "../../db/photoStore",
  );
  return {
    ...actual,
    resolvePhotoUrl: vi.fn().mockResolvedValue("blob:mock-cover-url"),
  };
});

vi.mock("./duplicateRecipe", () => ({
  duplicateRecipe: vi.fn(),
}));

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
    baseSteps: [
      {
        id: "s1",
        technique: { presetKey: null, label: null },
        photoId: null,
        paints: [],
        mix: null,
        toolIds: [],
        memo: "",
      },
    ],
    parts: [
      {
        id: "part_1",
        name: "頭部",
        steps: [
          {
            id: "s2",
            technique: { presetKey: null, label: null },
            photoId: null,
            paints: [],
            mix: null,
            toolIds: [],
            memo: "",
          },
        ],
      },
    ],
    ...overrides,
  };
}

function renderCard(
  props: Partial<React.ComponentProps<typeof RecipeCard>> = {},
) {
  return render(
    <ToastHost>
      <RecipeCard
        recipe={makeRecipe()}
        onOpen={vi.fn()}
        onDelete={vi.fn()}
        {...props}
      />
    </ToastHost>,
  );
}

describe("RecipeCard", () => {
  beforeEach(() => {
    vi.mocked(duplicateRecipe).mockReset();
    vi.mocked(exportRecipeToBlob).mockReset();
    vi.mocked(recordRecipeExport).mockClear();
    vi.mocked(downloadBlob).mockReset();
  });

  test("タイトル・工程数（baseSteps+parts内steps合計）を表示する", () => {
    renderCard();

    expect(screen.getByText("赤い装甲")).toBeInTheDocument();
    expect(screen.getByText(/工程2/)).toBeInTheDocument();
  });

  test("サムネイル押下でonOpenが呼ばれる", () => {
    const onOpen = vi.fn();
    renderCard({ onOpen });

    fireEvent.click(screen.getByRole("button", { name: "" }));
    expect(onOpen).toHaveBeenCalledWith("rcp_1");
  });

  test("⋮メニューから「開く」を押すとonOpenが呼ばれ、メニューが閉じる", () => {
    const onOpen = vi.fn();
    renderCard({ onOpen });

    fireEvent.click(screen.getByLabelText("メニュー"));
    fireEvent.click(screen.getByRole("menuitem", { name: "開く" }));

    expect(onOpen).toHaveBeenCalledWith("rcp_1");
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
  });

  test("⋮メニューから「削除」を押すとonDeleteが呼ばれる", () => {
    const onDelete = vi.fn();
    renderCard({ onDelete });

    fireEvent.click(screen.getByLabelText("メニュー"));
    fireEvent.click(screen.getByRole("menuitem", { name: "削除" }));

    expect(onDelete).toHaveBeenCalledWith("rcp_1");
  });

  test("メニュー外クリックでメニューが閉じる", () => {
    renderCard();

    fireEvent.click(screen.getByLabelText("メニュー"));
    expect(screen.getByRole("menu")).toBeInTheDocument();

    fireEvent.mouseDown(document.body);
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
  });

  test("backedUp未指定時は未バックアップドットが視覚上非表示（data-visible=false）", () => {
    const { container } = renderCard();
    const dot = container.querySelector("[data-visible]");
    expect(dot).toHaveAttribute("data-visible", "false");
  });

  test("backedUp=falseのときドットが表示される（結線はT34。propsの受け口のみ検証）", () => {
    const { container } = renderCard({ backedUp: false });
    const dot = container.querySelector("[data-visible]");
    expect(dot).toHaveAttribute("data-visible", "true");
  });

  test("⋮メニューに「複製」「JSONエクスポート」項目がある", () => {
    renderCard();
    fireEvent.click(screen.getByLabelText("メニュー"));

    expect(screen.getByRole("menuitem", { name: "複製" })).toBeInTheDocument();
    expect(
      screen.getByRole("menuitem", { name: "JSONエクスポート" }),
    ).toBeInTheDocument();
  });

  test("「複製」を押すとduplicateRecipeが呼ばれ、成功後onDuplicatedが呼ばれる", async () => {
    const onDuplicated = vi.fn();
    vi.mocked(duplicateRecipe).mockResolvedValue(
      makeRecipe({ id: "rcp_2", title: "赤い装甲" }),
    );

    renderCard({ onDuplicated });
    fireEvent.click(screen.getByLabelText("メニュー"));
    fireEvent.click(screen.getByRole("menuitem", { name: "複製" }));

    await waitFor(() => {
      expect(duplicateRecipe).toHaveBeenCalledWith(
        expect.objectContaining({ id: "rcp_1" }),
      );
    });
    await waitFor(() => {
      expect(onDuplicated).toHaveBeenCalledTimes(1);
    });
  });

  test("「JSONエクスポート」を押すとExportPhotoChoiceDialogが開く", () => {
    renderCard();
    fireEvent.click(screen.getByLabelText("メニュー"));
    fireEvent.click(screen.getByRole("menuitem", { name: "JSONエクスポート" }));

    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(screen.getByText("写真を含めますか？")).toBeInTheDocument();
  });

  test("写真あり/なし選択後にexportRecipeToBlob→downloadBlob→recordRecipeExportが呼ばれる", async () => {
    const blob = new Blob(["{}"], { type: "application/json" });
    vi.mocked(exportRecipeToBlob).mockResolvedValue(blob);

    renderCard();
    fireEvent.click(screen.getByLabelText("メニュー"));
    fireEvent.click(screen.getByRole("menuitem", { name: "JSONエクスポート" }));
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

  test("写真を含めない選択でexportRecipeToBlobがincludePhotos:falseで呼ばれる", async () => {
    const blob = new Blob(["{}"], { type: "application/json" });
    vi.mocked(exportRecipeToBlob).mockResolvedValue(blob);

    renderCard();
    fireEvent.click(screen.getByLabelText("メニュー"));
    fireEvent.click(screen.getByRole("menuitem", { name: "JSONエクスポート" }));
    fireEvent.click(screen.getByRole("button", { name: "写真を含めない" }));

    await waitFor(() => {
      expect(exportRecipeToBlob).toHaveBeenCalledWith("rcp_1", {
        includePhotos: false,
      });
    });
  });

  test("エクスポート成功後にonExportedが当該レシピIDで呼ばれる（D-6再判定用）", async () => {
    const blob = new Blob(["{}"], { type: "application/json" });
    vi.mocked(exportRecipeToBlob).mockResolvedValue(blob);
    const onExported = vi.fn();

    renderCard({ onExported });
    fireEvent.click(screen.getByLabelText("メニュー"));
    fireEvent.click(screen.getByRole("menuitem", { name: "JSONエクスポート" }));
    fireEvent.click(screen.getByRole("button", { name: "写真を含める" }));

    await waitFor(() => {
      expect(onExported).toHaveBeenCalledWith("rcp_1");
    });
  });

  test("エクスポート失敗時はonExportedが呼ばれない", async () => {
    vi.mocked(exportRecipeToBlob).mockRejectedValue(new Error("fail"));
    const onExported = vi.fn();

    renderCard({ onExported });
    fireEvent.click(screen.getByLabelText("メニュー"));
    fireEvent.click(screen.getByRole("menuitem", { name: "JSONエクスポート" }));
    fireEvent.click(screen.getByRole("button", { name: "写真を含める" }));

    await waitFor(() => {
      expect(
        screen.getByText("JSONエクスポートに失敗しました"),
      ).toBeInTheDocument();
    });
    expect(onExported).not.toHaveBeenCalled();
  });
});
