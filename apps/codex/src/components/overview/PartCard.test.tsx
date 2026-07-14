// components/overview/PartCard.test.tsx — サムネ規約・混合バッジ表示のテスト
// （技術計画v2.2 §4.2 T28・§8-A）

import "../../i18n";
import { beforeAll, describe, expect, test, vi } from "vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import i18next from "../../i18n";
import type { PaletteColor, RecipeDoc, Step } from "@coat-codex/recipe-core";
import PartCard from "./PartCard";
import { resolveSwatchHexes } from "./partSwatch";

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

function makeColor(
  overrides: Partial<PaletteColor> & { id: string },
): PaletteColor {
  return {
    source: "custom",
    brand: null,
    name: "色",
    presetId: null,
    hex: "#000000",
    chipPhotoId: null,
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

describe("PartCard — order省略（BASEカード用途）", () => {
  test("order指定時は番号セルを描画する", () => {
    const part = makePart({ id: "part_1" });
    render(
      <PartCard part={part} order={3} onOpen={vi.fn()} onReview={vi.fn()} />,
    );

    expect(screen.getByText("3")).toBeInTheDocument();
  });

  test("order省略時は番号セルを描画しない（カード自体は表示される）", () => {
    const part = makePart({ id: "part_1", name: "ベース工程（全体）" });
    render(<PartCard part={part} onOpen={vi.fn()} onReview={vi.fn()} />);

    const card = screen.getByTestId("part-card");
    expect(
      screen.queryByText(/^\d+$/, { selector: "span" }),
    ).not.toBeInTheDocument();
    expect(card).toBeInTheDocument();
    expect(screen.getByText("ベース工程（全体）")).toBeInTheDocument();
  });
});

describe("PartCard — 操作列（⋮⋮ドラッグハンドル・↑↓✕）の内包（v2.7 T61）", () => {
  test("props未指定ではハンドル・↑↓✕を描画しない", () => {
    const part = makePart({ id: "part_1" });
    render(
      <PartCard part={part} order={1} onOpen={vi.fn()} onReview={vi.fn()} />,
    );

    expect(
      screen.queryByLabelText("ドラッグで並び替え"),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "パーツを上へ移動" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "パーツを下へ移動" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /を削除$/ }),
    ).not.toBeInTheDocument();
  });

  test("props指定で描画され、↑↓✕クリックが各コールバックを呼び、onOpenは呼ばれない", () => {
    const part = makePart({ id: "part_1", name: "腕" });
    const onOpen = vi.fn();
    const onMoveUp = vi.fn();
    const onMoveDown = vi.fn();
    const onRequestDelete = vi.fn();
    render(
      <PartCard
        part={part}
        order={1}
        onOpen={onOpen}
        onReview={vi.fn()}
        dragHandleProps={{}}
        onMoveUp={onMoveUp}
        onMoveDown={onMoveDown}
        onRequestDelete={onRequestDelete}
      />,
    );

    expect(screen.getByLabelText("ドラッグで並び替え")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "パーツを上へ移動" }));
    fireEvent.click(screen.getByRole("button", { name: "パーツを下へ移動" }));
    fireEvent.click(screen.getByRole("button", { name: "腕を削除" }));

    expect(onMoveUp).toHaveBeenCalledTimes(1);
    expect(onMoveDown).toHaveBeenCalledTimes(1);
    expect(onRequestDelete).toHaveBeenCalledTimes(1);
    expect(onOpen).not.toHaveBeenCalled();
  });

  test("✕ボタンでEnterキー操作してもonOpenは呼ばれない（keydownバブルガード）", () => {
    const part = makePart({ id: "part_1", name: "腕" });
    const onOpen = vi.fn();
    const onRequestDelete = vi.fn();
    render(
      <PartCard
        part={part}
        order={1}
        onOpen={onOpen}
        onReview={vi.fn()}
        onRequestDelete={onRequestDelete}
      />,
    );

    fireEvent.keyDown(screen.getByRole("button", { name: "腕を削除" }), {
      key: "Enter",
    });
    expect(onOpen).not.toHaveBeenCalled();
  });

  test("moveUpDisabled/moveDownDisabledがボタンのdisabledに結線される", () => {
    const part = makePart({ id: "part_1" });
    render(
      <PartCard
        part={part}
        order={1}
        onOpen={vi.fn()}
        onReview={vi.fn()}
        onMoveUp={vi.fn()}
        onMoveDown={vi.fn()}
        moveUpDisabled
        moveDownDisabled={false}
      />,
    );

    expect(
      screen.getByRole("button", { name: "パーツを上へ移動" }),
    ).toBeDisabled();
    expect(
      screen.getByRole("button", { name: "パーツを下へ移動" }),
    ).not.toBeDisabled();
  });

  test("ハンドルのクリックはonOpenを発火しない（stopPropagation）", () => {
    const part = makePart({ id: "part_1" });
    const onOpen = vi.fn();
    render(
      <PartCard
        part={part}
        order={1}
        onOpen={onOpen}
        onReview={vi.fn()}
        dragHandleProps={{}}
      />,
    );

    fireEvent.click(screen.getByLabelText("ドラッグで並び替え"));
    expect(onOpen).not.toHaveBeenCalled();
  });
});

