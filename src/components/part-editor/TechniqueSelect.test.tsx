import "../../i18n";
import { beforeAll, describe, expect, test, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import i18next from "../../i18n";
import TechniqueSelect from "./TechniqueSelect";

beforeAll(() => {
  void i18next.changeLanguage("ja");
});

describe("TechniqueSelect", () => {
  test("presetKey非nullのときプリセット表示名が選択された状態で、自由入力欄は出さない", () => {
    render(
      <TechniqueSelect
        value={{ presetKey: "wash", label: null }}
        onChange={vi.fn()}
      />,
    );
    const select = screen.getByLabelText("技法") as HTMLSelectElement;
    expect(select.value).toBe("wash");
    expect(screen.queryByLabelText("自由入力")).not.toBeInTheDocument();
  });

  test("presetKey=nullのとき自由入力欄を表示し、labelの値を反映する", () => {
    render(
      <TechniqueSelect
        value={{ presetKey: null, label: "オリジナル技法" }}
        onChange={vi.fn()}
      />,
    );
    const input = screen.getByLabelText("自由入力") as HTMLInputElement;
    expect(input.value).toBe("オリジナル技法");
  });

  test("プリセット選択に切替えるとlabelがnullへ倒れる（INV-8: presetKey/label排他）", () => {
    const onChange = vi.fn();
    render(
      <TechniqueSelect
        value={{ presetKey: null, label: "オリジナル技法" }}
        onChange={onChange}
      />,
    );
    const select = screen.getByLabelText("技法") as HTMLSelectElement;
    fireEvent.change(select, { target: { value: "glaze" } });
    expect(onChange).toHaveBeenCalledWith({ presetKey: "glaze", label: null });
  });

  test("自由入力に切替えるとpresetKeyがnullへ倒れる（INV-8: presetKey/label排他）", () => {
    const onChange = vi.fn();
    render(
      <TechniqueSelect
        value={{ presetKey: "wash", label: null }}
        onChange={onChange}
      />,
    );
    const select = screen.getByLabelText("技法") as HTMLSelectElement;
    fireEvent.change(select, { target: { value: "__custom__" } });
    expect(onChange).toHaveBeenCalledWith({ presetKey: null, label: "" });
  });

  test("自由入力欄の変更はpresetKey=null固定でlabelを伝える", () => {
    const onChange = vi.fn();
    render(
      <TechniqueSelect
        value={{ presetKey: null, label: "" }}
        onChange={onChange}
      />,
    );
    const input = screen.getByLabelText("自由入力") as HTMLInputElement;
    fireEvent.change(input, { target: { value: "新しい技法" } });
    expect(onChange).toHaveBeenCalledWith({
      presetKey: null,
      label: "新しい技法",
    });
  });

  test("10プリセット全てがoptionとして表示される", () => {
    render(
      <TechniqueSelect
        value={{ presetKey: "prime", label: null }}
        onChange={vi.fn()}
      />,
    );
    const select = screen.getByLabelText("技法") as HTMLSelectElement;
    // 10プリセット + 自由入力 = 11 options
    expect(select.options.length).toBe(11);
  });
});
