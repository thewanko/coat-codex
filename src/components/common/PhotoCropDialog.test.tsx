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

  test("矢印キーで矩形が移動する（画像ロード完了後）", async () => {
    render(
      <PhotoCropDialog
        open
        photoId="ph_1"
        initialCrop={{ x: 0.2, y: 0.2, w: 0.3, h: 0.3 }}
        onSave={vi.fn()}
        onClose={vi.fn()}
      />,
    );

    const img = await screen.findByAltText("トリミング対象の写真");
    Object.defineProperty(img, "naturalWidth", { value: 800 });
    Object.defineProperty(img, "naturalHeight", { value: 600 });
    fireEvent.load(img);

    const rect = screen.getByRole("group", { name: /クロップ範囲/ });
    fireEvent.keyDown(rect, { key: "ArrowRight" });
    expect(parseFloat(rect.style.left)).toBeCloseTo(21);

    fireEvent.keyDown(rect, { key: "ArrowDown", shiftKey: true });
    expect(parseFloat(rect.style.top)).toBeCloseTo(25);
  });

  test("画像ロード完了前は矢印キーで矩形が動かない（interactionReadyガード）", () => {
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
    expect(rect.style.left).toBe("20%");
  });

  test("imgロード後、naturalWidth/Heightの比率がframeへaspect-ratioスタイルとして適用される（フレーム基準正規化=画像基準正規化のバグ修正）", async () => {
    render(
      <PhotoCropDialog
        open
        photoId="ph_1"
        initialCrop={null}
        onSave={vi.fn()}
        onClose={vi.fn()}
      />,
    );

    const img = await screen.findByAltText("トリミング対象の写真");
    const frame = img.parentElement as HTMLElement;

    // ロード前はaspect-ratioスタイルが未適用（フォールバックCSSの4/3に委ねる）
    expect(frame.style.aspectRatio).toBe("");

    Object.defineProperty(img, "naturalWidth", { value: 1200 });
    Object.defineProperty(img, "naturalHeight", { value: 1600 });
    fireEvent.load(img);

    expect(frame.style.aspectRatio).toBe("1200 / 1600");
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
