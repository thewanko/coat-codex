// components/part-editor/StepPhotoStrip.test.tsx — 写真つき工程抽出・タップ遷移のテスト
// （技術計画v2.2 §4.2 T27・v2.2 §8-A）

import "../../i18n";
import { beforeAll, describe, expect, test, vi } from "vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import i18next from "../../i18n";
import type { Step } from "../../models/recipe";
import StepPhotoStrip from "./StepPhotoStrip";

beforeAll(() => {
  void i18next.changeLanguage("ja");
});

vi.mock("../../db/photoStore", () => ({
  resolvePhotoUrl: vi.fn().mockResolvedValue("blob:mock-url"),
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

  test("タップで該当工程の要素へscrollIntoViewが呼ばれる", async () => {
    const steps = [makeStep("stp_a", null), makeStep("stp_b", "pht_1")];
    render(
      <>
        <div id="step-card-1" data-testid="target" />
        <StepPhotoStrip steps={steps} />
      </>,
    );

    const button = await screen.findByRole("button", {
      name: "STEP 2の写真へ移動",
    });

    const target = screen.getByTestId("target");
    const scrollSpy = vi.fn();
    target.scrollIntoView = scrollSpy;

    fireEvent.click(button);
    expect(scrollSpy).toHaveBeenCalled();
  });
});
