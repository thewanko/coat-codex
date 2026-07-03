// components/overview/PartReviewDialog.test.tsx — パーツ工程レビュー（読み取り専用）のテスト
// （技術計画v2.3 §3.3 PartCard行・§3.4冒頭ブロック・§4.2 T28）

import "../../i18n";
import { beforeAll, describe, expect, test, vi } from "vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import i18next from "../../i18n";
import type { RecipeDoc, Step } from "../../models/recipe";
import PartReviewDialog from "./PartReviewDialog";

type RecipePart = RecipeDoc["parts"][number];

beforeAll(() => {
  void i18next.changeLanguage("ja");
});

vi.mock("../../db/photoStore", () => ({
  resolvePhotoUrl: vi.fn().mockResolvedValue("blob:mock-url"),
}));

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

function makePart(overrides: Partial<RecipePart> & { id: string }): RecipePart {
  return {
    name: "パーツ",
    steps: [],
    ...overrides,
  };
}

function makeRecipe(overrides: Partial<RecipeDoc> & { id: string }): RecipeDoc {
  return {
    schemaVersion: 1,
    title: "レシピ",
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

function renderDialog(
  recipe: RecipeDoc,
  partId: string,
  onClose = vi.fn(),
  open = true,
) {
  render(
    <MemoryRouter>
      <PartReviewDialog
        recipe={recipe}
        partId={partId}
        open={open}
        onClose={onClose}
      />
    </MemoryRouter>,
  );
  return { onClose };
}

function t(key: string): string {
  return i18next.t(key);
}

describe("PartReviewDialog — 工程内容の表示", () => {
  test("技法名・塗料バッジ・メモを表示する", async () => {
    const recipe = makeRecipe({
      id: "rcp_1",
      palette: [
        {
          id: "col_a",
          source: "custom",
          brand: null,
          name: "赤",
          presetId: null,
          hex: "#960F0F",
          chipPhotoId: null,
        },
        {
          id: "col_b",
          source: "custom",
          brand: null,
          name: "白",
          presetId: null,
          hex: "#FFFFFF",
          chipPhotoId: null,
        },
      ],
      tools: [{ id: "tool_1", name: "エアブラシ", note: null }],
      parts: [
        makePart({
          id: "part_1",
          name: "兜",
          steps: [
            makeStep({
              id: "stp_1",
              technique: { presetKey: "basecoat", label: null },
              paints: [{ colorId: "col_a" }, { colorId: "col_b" }],
              mix: [60, 40],
              toolIds: ["tool_1"],
              memo: "薄めに2層",
            }),
          ],
        }),
      ],
    });

    renderDialog(recipe, "part_1");

    expect(screen.getByRole("heading", { name: "兜" })).toBeInTheDocument();
    expect(screen.getByText(t("techniques.basecoat"))).toBeInTheDocument();
    await waitFor(() => {
      expect(screen.getByText("60% + 40% (3:2)")).toBeInTheDocument();
    });
    expect(screen.getByText("赤")).toBeInTheDocument();
    expect(screen.getByText("白")).toBeInTheDocument();
    expect(screen.getByText("エアブラシ")).toBeInTheDocument();
    expect(screen.getByText("薄めに2層")).toBeInTheDocument();
  });
});

describe("PartReviewDialog — 編集リンク・共有ボタン", () => {
  test("「このパーツを編集」リンクのtoが/recipe/:id/part/:partId", () => {
    const recipe = makeRecipe({
      id: "rcp_1",
      parts: [makePart({ id: "part_1", name: "腕" })],
    });

    renderDialog(recipe, "part_1");

    const editLink = screen.getByRole("link", { name: "このパーツを編集" });
    expect(editLink).toHaveAttribute("href", "/recipe/rcp_1/part/part_1");
  });

  test("共有ボタンはdisabledでtitle=shareComingSoon", () => {
    const recipe = makeRecipe({
      id: "rcp_1",
      parts: [makePart({ id: "part_1", name: "腕" })],
    });

    renderDialog(recipe, "part_1");

    const shareButton = screen.getByRole("button", { name: "SNSで共有" });
    expect(shareButton).toBeDisabled();
    expect(shareButton).toHaveAttribute("title", "共有機能は準備中です");
  });
});

describe("PartReviewDialog — 閉じる操作", () => {
  test("✕ボタンでonCloseが呼ばれる", () => {
    const recipe = makeRecipe({
      id: "rcp_1",
      parts: [makePart({ id: "part_1", name: "腕" })],
    });
    const { onClose } = renderDialog(recipe, "part_1");

    fireEvent.click(screen.getByRole("button", { name: "閉じる" }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  test("Escキーでoncloseが呼ばれる", () => {
    const recipe = makeRecipe({
      id: "rcp_1",
      parts: [makePart({ id: "part_1", name: "腕" })],
    });
    const { onClose } = renderDialog(recipe, "part_1");

    fireEvent.keyDown(window, { key: "Escape" });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  test("backdropクリックでonCloseが呼ばれる", () => {
    const recipe = makeRecipe({
      id: "rcp_1",
      parts: [makePart({ id: "part_1", name: "腕" })],
    });
    const { onClose } = renderDialog(recipe, "part_1");

    fireEvent.click(screen.getByTestId("part-review-backdrop"));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  test("ダイアログ本体クリックではonCloseが呼ばれない（stopPropagation）", () => {
    const recipe = makeRecipe({
      id: "rcp_1",
      parts: [makePart({ id: "part_1", name: "腕" })],
    });
    const { onClose } = renderDialog(recipe, "part_1");

    fireEvent.click(screen.getByRole("dialog"));
    expect(onClose).not.toHaveBeenCalled();
  });
});

describe("PartReviewDialog — 工程0件", () => {
  test("partReview.noStepsを表示する", () => {
    const recipe = makeRecipe({
      id: "rcp_1",
      parts: [makePart({ id: "part_1", name: "脚", steps: [] })],
    });

    renderDialog(recipe, "part_1");

    expect(screen.getByText("工程がまだありません")).toBeInTheDocument();
  });
});

describe("PartReviewDialog — open=false・partId不一致", () => {
  test("open=falseのときは何も描画しない", () => {
    const recipe = makeRecipe({
      id: "rcp_1",
      parts: [makePart({ id: "part_1", name: "腕" })],
    });

    renderDialog(recipe, "part_1", vi.fn(), false);

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  test("partIdに一致するパーツがない場合は何も描画しない", () => {
    const recipe = makeRecipe({
      id: "rcp_1",
      parts: [makePart({ id: "part_1", name: "腕" })],
    });

    renderDialog(recipe, "part_missing");

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });
});
