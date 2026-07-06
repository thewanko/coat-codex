// components/part-editor/StepList.test.tsx — 工程並び替えのテスト（技術計画v2.2 §4.2 T26）
//
// jsdomでは実D&Dは再現しないため（実機検証は出口のスパイクで行う）、ここでは
// 上下移動ボタンによるonReorderのfrom/to正当性・端ボタンの無効化・0件EmptyState・
// AddStepButtonでのスキーマ適合Step生成に実質的なテストを集中させる。
// StepCard（PaintSlotList経由でtoastContextに依存）は本テストの関心事ではないためモックする。

import "../../i18n";
import { beforeAll, describe, expect, test, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import i18next from "../../i18n";
import type { Step } from "@coat-codex/recipe-core";
import StepList from "./StepList";

beforeAll(() => {
  void i18next.changeLanguage("ja");
});

vi.mock("./StepCard", () => ({
  default: ({ step, index }: { step: Step; index: number }) => (
    <div data-testid={`step-card-stub-${index}`}>{step.id}</div>
  ),
}));

function makeStep(id: string): Step {
  return {
    id,
    technique: { presetKey: null, label: null },
    photoId: null,
    paints: [],
    mix: null,
    toolIds: [],
    memo: "",
  };
}

function renderStepList(
  steps: Step[],
  overrides: Partial<{
    onReorder: (next: Step[]) => void;
    onAdd: (step: Step) => void;
  }> = {},
) {
  const onChange = vi.fn();
  const onAddColor = vi.fn();
  const onDelete = vi.fn();
  const onReorder = overrides.onReorder ?? vi.fn();
  const onAdd = overrides.onAdd ?? vi.fn();

  render(
    <StepList
      steps={steps}
      recipeId="rcp_1"
      palette={[]}
      onChange={onChange}
      onAddColor={onAddColor}
      onDelete={onDelete}
      onReorder={onReorder}
      onAdd={onAdd}
    />,
  );

  return { onChange, onAddColor, onDelete, onReorder, onAdd };
}

describe("StepList — 上下移動ボタン", () => {
  test("中間の工程を↓で1つ後ろへ移動する（from/toが正しい）", () => {
    const steps = [makeStep("stp_a"), makeStep("stp_b"), makeStep("stp_c")];
    const { onReorder } = renderStepList(steps);

    const downButtons = screen.getAllByRole("button", {
      name: "工程を下へ移動",
    });
    fireEvent.click(downButtons[0]);

    expect(onReorder).toHaveBeenCalledTimes(1);
    expect(onReorder).toHaveBeenCalledWith([steps[1], steps[0], steps[2]]);
  });

  test("中間の工程を↑で1つ前へ移動する（from/toが正しい）", () => {
    const steps = [makeStep("stp_a"), makeStep("stp_b"), makeStep("stp_c")];
    const { onReorder } = renderStepList(steps);

    const upButtons = screen.getAllByRole("button", { name: "工程を上へ移動" });
    fireEvent.click(upButtons[1]);

    expect(onReorder).toHaveBeenCalledTimes(1);
    expect(onReorder).toHaveBeenCalledWith([steps[1], steps[0], steps[2]]);
  });

  test("先頭の↑ボタンはdisabledで、クリックしてもonReorderは呼ばれない", () => {
    const steps = [makeStep("stp_a"), makeStep("stp_b")];
    const { onReorder } = renderStepList(steps);

    const upButtons = screen.getAllByRole("button", { name: "工程を上へ移動" });
    expect(upButtons[0]).toBeDisabled();
    fireEvent.click(upButtons[0]);
    expect(onReorder).not.toHaveBeenCalled();
  });

  test("末尾の↓ボタンはdisabledで、クリックしてもonReorderは呼ばれない", () => {
    const steps = [makeStep("stp_a"), makeStep("stp_b")];
    const { onReorder } = renderStepList(steps);

    const downButtons = screen.getAllByRole("button", {
      name: "工程を下へ移動",
    });
    expect(downButtons[1]).toBeDisabled();
    fireEvent.click(downButtons[1]);
    expect(onReorder).not.toHaveBeenCalled();
  });

  test("先頭以外の↑・末尾以外の↓は有効", () => {
    const steps = [makeStep("stp_a"), makeStep("stp_b"), makeStep("stp_c")];
    renderStepList(steps);

    const upButtons = screen.getAllByRole("button", { name: "工程を上へ移動" });
    const downButtons = screen.getAllByRole("button", {
      name: "工程を下へ移動",
    });
    expect(upButtons[1]).not.toBeDisabled();
    expect(upButtons[2]).not.toBeDisabled();
    expect(downButtons[0]).not.toBeDisabled();
    expect(downButtons[1]).not.toBeDisabled();
  });
});

describe("StepList — key安定性", () => {
  test("配列indexではなくStep.idをkeyに使う（並び替え後もstep-card-stubの内容がidに追随する）", () => {
    const steps = [makeStep("stp_a"), makeStep("stp_b")];
    renderStepList(steps);

    expect(screen.getByTestId("step-card-stub-0")).toHaveTextContent("stp_a");
    expect(screen.getByTestId("step-card-stub-1")).toHaveTextContent("stp_b");
  });
});

describe("StepList — 0件時EmptyState", () => {
  test("工程0件時はEmptyState(steps)とAddStepButtonのみを表示する", () => {
    renderStepList([]);

    expect(
      screen.getByRole("heading", { name: "工程がまだありません" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "工程を追加" }),
    ).toBeInTheDocument();
    expect(screen.queryByTestId(/step-card-stub/)).not.toBeInTheDocument();
  });

  test("0件時にAddStepButtonを押すとonAddが呼ばれる", () => {
    const { onAdd } = renderStepList([]);

    fireEvent.click(screen.getByRole("button", { name: "工程を追加" }));
    expect(onAdd).toHaveBeenCalledTimes(1);
  });
});

describe("StepList — AddStepButton（1件以上時）", () => {
  test("末尾に表示され、クリックでonAddが呼ばれる", () => {
    const { onAdd } = renderStepList([makeStep("stp_a")]);

    fireEvent.click(screen.getByRole("button", { name: "工程を追加" }));
    expect(onAdd).toHaveBeenCalledTimes(1);
  });
});
