// components/overview/PartCard.test.tsx — サムネ規約・混合バッジ表示のテスト
// （技術計画v2.2 §4.2 T28・§8-A）

import "../../i18n";
import { beforeAll, describe, expect, test, vi } from "vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import i18next from "../../i18n";
import type { RecipeDoc, Step } from "../../models/recipe";
import PartCard from "./PartCard";

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

describe("PartCard — サムネ規約（写真がある最後の工程）", () => {
  test("複数の写真つき工程がある場合、最後（末尾に近い）工程の写真をサムネ・STEPタグに使う", async () => {
    const part = makePart({
      id: "part_1",
      steps: [
        makeStep({ id: "stp_1", photoId: "pht_1" }),
        makeStep({ id: "stp_2", photoId: null }),
        makeStep({ id: "stp_3", photoId: "pht_3" }),
      ],
    });
    render(
      <PartCard part={part} order={1} onOpen={vi.fn()} onReview={vi.fn()} />,
    );

    await waitFor(() => {
      expect(screen.getByText("STEP 3")).toBeInTheDocument();
    });
  });

  test("写真つき工程が1件もない場合はSTEPタグ・写真ともに表示しない（プレースホルダ）", () => {
    const part = makePart({
      id: "part_1",
      steps: [makeStep({ id: "stp_1", photoId: null })],
    });
    render(
      <PartCard part={part} order={1} onOpen={vi.fn()} onReview={vi.fn()} />,
    );

    expect(screen.queryByText(/^STEP/)).not.toBeInTheDocument();
  });

  test("工程が0件でもプレースホルダで工程数0を表示する", () => {
    const part = makePart({ id: "part_1", steps: [] });
    render(
      <PartCard part={part} order={1} onOpen={vi.fn()} onReview={vi.fn()} />,
    );

    expect(screen.getByText("工程 0")).toBeInTheDocument();
  });
});

describe("PartCard — 混合バッジ（formatMixBadgeの素通し）", () => {
  test("サムネ工程が合計100の混色ならformatMixBadge出力をそのまま表示する", async () => {
    const part = makePart({
      id: "part_1",
      steps: [
        makeStep({
          id: "stp_1",
          photoId: "pht_1",
          paints: [{ colorId: "col_a" }, { colorId: "col_b" }],
          mix: [60, 40],
        }),
      ],
    });
    render(
      <PartCard part={part} order={1} onOpen={vi.fn()} onReview={vi.fn()} />,
    );

    await waitFor(() => {
      expect(screen.getByText("60% + 40% (3:2)")).toBeInTheDocument();
    });
  });

  test("サムネ工程が合計≠100の場合、比率省略の文字列＋mix.badgeWarningを併記する", async () => {
    const part = makePart({
      id: "part_1",
      steps: [
        makeStep({
          id: "stp_1",
          photoId: "pht_1",
          paints: [{ colorId: "col_a" }, { colorId: "col_b" }],
          mix: [60, 50],
        }),
      ],
    });
    render(
      <PartCard part={part} order={1} onOpen={vi.fn()} onReview={vi.fn()} />,
    );

    await waitFor(() => {
      expect(screen.getByText("60% + 50%")).toBeInTheDocument();
    });
    expect(screen.getByText("⚠ 計 110%")).toBeInTheDocument();
  });

  test("サムネ工程が単色（paints.length<=1）の場合はバッジを表示しない", async () => {
    const part = makePart({
      id: "part_1",
      steps: [
        makeStep({
          id: "stp_1",
          photoId: "pht_1",
          paints: [{ colorId: "col_a" }],
          mix: null,
        }),
      ],
    });
    render(
      <PartCard part={part} order={1} onOpen={vi.fn()} onReview={vi.fn()} />,
    );

    await waitFor(() => {
      expect(screen.getByText("STEP 1")).toBeInTheDocument();
    });
    expect(screen.queryByText(/%/)).not.toBeInTheDocument();
  });
});

describe("PartCard — タップでonOpen", () => {
  test("カードをクリックするとonOpen(part.id)が呼ばれる", () => {
    const part = makePart({ id: "part_1", name: "腕" });
    const onOpen = vi.fn();
    render(
      <PartCard part={part} order={1} onOpen={onOpen} onReview={vi.fn()} />,
    );

    fireEvent.click(screen.getByTestId("part-card"));
    expect(onOpen).toHaveBeenCalledWith("part_1");
  });

  test("パーツ名と工程数を表示する", () => {
    const part = makePart({
      id: "part_1",
      name: "兜",
      steps: [makeStep({ id: "stp_1" }), makeStep({ id: "stp_2" })],
    });
    render(
      <PartCard part={part} order={1} onOpen={vi.fn()} onReview={vi.fn()} />,
    );

    expect(screen.getByText("兜")).toBeInTheDocument();
    expect(screen.getByText("工程 2")).toBeInTheDocument();
  });
});

describe("PartCard — 工程レビューボタン", () => {
  test("工程レビューボタンをクリックするとonReview(part.id)が呼ばれ、onOpenは呼ばれない（stopPropagation）", () => {
    const part = makePart({ id: "part_1" });
    const onOpen = vi.fn();
    const onReview = vi.fn();
    render(
      <PartCard part={part} order={1} onOpen={onOpen} onReview={onReview} />,
    );

    fireEvent.click(screen.getByTestId("part-review-open"));
    expect(onReview).toHaveBeenCalledWith("part_1");
    expect(onOpen).not.toHaveBeenCalled();
  });
});