describe("resolveSwatchHexes — モバイル2段目スウォッチ解決（純関数）", () => {
  test("0色: 工程にpaintsがなければ空配列・overflow 0を返す", () => {
    const steps = [makeStep({ id: "stp_1" })];
    expect(resolveSwatchHexes(steps, [])).toEqual({
      hexes: [],
      overflowCount: 0,
    });
  });

  test("重複除去: 複数工程に同じcolorIdが出現しても初出のみ1件にまとめる", () => {
    const steps = [
      makeStep({ id: "stp_1", paints: [{ colorId: "col_a" }] }),
      makeStep({
        id: "stp_2",
        paints: [{ colorId: "col_a" }, { colorId: "col_b" }],
      }),
    ];
    const palette = [
      makeColor({ id: "col_a", hex: "#111111" }),
      makeColor({ id: "col_b", hex: "#222222" }),
    ];
    expect(resolveSwatchHexes(steps, palette)).toEqual({
      hexes: ["#111111", "#222222"],
      overflowCount: 0,
    });
  });

  test("8色ちょうど: 上限8件は全て表示しoverflowCountは0", () => {
    const steps = [
      makeStep({
        id: "stp_1",
        paints: Array.from({ length: 8 }, (_, i) => ({
          colorId: `col_${i}`,
        })),
      }),
    ];
    const palette = Array.from({ length: 8 }, (_, i) =>
      makeColor({ id: `col_${i}`, hex: `#00000${i}` }),
    );
    const result = resolveSwatchHexes(steps, palette);
    expect(result.hexes).toHaveLength(8);
    expect(result.overflowCount).toBe(0);
  });

  test("9色: 9件目以降は表示せずoverflowCountに繰り込む", () => {
    const steps = [
      makeStep({
        id: "stp_1",
        paints: Array.from({ length: 9 }, (_, i) => ({
          colorId: `col_${i}`,
        })),
      }),
    ];
    const palette = Array.from({ length: 9 }, (_, i) =>
      makeColor({ id: `col_${i}`, hex: `#00000${i}` }),
    );
    const result = resolveSwatchHexes(steps, palette);
    expect(result.hexes).toHaveLength(8);
    expect(result.overflowCount).toBe(1);
  });

  test("palette不在混在: paletteに存在しないcolorId・hexがnullのcolorIdはスキップして数えない", () => {
    const steps = [
      makeStep({
        id: "stp_1",
        paints: [
          { colorId: "col_missing" },
          { colorId: "col_a" },
          { colorId: "col_null_hex" },
        ],
      }),
    ];
    const palette = [
      makeColor({ id: "col_a", hex: "#333333" }),
      makeColor({ id: "col_null_hex", hex: null }),
    ];
    expect(resolveSwatchHexes(steps, palette)).toEqual({
      hexes: ["#333333"],
      overflowCount: 0,
    });
  });
});

describe("PartCard — モバイル2段目スウォッチ表示", () => {
  test("paletteから解決できる色があればswatch-rowを描画する", () => {
    const part = makePart({
      id: "part_1",
      steps: [
        makeStep({ id: "stp_1", paints: [{ colorId: "col_a" }], mix: null }),
      ],
    });
    const palette = [makeColor({ id: "col_a", hex: "#445566" })];
    render(
      <PartCard
        part={part}
        order={1}
        palette={palette}
        onOpen={vi.fn()}
        onReview={vi.fn()}
      />,
    );

    expect(screen.getByTestId("part-swatch-row")).toBeInTheDocument();
  });

  test("使用色0件（工程なし等）ではswatch-rowを描画しない", () => {
    const part = makePart({ id: "part_1", steps: [] });
    render(
      <PartCard
        part={part}
        order={1}
        palette={[]}
        onOpen={vi.fn()}
        onReview={vi.fn()}
      />,
    );

    expect(screen.queryByTestId("part-swatch-row")).not.toBeInTheDocument();
  });

  test("palette prop省略時もクラッシュせずswatch-rowを描画しない（既存呼び出し互換）", () => {
    const part = makePart({
      id: "part_1",
      steps: [makeStep({ id: "stp_1", paints: [{ colorId: "col_a" }] })],
    });
    render(
      <PartCard part={part} order={1} onOpen={vi.fn()} onReview={vi.fn()} />,
    );

    expect(screen.queryByTestId("part-swatch-row")).not.toBeInTheDocument();
  });
});
