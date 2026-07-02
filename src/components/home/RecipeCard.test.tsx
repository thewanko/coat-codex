import "../../i18n";
import { beforeAll, describe, expect, test, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import i18next from "../../i18n";
import RecipeCard from "./RecipeCard";
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

describe("RecipeCard", () => {
  test("タイトル・工程数（baseSteps+parts内steps合計）を表示する", () => {
    render(
      <RecipeCard recipe={makeRecipe()} onOpen={vi.fn()} onDelete={vi.fn()} />,
    );

    expect(screen.getByText("赤い装甲")).toBeInTheDocument();
    expect(screen.getByText(/工程2/)).toBeInTheDocument();
  });

  test("サムネイル押下でonOpenが呼ばれる", () => {
    const onOpen = vi.fn();
    render(
      <RecipeCard recipe={makeRecipe()} onOpen={onOpen} onDelete={vi.fn()} />,
    );

    fireEvent.click(screen.getByRole("button", { name: "" }));
    expect(onOpen).toHaveBeenCalledWith("rcp_1");
  });

  test("⋮メニューから「開く」を押すとonOpenが呼ばれ、メニューが閉じる", () => {
    const onOpen = vi.fn();
    render(
      <RecipeCard recipe={makeRecipe()} onOpen={onOpen} onDelete={vi.fn()} />,
    );

    fireEvent.click(screen.getByLabelText("メニュー"));
    fireEvent.click(screen.getByRole("menuitem", { name: "開く" }));

    expect(onOpen).toHaveBeenCalledWith("rcp_1");
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
  });

  test("⋮メニューから「削除」を押すとonDeleteが呼ばれる", () => {
    const onDelete = vi.fn();
    render(
      <RecipeCard recipe={makeRecipe()} onOpen={vi.fn()} onDelete={onDelete} />,
    );

    fireEvent.click(screen.getByLabelText("メニュー"));
    fireEvent.click(screen.getByRole("menuitem", { name: "削除" }));

    expect(onDelete).toHaveBeenCalledWith("rcp_1");
  });

  test("メニュー外クリックでメニューが閉じる", () => {
    render(
      <RecipeCard recipe={makeRecipe()} onOpen={vi.fn()} onDelete={vi.fn()} />,
    );

    fireEvent.click(screen.getByLabelText("メニュー"));
    expect(screen.getByRole("menu")).toBeInTheDocument();

    fireEvent.mouseDown(document.body);
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
  });

  test("backedUp未指定時は未バックアップドットが視覚上非表示（data-visible=false）", () => {
    const { container } = render(
      <RecipeCard recipe={makeRecipe()} onOpen={vi.fn()} onDelete={vi.fn()} />,
    );
    const dot = container.querySelector("[data-visible]");
    expect(dot).toHaveAttribute("data-visible", "false");
  });

  test("backedUp=falseのときドットが表示される（結線はT34。propsの受け口のみ検証）", () => {
    const { container } = render(
      <RecipeCard
        recipe={makeRecipe()}
        backedUp={false}
        onOpen={vi.fn()}
        onDelete={vi.fn()}
      />,
    );
    const dot = container.querySelector("[data-visible]");
    expect(dot).toHaveAttribute("data-visible", "true");
  });
});
