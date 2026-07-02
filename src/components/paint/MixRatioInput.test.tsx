import "../../i18n";
import { beforeAll, describe, expect, test, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import i18next from "../../i18n";
import MixRatioInput from "./MixRatioInput";
import type { MixState } from "../../lib/mixRatio";

beforeAll(() => {
  void i18next.changeLanguage("ja");
});

function twoColorState(mix: number[] | null): MixState {
  return {
    paints: [{ colorId: "col_a" }, { colorId: "col_b" }],
    mix,
  };
}

describe("MixRatioInput", () => {
  test("mix=null（単色・塗料0件）では何も描画しない", () => {
    const onChange = vi.fn();
    const { container } = render(
      <MixRatioInput state={{ paints: [], mix: null }} onChange={onChange} />,
    );
    expect(container).toBeEmptyDOMElement();
  });

  test("合計100のとき比率が併記表示される", () => {
    render(
      <MixRatioInput state={twoColorState([60, 40])} onChange={vi.fn()} />,
    );
    const input = screen.getByLabelText("MIX") as HTMLInputElement;
    expect(input.value).toBe("3:2");
    expect(input).not.toBeDisabled();
    expect(screen.getByText("計 100%")).toBeInTheDocument();
  });

  test("合計≠100のとき比率欄は「—」でdisabled、警告メッセージ表示", () => {
    render(
      <MixRatioInput state={twoColorState([60, 50])} onChange={vi.fn()} />,
    );
    const input = screen.getByLabelText("MIX") as HTMLInputElement;
    expect(input.value).toBe("—");
    expect(input).toBeDisabled();
    expect(screen.getByText("計 110%")).toBeInTheDocument();
    expect(
      screen.getByText("合計が100%になるよう調整してください"),
    ).toBeInTheDocument();
  });

  test("比率入力→blurでonChangeにexpandRatioToPercentsの展開結果が渡る", () => {
    const onChange = vi.fn();
    render(
      <MixRatioInput state={twoColorState([50, 50])} onChange={onChange} />,
    );
    const input = screen.getByLabelText("MIX") as HTMLInputElement;
    fireEvent.change(input, { target: { value: "3:2" } });
    fireEvent.blur(input);

    expect(onChange).toHaveBeenCalledWith({
      paints: [{ colorId: "col_a" }, { colorId: "col_b" }],
      mix: [60, 40],
    });
  });

  test("比率入力→Enterでも確定する", () => {
    const onChange = vi.fn();
    render(
      <MixRatioInput state={twoColorState([50, 50])} onChange={onChange} />,
    );
    const input = screen.getByLabelText("MIX") as HTMLInputElement;
    fireEvent.change(input, { target: { value: "1:1" } });
    fireEvent.keyDown(input, { key: "Enter" });

    expect(onChange).toHaveBeenCalledWith({
      paints: [{ colorId: "col_a" }, { colorId: "col_b" }],
      mix: [50, 50],
    });
  });

  test("不正入力（パース不能）はonChange不発でerror表示", () => {
    const onChange = vi.fn();
    render(
      <MixRatioInput state={twoColorState([60, 40])} onChange={onChange} />,
    );
    const input = screen.getByLabelText("MIX") as HTMLInputElement;
    fireEvent.change(input, { target: { value: "abc" } });
    fireEvent.blur(input);

    expect(onChange).not.toHaveBeenCalled();
    expect(input.getAttribute("aria-invalid")).toBe("true");
  });

  test("項数不一致はonChange不発でerror表示", () => {
    const onChange = vi.fn();
    render(
      <MixRatioInput state={twoColorState([60, 40])} onChange={onChange} />,
    );
    const input = screen.getByLabelText("MIX") as HTMLInputElement;
    fireEvent.change(input, { target: { value: "5:3:2" } });
    fireEvent.blur(input);

    expect(onChange).not.toHaveBeenCalled();
    expect(input.getAttribute("aria-invalid")).toBe("true");
  });

  test("約分不能な合計100は比率欄が空（プレースホルダのみ）", () => {
    render(
      <MixRatioInput state={twoColorState([55, 45])} onChange={vi.fn()} />,
    );
    const input = screen.getByLabelText("MIX") as HTMLInputElement;
    expect(input.value).toBe("");
    expect(input).not.toBeDisabled();
  });
});
