import "../../i18n";
import { describe, expect, test, vi, beforeAll } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import i18next from "../../i18n";
import PhotoCropDialog from "./PhotoCropDialog";

beforeAll(() => {
  void i18next.changeLanguage("ja");
  // jsdomはwindow.scrollToを実装していないため、bodyスクロールロックのcleanupが
  // window.scrollTo(0, scrollY)を呼ぶ本実装のテストに必要な最小スタブを用意する。
  window.scrollTo = vi.fn();
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

  test("imgロード後、naturalWidth/Heightの比率がstageへaspect-ratioスタイルとして適用される（フレーム基準正規化=画像基準正規化のバグ修正）", async () => {
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
    // DOM階層: .stage > .frame > img。座標基準（getFrameDelta）は.stageのボックス。
    const stage = img.parentElement?.parentElement as HTMLElement;

    // ロード前はaspect-ratioスタイルが未適用（フォールバックCSSの4/3に委ねる）
    expect(stage.style.aspectRatio).toBe("");

    Object.defineProperty(img, "naturalWidth", { value: 1200 });
    Object.defineProperty(img, "naturalHeight", { value: 1600 });
    fireEvent.load(img);

    expect(stage.style.aspectRatio).toBe("1200 / 1600");
  });

  test("shadeRect（暗転専用矩形）はcropRectと同一のleft/top/width/heightスタイルを持つ（ハンドルクリップ解消の2層化: 暗転はframe内でクリップ、矩形＋ハンドルはoverlayでvisible）", () => {
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
    // 安定セレクタで直接取得（DOM順・resolvePhotoUrl解決タイミングへの暗黙依存を避ける。レビューM-1）
    const shadeRect = screen.getByTestId("crop-shade-rect");

    expect(shadeRect).not.toBeNull();
    expect(shadeRect?.getAttribute("aria-hidden")).toBe("true");
    expect(shadeRect?.style.left).toBe(rect.style.left);
    expect(shadeRect?.style.top).toBe(rect.style.top);
    expect(shadeRect?.style.width).toBe(rect.style.width);
    expect(shadeRect?.style.height).toBe(rect.style.height);
  });

  test("bodyスクロールロック: open中はposition:fixed+top(-scrollY)+width:100%へ固定し、closeで元の値とscrollYへ復元する", () => {
    Object.defineProperty(window, "scrollY", {
      value: 240,
      configurable: true,
    });
    document.body.style.position = "";
    document.body.style.top = "";
    document.body.style.width = "";
    const scrollToSpy = vi.mocked(window.scrollTo);
    scrollToSpy.mockClear();

    const { rerender } = render(
      <PhotoCropDialog
        open
        photoId="ph_1"
        initialCrop={null}
        onSave={vi.fn()}
        onClose={vi.fn()}
      />,
    );

    expect(document.body.style.position).toBe("fixed");
    expect(document.body.style.top).toBe("-240px");
    expect(document.body.style.width).toBe("100%");

    rerender(
      <PhotoCropDialog
        open={false}
        photoId="ph_1"
        initialCrop={null}
        onSave={vi.fn()}
        onClose={vi.fn()}
      />,
    );

    expect(document.body.style.position).toBe("");
    expect(document.body.style.top).toBe("");
    expect(document.body.style.width).toBe("");
    expect(scrollToSpy).toHaveBeenCalledWith(0, 240);
  });

  test("bodyスクロールロック: アンマウント経路でも元の値とscrollYへ復元する", () => {
    Object.defineProperty(window, "scrollY", {
      value: 88,
      configurable: true,
    });
    document.body.style.position = "";
    document.body.style.top = "";
    document.body.style.width = "";
    const scrollToSpy = vi.mocked(window.scrollTo);
    scrollToSpy.mockClear();

    const { unmount } = render(
      <PhotoCropDialog
        open
        photoId="ph_1"
        initialCrop={null}
        onSave={vi.fn()}
        onClose={vi.fn()}
      />,
    );

    expect(document.body.style.position).toBe("fixed");

    unmount();

    expect(document.body.style.position).toBe("");
    expect(document.body.style.top).toBe("");
    expect(document.body.style.width).toBe("");
    expect(scrollToSpy).toHaveBeenCalledWith(0, 88);
  });

  test("open中は.stage（クロップ範囲の祖先）へのtouchmoveディスパッチでpreventDefaultが呼ばれる（背後スクロール吸われ対策）", async () => {
    render(
      <PhotoCropDialog
        open
        photoId="ph_1"
        initialCrop={null}
        onSave={vi.fn()}
        onClose={vi.fn()}
      />,
    );

    const rect = screen.getByRole("group", { name: /クロップ範囲/ });
    // .stage = .overlayの親 = .cropRectの祖先（.overlay.parentElement）
    const stage = rect.parentElement?.parentElement as HTMLElement;

    const touchMoveEvent = new Event("touchmove", {
      bubbles: true,
      cancelable: true,
    });
    stage.dispatchEvent(touchMoveEvent);

    expect(touchMoveEvent.defaultPrevented).toBe(true);
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
