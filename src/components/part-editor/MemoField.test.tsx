import "../../i18n";
import { beforeAll, describe, expect, test, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import i18next from "../../i18n";
import MemoField from "./MemoField";

beforeAll(() => {
  void i18next.changeLanguage("ja");
});

describe("MemoField", () => {
  test("valueをtextareaへ反映する", () => {
    render(<MemoField value="既存メモ" onChange={vi.fn()} />);
    const textarea = screen.getByLabelText("メモ") as HTMLTextAreaElement;
    expect(textarea.value).toBe("既存メモ");
  });

  test("空文字のときplaceholderを表示する", () => {
    render(<MemoField value="" onChange={vi.fn()} />);
    expect(screen.getByPlaceholderText("メモ（任意）")).toBeInTheDocument();
  });

  test("入力するとonChangeへ変更後の文字列が渡る", () => {
    const onChange = vi.fn();
    render(<MemoField value="" onChange={onChange} />);
    const textarea = screen.getByLabelText("メモ") as HTMLTextAreaElement;
    fireEvent.change(textarea, { target: { value: "新しいメモ" } });
    expect(onChange).toHaveBeenCalledWith("新しいメモ");
  });

  test("複数行の入力もそのままonChangeへ渡る", () => {
    const onChange = vi.fn();
    render(<MemoField value="" onChange={onChange} />);
    const textarea = screen.getByLabelText("メモ") as HTMLTextAreaElement;
    fireEvent.change(textarea, { target: { value: "1行目\n2行目" } });
    expect(onChange).toHaveBeenCalledWith("1行目\n2行目");
  });
});
