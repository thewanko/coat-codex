// components/overview/PartReviewDialog.test.tsx — パーツ工程レビュー（読み取り専用）のテスト
// （技術計画v2.3 §3.3 PartCard行・§3.4冒頭ブロック・§4.2 T28・T40）

import "../../i18n";
import { beforeAll, describe, expect, test, vi } from "vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import i18next from "../../i18n";
import type { RecipeDoc, Step } from "../../models/recipe";
import PartReviewDialog from "./PartReviewDialog";
import ToastHost from "../common/ToastHost";

vi.mock("../../db/db", () => ({
  db: {
    photos: {
      get: vi.fn().mockResolvedValue(null),
    },
  },
}));

const composeShareImagesMock = vi.fn();

vi.mock("../../lib/sns/imageComposer", async () => {
  const actual = await vi.importActual<
    typeof import("../../lib/sns/imageComposer")
  >("../../lib/sns/imageComposer");
  return {
    ...actual,
    composeShareImages: (...args: unknown[]) => composeShareImagesMock(...args),
  };
});

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
    photoCrops: {},
    ...overrides,
  };
}

function renderDialog(
  recipe: RecipeDoc,
  partId: string | null,
  onClose = vi.fn(),
  open = true,
) {
  render(
    <ToastHost>
      <MemoryRouter>
        <PartReviewDialog
          recipe={recipe}
          partId={partId}
          open={open}
          onClose={onClose}
        />
      </MemoryRouter>
    </ToastHost>,
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

  test("共有ボタンは「SNSに共有」1ボタンで活性化されている（2026-07-04 FB-A統合）", () => {
    const recipe = makeRecipe({
      id: "rcp_1",
      parts: [makePart({ id: "part_1", name: "腕" })],
    });

    renderDialog(recipe, "part_1");

    expect(
      screen.getByRole("button", { name: "SNSに共有" }),
    ).not.toBeDisabled();
  });

  test("「このパーツを編集」リンククリックでonCloseが呼ばれる（state残存バグ修正）", () => {
    const recipe = makeRecipe({
      id: "rcp_1",
      parts: [makePart({ id: "part_1", name: "腕" })],
    });

    const { onClose } = renderDialog(recipe, "part_1");

    fireEvent.click(screen.getByRole("link", { name: "このパーツを編集" }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});

describe("PartReviewDialog — 共有ボタン押下でShareDialogを開く", () => {
  test("「SNSに共有」押下でShareDialogがpartコンテキストで開き、既定でXタブが選択されている", async () => {
    vi.stubGlobal("navigator", { canShare: () => true, share: vi.fn() });
    composeShareImagesMock.mockResolvedValue([]);

    const recipe = makeRecipe({
      id: "rcp_1",
      parts: [
        makePart({
          id: "part_1",
          name: "腕",
          steps: [makeStep({ id: "s1" })],
        }),
      ],
    });
    renderDialog(recipe, "part_1");

    fireEvent.click(screen.getByRole("button", { name: "SNSに共有" }));

    const shareDialog = await screen.findByTestId("share-dialog-backdrop");
    expect(shareDialog).toBeInTheDocument();
    expect(
      screen.getByText("SNSに共有", { selector: "h2" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "X" })).toHaveAttribute(
      "aria-selected",
      "true",
    );

    vi.unstubAllGlobals();
  });

  test("ShareDialog内でBlueskyタブへ切替できる", async () => {
    vi.stubGlobal("navigator", { canShare: () => true, share: vi.fn() });
    composeShareImagesMock.mockResolvedValue([]);

    const recipe = makeRecipe({
      id: "rcp_1",
      parts: [
        makePart({
          id: "part_1",
          name: "腕",
          steps: [makeStep({ id: "s1" })],
        }),
      ],
    });
    renderDialog(recipe, "part_1");

    fireEvent.click(screen.getByRole("button", { name: "SNSに共有" }));
    await screen.findByTestId("share-dialog-backdrop");

    fireEvent.click(screen.getByRole("tab", { name: "Bluesky" }));

    expect(screen.getByRole("tab", { name: "Bluesky" })).toHaveAttribute(
      "aria-selected",
      "true",
    );

    vi.unstubAllGlobals();
  });

  test("ShareDialogはPartReviewDialogの後にDOMマウントされ、両者とも表示され続ける（重ね表示）", async () => {
    vi.stubGlobal("navigator", { canShare: () => true, share: vi.fn() });
    composeShareImagesMock.mockResolvedValue([]);

    const recipe = makeRecipe({
      id: "rcp_1",
      parts: [
        makePart({
          id: "part_1",
          name: "腕",
          steps: [makeStep({ id: "s1" })],
        }),
      ],
    });
    renderDialog(recipe, "part_1");

    fireEvent.click(screen.getByRole("button", { name: "SNSに共有" }));

    await screen.findByTestId("share-dialog-backdrop");
    // PartReviewDialog自体は開いたまま
    expect(screen.getByTestId("part-review-backdrop")).toBeInTheDocument();

    // DOM順序: part-review-backdropの後にshare-dialog-backdropが続く
    // （同一z-index・同一スタッキングコンテキストでは後発要素が上に描画されるCSS仕様に依拠）
    const partReviewBackdrop = screen.getByTestId("part-review-backdrop");
    const shareBackdrop = screen.getByTestId("share-dialog-backdrop");
    const position = partReviewBackdrop.compareDocumentPosition(shareBackdrop);
    const isFollowing =
      (position & Node.DOCUMENT_POSITION_FOLLOWING) ===
      Node.DOCUMENT_POSITION_FOLLOWING;
    expect(isFollowing).toBe(true);

    vi.unstubAllGlobals();
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

describe("PartReviewDialog — baseモード（partId=null。2026-07-03 BASEカード独立化）", () => {
  test("recipe.baseStepsを表示し、見出しはoverview.baseCardName、共有ボタンは描画しない", async () => {
    const recipe = makeRecipe({
      id: "rcp_1",
      baseSteps: [
        makeStep({
          id: "base_stp_1",
          technique: { presetKey: "basecoat", label: null },
          memo: "下地はムラなく",
        }),
      ],
    });

    renderDialog(recipe, null);

    expect(
      screen.getByRole("heading", { name: "ベース工程（全体）" }),
    ).toBeInTheDocument();
    expect(screen.getByText(t("techniques.basecoat"))).toBeInTheDocument();
    expect(screen.getByText("下地はムラなく")).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "SNSに共有" }),
    ).not.toBeInTheDocument();
  });

  test("編集リンク先は/recipe/:id/part/base", () => {
    const recipe = makeRecipe({ id: "rcp_1", baseSteps: [] });

    renderDialog(recipe, null);

    const editLink = screen.getByRole("link", { name: "このパーツを編集" });
    expect(editLink).toHaveAttribute("href", "/recipe/rcp_1/part/base");
  });

  test("baseSteps0件時はpartReview.noStepsを表示する", () => {
    const recipe = makeRecipe({ id: "rcp_1", baseSteps: [] });

    renderDialog(recipe, null);

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
