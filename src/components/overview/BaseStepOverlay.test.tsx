// components/overview/BaseStepOverlay.test.tsx — 技法名チップ列・0件破線ピルのテスト
// （技術計画v2.2 §3.3・§4.2 T28）

import "../../i18n";
import { beforeAll, describe, expect, test, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import i18next from "../../i18n";
import type { Step } from "../../models/recipe";
import BaseStepOverlay from "./BaseStepOverlay";

beforeAll(() => {
  void i18next.changeLanguage("ja");
});

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

describe("BaseStepOverlay — 技法名チップ列", () => {
  test("プリセット技法はi18n techniques.*で解決して表示する", () => {
    const steps = [
      makeStep({ id: "stp_1", technique: { presetKey: "prime", label: null } }),
    ];
    render(<BaseStepOverlay baseSteps={steps} onEdit={vi.fn()} />);

    expect(screen.getByText("プライマー")).toBeInTheDocument();
  });

  test("自由入力技法はlabelをそのまま表示する", () => {
    const steps = [
      makeStep({
        id: "stp_1",
        technique: { presetKey: null, label: "黒サフ" },
      }),
    ];
    render(<BaseStepOverlay baseSteps={steps} onEdit={vi.fn()} />);

    expect(screen.getByText("黒サフ")).toBeInTheDocument();
  });

  test("複数のベース工程は複数チップとして列挙される", () => {
    const steps = [
      makeStep({
        id: "stp_1",
        technique: { presetKey: null, label: "黒サフ" },
      }),
      makeStep({
        id: "stp_2",
        technique: { presetKey: "basecoat", label: null },
      }),
    ];
    render(<BaseStepOverlay baseSteps={steps} onEdit={vi.fn()} />);

    expect(screen.getByText("黒サフ")).toBeInTheDocument();
    expect(screen.getByText("ベースコート")).toBeInTheDocument();
  });

  test("帯（技法チップ列）をクリックするとonEditが呼ばれる", () => {
    const steps = [
      makeStep({
        id: "stp_1",
        technique: { presetKey: null, label: "黒サフ" },
      }),
    ];
    const onEdit = vi.fn();
    render(<BaseStepOverlay baseSteps={steps} onEdit={onEdit} />);

    fireEvent.click(screen.getByTestId("base-step-overlay"));
    expect(onEdit).toHaveBeenCalledTimes(1);
  });

  test("「編集 ›」ラベルを表示する", () => {
    const steps = [makeStep({ id: "stp_1" })];
    render(<BaseStepOverlay baseSteps={steps} onEdit={vi.fn()} />);

    expect(screen.getByText("編集 ›")).toBeInTheDocument();
  });
});

describe("BaseStepOverlay — ベース工程0件", () => {
  test("破線ピル「＋ ベース工程を追加」を表示する", () => {
    render(<BaseStepOverlay baseSteps={[]} onEdit={vi.fn()} />);

    expect(
      screen.getByRole("button", { name: "＋ ベース工程を追加" }),
    ).toBeInTheDocument();
    expect(screen.queryByTestId("base-step-overlay")).not.toBeInTheDocument();
  });

  test("破線ピルをクリックするとonEditが呼ばれる", () => {
    const onEdit = vi.fn();
    render(<BaseStepOverlay baseSteps={[]} onEdit={onEdit} />);

    fireEvent.click(screen.getByTestId("base-step-overlay-empty"));
    expect(onEdit).toHaveBeenCalledTimes(1);
  });
});
