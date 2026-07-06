import "../../i18n";
import { beforeAll, describe, expect, test, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import i18next from "../../i18n";
import ConfirmDialog from "./ConfirmDialog";

beforeAll(() => {
  void i18next.changeLanguage("ja");
});

describe("ConfirmDialog", () => {
  test("renders nothing when open=false", () => {
    render(
      <ConfirmDialog
        open={false}
        title="削除しますか"
        onConfirm={vi.fn()}
        onCancel={vi.fn()}
      />,
    );
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  test("renders dialog with role/aria-modal, irreversible note and cancel label when open", () => {
    render(
      <ConfirmDialog
        open
        title="削除しますか"
        onConfirm={vi.fn()}
        onCancel={vi.fn()}
      />,
    );

    const dialog = screen.getByRole("dialog");
    expect(dialog).toHaveAttribute("aria-modal", "true");
    expect(screen.getByText("削除しますか")).toBeInTheDocument();
    expect(
      screen.getByText("この操作は取り消しできません"),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "キャンセル" }),
    ).toBeInTheDocument();
  });

  test("calls onConfirm when confirm button is clicked", () => {
    const onConfirm = vi.fn();
    render(
      <ConfirmDialog
        open
        title="削除しますか"
        confirmLabel="削除する"
        onConfirm={onConfirm}
        onCancel={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "削除する" }));
    expect(onConfirm).toHaveBeenCalledTimes(1);
  });

  test("calls onCancel when backdrop is clicked", () => {
    const onCancel = vi.fn();
    render(
      <ConfirmDialog
        open
        title="削除しますか"
        onConfirm={vi.fn()}
        onCancel={onCancel}
      />,
    );

    fireEvent.click(screen.getByTestId("confirm-dialog-backdrop"));
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  test("clicking inside the dialog body does not trigger onCancel", () => {
    const onCancel = vi.fn();
    render(
      <ConfirmDialog
        open
        title="削除しますか"
        onConfirm={vi.fn()}
        onCancel={onCancel}
      />,
    );

    fireEvent.click(screen.getByRole("dialog"));
    expect(onCancel).not.toHaveBeenCalled();
  });

  test("calls onCancel when Escape key is pressed", () => {
    const onCancel = vi.fn();
    render(
      <ConfirmDialog
        open
        title="削除しますか"
        onConfirm={vi.fn()}
        onCancel={onCancel}
      />,
    );

    fireEvent.keyDown(window, { key: "Escape" });
    expect(onCancel).toHaveBeenCalledTimes(1);
  });
});
