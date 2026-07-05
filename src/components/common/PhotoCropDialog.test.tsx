import "../../i18n";
import { describe, expect, test, vi, beforeAll } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import i18next from "../../i18n";
import PhotoCropDialog from "./PhotoCropDialog";

beforeAll(() => {
  void i18next.changeLanguage("ja");
});

vi.mock("../../db/photoStore", async () => {
  const actual = await vi.importActual<typeof import("../../db/photoStore")>(
    "../../db/photoStore",
  );
  return {
    ...actual,
    resolvePhotoUrl: vi.fn().mockResolvedValue("blob:mock-url"),
  };
});

describe("PhotoCropDialog", () => {
  test("初期矩形: initialCropが未指定なら画像全体（フォーカス移動後もaria-labelを保持）", async () => {
    const onSave = vi.fn();
    const onClose = vi.fn();
    render(
      <PhotoCropDialog
        open
        photoId="ph_1"
        initialCrop={null}
        onSave={onSave}
        onClose={onClose}
      />,
    );

    await waitFor(() => {
      expect(screen.getByTestId("photo-crop-dialog-backdrop")).toBeTruthy();
    });
    const rect = screen.getByRole("group", { name: /クロップ範囲/ });
    expect(rect).toBeInTheDocument();
    expect(rect.style.left).toBe("0%");
    expect(rect.style.top).toBe("0%");
    expect(rect.style.width).toBe("100%");
    expect(rect.style.height).toBe("100%");
  });

  test("初期矩形: initialCropが指定されればその値を反映する", () => {
    render(
      <PhotoCropDialog
        open
        photoId="ph_1"
        initialCrop={{ x: 0.2, y: 0.1, w: 0.5, h: 0.4 }}
        onSave={vi.fn()}
        onClose={vi.fn()}
      />,
    );
    const rect = screen.getByRole("group", { name: /クロップ範囲/ });
    expect(rect.style.left).toBe("20%");
    expect(rect.style.top).toBe("10%");
    expect(rect.style.width).toBe("50%");
    expect(rect.style.height).toBe("40%");
  });

  test("適用ボタンでonSaveが丸め済みの矩形付きで呼ばれる", () => {
    const onSave = vi.fn();
    render(
      <PhotoCropDialog
        open
        photoId="ph_1"
        initialCrop={{ x: 0.123456789, y: 0.1, w: 0.3, h: 0.3 }}
        onSave={onSave}
        onClose={vi.fn()}
      />,
    );
    fireEvent.click(screen.getByText("適用"));
    expect(onSave).toHaveBeenCalledWith({
      x: 0.123457,
      y: 0.1,
      w: 0.3,
      h: 0.3,
    });
  });

  test("リセットボタンでonSave(null)が呼ばれる", () => {
    const onSave = vi.fn();
    render(
      <PhotoCropDialog
        open
        photoId="ph_1"
        initialCrop={{ x: 0.2, y: 0.2, w: 0.3, h: 0.3 }}
        onSave={onSave}
        onClose={vi.fn()}
      />,
    );
    fireEvent.click(screen.getByText("リセット（クロップ解除）"));
    expect(onSave).toHaveBeenCalledWith(null);
  });

  test("キャンセルボタンでonCloseが呼ばれる", () => {
    const onClose = vi.fn();
    render(
      <PhotoCropDialog
        open
        photoId="ph_1"
        initialCrop={null}
        onSave={vi.fn()}
        onClose={onClose}
      />,
    );
    fireEvent.click(screen.getByText("キャンセル"));
    expect(onClose).toHaveBeenCalled();
  });

  test("矢印キーで矩形が移動する", () => {
    render(
      <PhotoCropDialog
        open
        photoId="ph_1"
        initialCrop={{ x: 0.2, y: 0.2, w: 0.3, h: 0.3 }}
        onSave={vi.fn()}
        onClose={vi.fn()}
      />,
    );
    const rect = screen.getByRole("group", { name: /クロップ範囲/ });
    fireEvent.keyDown(rect, { key: "ArrowRight" });
    expect(parseFloat(rect.style.left)).toBeCloseTo(21);

    fireEvent.keyDown(rect, { key: "ArrowDown", shiftKey: true });
    expect(parseFloat(rect.style.top)).toBeCloseTo(25);
  });

  test("open=falseの間は何もレンダーしない", () => {
    render(
      <PhotoCropDialog
        open={false}
        photoId="ph_1"
        initialCrop={null}
        onSave={vi.fn()}
        onClose={vi.fn()}
      />,
    );
    expect(
      screen.queryByTestId("photo-crop-dialog-backdrop"),
    ).not.toBeInTheDocument();
  });
});
