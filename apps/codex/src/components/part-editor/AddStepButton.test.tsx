// components/part-editor/AddStepButton.test.tsx — 工程追加ボタンのテスト（技術計画v2.2 §4.2 T26）

import "../../i18n";
import { beforeAll, describe, expect, test, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import i18next from "../../i18n";
import { stepSchema } from "../../models/recipe";
import AddStepButton from "./AddStepButton";

beforeAll(() => {
  void i18next.changeLanguage("ja");
});

describe("AddStepButton", () => {
  test("「工程を追加」ボタンを表示する", () => {
    render(<AddStepButton onAdd={vi.fn()} />);
    expect(
      screen.getByRole("button", { name: "工程を追加" }),
    ).toBeInTheDocument();
  });

  test("クリックでonAddにスキーマ適合の新規Stepを渡す", () => {
    const onAdd = vi.fn();
    render(<AddStepButton onAdd={onAdd} />);

    fireEvent.click(screen.getByRole("button", { name: "工程を追加" }));

    expect(onAdd).toHaveBeenCalledTimes(1);
    const step = onAdd.mock.calls[0][0];
    expect(() => stepSchema.parse(step)).not.toThrow();
    expect(step.technique).toEqual({ presetKey: null, label: null });
    expect(step.paints).toEqual([]);
    expect(step.mix).toBeNull();
    expect(step.toolIds).toEqual([]);
    expect(step.photoId).toBeNull();
    expect(step.memo).toBe("");
  });

  test("クリックのたびに一意なidを持つStepを生成する", () => {
    const onAdd = vi.fn();
    render(<AddStepButton onAdd={onAdd} />);

    const button = screen.getByRole("button", { name: "工程を追加" });
    fireEvent.click(button);
    fireEvent.click(button);

    const first = onAdd.mock.calls[0][0];
    const second = onAdd.mock.calls[1][0];
    expect(first.id).not.toBe(second.id);
  });
});

describe("AddStepButton — id採番規約", () => {
  test("生成されるStep.idはstp_プレフィックス付き", () => {
    const onAdd = vi.fn();
    render(<AddStepButton onAdd={onAdd} />);
    fireEvent.click(screen.getByRole("button", { name: "工程を追加" }));
    expect(onAdd.mock.calls[0][0].id).toMatch(/^stp_/);
  });
});
