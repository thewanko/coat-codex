// components/common/MarkdownCopyFallbackDialog.test.tsx — noteMDコピー失敗時の手動コピー
// フォールバックダイアログ（2026-07-04 FB-E）
//
// 意匠・構造はConfirmDialog.test.tsxに倣う。共通フック適用先のマウント形態代表性
// （.claude/loop/lessons.md 2026-07-04 M8前半entry）に従い、propトグル形態（openの
// true/false切替）と条件付きマウント形態（`{open && <Dialog/>}`）の両方をテストする。

import "../../i18n";
import { useState } from "react";
import { beforeAll, describe, expect, test, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import i18next from "../../i18n";
import MarkdownCopyFallbackDialog from "./MarkdownCopyFallbackDialog";

beforeAll(() => {
  void i18next.changeLanguage("ja");
});

describe("MarkdownCopyFallbackDialog — propトグル形態", () => {
  test("open=falseのときは何も描画しない", () => {
    render(
      <MarkdownCopyFallbackDialog
        open={false}
        markdown="# タイトル"
        onClose={vi.fn()}
      />,
    );
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  test("open=trueのときrole=dialog・aria-modal・textareaにMarkdown全文を表示する", () => {
    const markdownText = "# タイトル\n本文";
    render(
      <MarkdownCopyFallbackDialog
        open
        markdown={markdownText}
        onClose={vi.fn()}
      />,
    );

    const dialog = screen.getByRole("dialog");
    expect(dialog).toHaveAttribute("aria-modal", "true");
    const textarea = screen.getByTestId(
      "markdown-copy-fallback-textarea",
    ) as HTMLTextAreaElement;
    expect(textarea.value).toBe(markdownText);
    expect(textarea).toHaveAttribute("readonly");
  });

  test("開いた時にtextareaが自動全選択される", () => {
    render(
      <MarkdownCopyFallbackDialog
        open
        markdown="hello world"
        onClose={vi.fn()}
      />,
    );

    const textarea = screen.getByTestId(
      "markdown-copy-fallback-textarea",
    ) as HTMLTextAreaElement;
    expect(textarea.selectionStart).toBe(0);
    expect(textarea.selectionEnd).toBe("hello world".length);
  });

  test("openをtrue→falseへ切り替えるとアンマウントされる", () => {
    const { rerender } = render(
      <MarkdownCopyFallbackDialog open markdown="abc" onClose={vi.fn()} />,
    );
    expect(screen.getByRole("dialog")).toBeInTheDocument();

    rerender(
      <MarkdownCopyFallbackDialog
        open={false}
        markdown="abc"
        onClose={vi.fn()}
      />,
    );
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  test("backdropクリックでonCloseが呼ばれる", () => {
    const onClose = vi.fn();
    render(
      <MarkdownCopyFallbackDialog open markdown="abc" onClose={onClose} />,
    );

    fireEvent.click(screen.getByTestId("markdown-copy-fallback-backdrop"));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  test("ダイアログ本体クリックではonCloseが呼ばれない", () => {
    const onClose = vi.fn();
    render(
      <MarkdownCopyFallbackDialog open markdown="abc" onClose={onClose} />,
    );

    fireEvent.click(screen.getByRole("dialog"));
    expect(onClose).not.toHaveBeenCalled();
  });

  test("閉じるボタン押下でonCloseが呼ばれる", () => {
    const onClose = vi.fn();
    render(
      <MarkdownCopyFallbackDialog open markdown="abc" onClose={onClose} />,
    );

    fireEvent.click(screen.getByRole("button", { name: "閉じる" }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  test("Escapeキー押下でonCloseが呼ばれる", () => {
    const onClose = vi.fn();
    render(
      <MarkdownCopyFallbackDialog open markdown="abc" onClose={onClose} />,
    );

    fireEvent.keyDown(window, { key: "Escape" });
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});

describe("MarkdownCopyFallbackDialog — 条件付きマウント形態（{open && <Dialog/>}）", () => {
  function ConditionalHost({
    open,
    onClose,
  }: {
    open: boolean;
    onClose: () => void;
  }) {
    return (
      <>
        {open && (
          <MarkdownCopyFallbackDialog
            open={open}
            markdown="conditional content"
            onClose={onClose}
          />
        )}
      </>
    );
  }

  test("open=falseのときマウントされずdialogは存在しない", () => {
    render(<ConditionalHost open={false} onClose={vi.fn()} />);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  test("open=trueのときマウントされdialogが描画される", () => {
    render(<ConditionalHost open onClose={vi.fn()} />);
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(screen.getByTestId("markdown-copy-fallback-textarea")).toHaveValue(
      "conditional content",
    );
  });

  test("条件付きアンマウント（open: true→false）でフォーカスが復帰する", () => {
    function Host() {
      return (
        <div>
          <button type="button">outside</button>
          <ConditionalHostToggle />
        </div>
      );
    }

    function ConditionalHostToggle() {
      const [open, setOpen] = useState(true);
      return (
        <>
          {open && (
            <MarkdownCopyFallbackDialog
              open={open}
              markdown="toggle content"
              onClose={() => setOpen(false)}
            />
          )}
        </>
      );
    }

    render(<Host />);
    expect(screen.getByRole("dialog")).toBeInTheDocument();

    fireEvent.keyDown(window, { key: "Escape" });
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });
});
