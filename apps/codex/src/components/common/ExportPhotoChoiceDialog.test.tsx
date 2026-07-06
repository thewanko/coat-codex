// components/common/ExportPhotoChoiceDialog.test.tsx — 写真あり/なし選択ダイアログ（T33）

import "../../i18n";
import { beforeAll, describe, expect, test, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import i18next from "../../i18n";
import ExportPhotoChoiceDialog from "./ExportPhotoChoiceDialog";

beforeAll(() => {
  void i18next.changeLanguage("ja");
});

describe("ExportPhotoChoiceDialog", () => {
  test("openがfalseのとき何も描画しない", () => {
    render(
      <ExportPhotoChoiceDialog
        open={false}
        onChoose={vi.fn()}
        onCancel={vi.fn()}
      />,
    );
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  test("「写真を含める」を押すとonChoose(true)が呼ばれる", () => {
    const onChoose = vi.fn();
    render(
      <ExportPhotoChoiceDialog open onChoose={onChoose} onCancel={vi.fn()} />,
    );
    fireEvent.click(screen.getByRole("button", { name: "写真を含める" }));
    expect(onChoose).toHaveBeenCalledWith(true);
  });

  test("「写真を含めない」を押すとonChoose(false)が呼ばれる", () => {
    const onChoose = vi.fn();
    render(
      <ExportPhotoChoiceDialog open onChoose={onChoose} onCancel={vi.fn()} />,
    );
    fireEvent.click(screen.getByRole("button", { name: "写真を含めない" }));
    expect(onChoose).toHaveBeenCalledWith(false);
  });

  test("キャンセルでonCancelが呼ばれる", () => {
    const onCancel = vi.fn();
    render(
      <ExportPhotoChoiceDialog open onChoose={vi.fn()} onCancel={onCancel} />,
    );
    fireEvent.click(screen.getByRole("button", { name: "キャンセル" }));
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  test("backdropクリックでonCancelが呼ばれる", () => {
    const onCancel = vi.fn();
    render(
      <ExportPhotoChoiceDialog open onChoose={vi.fn()} onCancel={onCancel} />,
    );
    fireEvent.click(screen.getByTestId("export-photo-choice-backdrop"));
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  test("Escapeキーでcancelが呼ばれる", () => {
    const onCancel = vi.fn();
    render(
      <ExportPhotoChoiceDialog open onChoose={vi.fn()} onCancel={onCancel} />,
    );
    fireEvent.keyDown(window, { key: "Escape" });
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  test("ダイアログ内クリックでは閉じない", () => {
    const onCancel = vi.fn();
    render(
      <ExportPhotoChoiceDialog open onChoose={vi.fn()} onCancel={onCancel} />,
    );
    fireEvent.click(screen.getByRole("dialog"));
    expect(onCancel).not.toHaveBeenCalled();
  });
});
