// components/common/useFocusTrap.test.tsx — 全ダイアログ共通フォーカストラップ（T46）
//
// Tab循環（最後→最初・最初→最後）・Escape close・初期フォーカス・復帰フォーカスを検証する。

import { useRef, useState } from "react";
import { describe, expect, test, vi } from "vitest";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { useFocusTrap } from "./useFocusTrap";

interface TestDialogProps {
  open: boolean;
  onClose: () => void;
  useInitialFocusRef?: boolean;
}

function TestDialog({ open, onClose, useInitialFocusRef }: TestDialogProps) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const secondButtonRef = useRef<HTMLButtonElement>(null);

  useFocusTrap({
    containerRef: dialogRef,
    open,
    onClose,
    initialFocusRef: useInitialFocusRef ? secondButtonRef : undefined,
  });

  if (!open) {
    return null;
  }

  return (
    <div ref={dialogRef} role="dialog" aria-modal="true">
      <button type="button">first</button>
      <button ref={secondButtonRef} type="button">
        second
      </button>
      <button type="button">third</button>
    </div>
  );
}

function TestHarness({ useInitialFocusRef }: { useInitialFocusRef?: boolean }) {
  const [open, setOpen] = useState(true);
  return (
    <div>
      <button type="button" onClick={() => setOpen(true)}>
        opener
      </button>
      <TestDialog
        open={open}
        onClose={() => setOpen(false)}
        useInitialFocusRef={useInitialFocusRef}
      />
    </div>
  );
}

describe("useFocusTrap", () => {
  test("open時、既定では先頭のフォーカス可能要素へ初期フォーカスする", () => {
    render(<TestDialog open onClose={vi.fn()} />);
    expect(screen.getByRole("button", { name: "first" })).toHaveFocus();
  });

  test("initialFocusRefが指定されていればその要素へ初期フォーカスする", () => {
    render(<TestDialog open onClose={vi.fn()} useInitialFocusRef />);
    expect(screen.getByRole("button", { name: "second" })).toHaveFocus();
  });

  test("Escape押下でonCloseが呼ばれる", () => {
    const onClose = vi.fn();
    render(<TestDialog open onClose={onClose} />);
    fireEvent.keyDown(window, { key: "Escape" });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  test("末尾要素でTabを押すと先頭要素へ循環する", () => {
    render(<TestDialog open onClose={vi.fn()} />);
    const third = screen.getByRole("button", { name: "third" });
    third.focus();
    fireEvent.keyDown(window, { key: "Tab" });
    expect(screen.getByRole("button", { name: "first" })).toHaveFocus();
  });

  test("先頭要素でShift+Tabを押すと末尾要素へ循環する", () => {
    render(<TestDialog open onClose={vi.fn()} />);
    const first = screen.getByRole("button", { name: "first" });
    first.focus();
    fireEvent.keyDown(window, { key: "Tab", shiftKey: true });
    expect(screen.getByRole("button", { name: "third" })).toHaveFocus();
  });

  test("中間要素でのTabは既定のフォーカス順に任せ、循環処理を行わない（preventDefaultしない）", () => {
    render(<TestDialog open onClose={vi.fn()} />);
    const first = screen.getByRole("button", { name: "first" });
    first.focus();
    const event = new KeyboardEvent("keydown", {
      key: "Tab",
      bubbles: true,
      cancelable: true,
    });
    window.dispatchEvent(event);
    expect(event.defaultPrevented).toBe(false);
  });

  test("閉じた時、開く前にフォーカスされていた要素へフォーカスを戻す", () => {
    render(<TestHarness />);
    const opener = screen.getByRole("button", { name: "opener" });
    opener.focus();

    act(() => {
      // 開き直す（TestHarnessは初期状態でopen=trueのため、一度閉じてから開き直して
      // 「開く前のフォーカス位置」をopenerに固定する）
      fireEvent.keyDown(window, { key: "Escape" });
    });
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(opener).toHaveFocus();

    opener.focus();
    fireEvent.click(opener);
    expect(screen.getByRole("dialog")).toBeInTheDocument();

    fireEvent.keyDown(window, { key: "Escape" });
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(opener).toHaveFocus();
  });

  test("条件付きマウント（閉=アンマウント）のダイアログでも、閉じた時に開く前のフォーカス位置へ戻る", () => {
    function ConditionalHarness() {
      const [open, setOpen] = useState(false);
      return (
        <div>
          <button type="button" onClick={() => setOpen(true)}>
            opener
          </button>
          {open && <TestDialog open onClose={() => setOpen(false)} />}
        </div>
      );
    }
    render(<ConditionalHarness />);
    const opener = screen.getByRole("button", { name: "opener" });
    opener.focus();
    expect(opener).toHaveFocus();

    fireEvent.click(opener);
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "first" })).toHaveFocus();

    fireEvent.keyDown(window, { key: "Escape" });
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(opener).toHaveFocus();
  });

  test("復帰先の要素がDOMから消えていればno-op（エラーを投げない）", () => {
    function Harness() {
      const [showOpener, setShowOpener] = useState(true);
      const [open, setOpen] = useState(false);
      return (
        <div>
          {showOpener && (
            <button
              type="button"
              onClick={() => {
                setOpen(true);
                setShowOpener(false);
              }}
            >
              opener
            </button>
          )}
          <TestDialog open={open} onClose={() => setOpen(false)} />
        </div>
      );
    }
    render(<Harness />);
    const opener = screen.getByRole("button", { name: "opener" });
    opener.focus();
    fireEvent.click(opener);
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "opener" }),
    ).not.toBeInTheDocument();

    expect(() => {
      fireEvent.keyDown(window, { key: "Escape" });
    }).not.toThrow();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });
});
