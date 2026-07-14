// components/tools/TagChipEditor.test.tsx — タグチップ列（技術計画v2.6 §2.8/§3.3 T53）

import "../../i18n";
import { afterEach, beforeAll, describe, expect, test, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import i18next from "../../i18n";
import TagChipEditor from "./TagChipEditor";

beforeAll(() => {
  void i18next.changeLanguage("ja");
});

afterEach(() => {
  cleanup();
});

describe("TagChipEditor", () => {
  test("タグを#付きで描画する", () => {
    render(
      <TagChipEditor
        toolName="筆"
        tags={["面相", "drybrush"]}
        onChange={vi.fn()}
      />,
    );
    expect(screen.getByText("#面相")).toBeInTheDocument();
    expect(screen.getByText("#drybrush")).toBeInTheDocument();
  });

  test("追加inputでEnter確定するとonChangeが新配列で呼ばれ、inputがクリアされる", () => {
    const onChange = vi.fn<(next: string[]) => void>();
    render(<TagChipEditor toolName="筆" tags={["面相"]} onChange={onChange} />);

    const input = screen.getByLabelText("筆 にタグを追加");
    fireEvent.change(input, { target: { value: "#新規タグ" } });
    fireEvent.keyDown(input, { key: "Enter" });

    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledWith(["面相", "新規タグ"]);
    expect(input).toHaveValue("");
  });

  test("大小無視で重複するタグの追加はonChangeを呼ばない", () => {
    const onChange = vi.fn<(next: string[]) => void>();
    render(
      <TagChipEditor toolName="筆" tags={["Brush"]} onChange={onChange} />,
    );

    const input = screen.getByLabelText("筆 にタグを追加");
    fireEvent.change(input, { target: { value: "brush" } });
    fireEvent.keyDown(input, { key: "Enter" });

    expect(onChange).not.toHaveBeenCalled();
    expect(input).toHaveValue("");
  });

  test("除去✕クリックで当該タグを除いた配列でonChangeが呼ばれる", () => {
    const onChange = vi.fn<(next: string[]) => void>();
    render(
      <TagChipEditor
        toolName="筆"
        tags={["面相", "drybrush"]}
        onChange={onChange}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "面相 タグを除去 筆" }));

    expect(onChange).toHaveBeenCalledWith(["drybrush"]);
  });
});
