// components/part-editor/StepPhotoStrip.test.tsx — 写真つき工程抽出・タップ遷移のテスト
// （技術計画v2.2 §4.2 T27・v2.2 §8-A）
//
// タップ→scrollIntoViewのテストは、実StepCardを描画した結合テストとする（M4 Opusレビュー
// Round1 High）。StepPhotoStripは`document.getElementById("step-card-{index}")`でスクロール先を
// 解決するため、StepCard側がid属性を実際に持つことをテスト経由で保証する（自前divの注入では
// StepCard側のid欠落バグを検出できない）。

import "../../i18n";
import { afterEach, beforeAll, describe, expect, test, vi } from "vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import i18next from "../../i18n";
import type { Step } from "@coat-codex/recipe-core";
import {
  useRecipeStore,
  __resetRecipeStoreForTest,
} from "../../stores/useRecipeStore";
import ToastHost from "../common/ToastHost";
import StepCard from "./StepCard";
import StepPhotoStrip from "./StepPhotoStrip";

beforeAll(() => {
  void i18next.changeLanguage("ja");
});

afterEach(() => {
  __resetRecipeStoreForTest();
  vi.restoreAllMocks();
});

vi.mock("../../db/photoStore", () => ({
  resolvePhotoUrl: vi.fn().mockResolvedValue("blob:mock-url"),
  savePhoto: vi.fn(),
  deletePhoto: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("./PaintSlotList", () => ({
  default: () => <div>paint-slot-list-stub</div>,
}));

function makeStep(id: string, photoId: string | null): Step {
  return {
    id,
    technique: { presetKey: null, label: null },
    photoId,
    paints: [],
    mix: null,
    toolIds: [],
    memo: "",
  };
}

describe("StepPhotoStrip", () => {
  test("写真つき工程が0件の場合は何も表示しない", () => {
    const { container } = render(
      <StepPhotoStrip
        steps={[makeStep("stp_a", null), makeStep("stp_b", null)]}
      />,
    );
    expect(container).toBeEmptyDOMElement();
  });

  test("写真つき工程のみをSTEP番号（全体通し番号）付きで抽出する", async () => {
    const steps = [
      makeStep("stp_a", null),
      makeStep("stp_b", "pht_1"),
      makeStep("stp_c", "pht_2"),
    ];
    render(<StepPhotoStrip steps={steps} />);

    await waitFor(() => {
      expect(
        screen.getByRole("button", { name: "STEP 2の写真へ移動" }),
      ).toBeInTheDocument();
    });
    expect(
      screen.getByRole("button", { name: "STEP 3の写真へ移動" }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "STEP 1の写真へ移動" }),
    ).not.toBeInTheDocument();
  });

  test("タップで実StepCard要素（id=step-card-{index}）のscrollIntoViewが呼ばれる", async () => {
    useRecipeStore.setState({
      doc: {
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
      },
    });

    const scrollSpy = vi.fn();
    // jsdomにscrollIntoView未実装のためprototypeへspyを仕込む（実装は変更しない）
    window.HTMLElement.prototype.scrollIntoView = scrollSpy;

    const steps = [makeStep("stp_a", null), makeStep("stp_b", "pht_1")];
    render(
      <ToastHost>
        <StepCard
          step={steps[1]}
          index={1}
          recipeId="rcp_1"
          palette={[]}
          onChange={vi.fn()}
          onAddColor={vi.fn()}
          onDelete={vi.fn()}
        />
        <StepPhotoStrip steps={steps} />
      </ToastHost>,
    );

    // スクロール先が実StepCardの描画物であることを検証（写経-adjacentな自前div注入を避ける）
    const stepCardRoot = screen.getByTestId("step-card-1");
    expect(stepCardRoot).toHaveAttribute("id", "step-card-1");

    const button = await screen.findByRole("button", {
      name: "STEP 2の写真へ移動",
    });

    fireEvent.click(button);
    expect(scrollSpy).toHaveBeenCalledTimes(1);
    expect(scrollSpy.mock.instances[0]).toBe(stepCardRoot);
  });
});
