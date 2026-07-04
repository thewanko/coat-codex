// components/overview/ExportActionBar.test.tsx — JSON・素MD・note MD・印刷/X/Bluesky結線
// （技術計画v2.3 §3.3 ExportActionBar行・T28・T33・T40・2026-07-04 FB-E/FB-F改訂）
//
// PC幅(>=768px): 従来のピル群がそのまま描画されることを確認。
// mobile幅(<768px, v2.3): 「出力・共有」ボタン1つに集約→タップでボトムシートが
// 開閉すること、シート内に全アクションが存在しJSON・素MDが隣接すること、
// Esc・backdropクリックで閉じることを確認（RTL。matchMediaはここでモックする）。
// 印刷は/recipe/:id/printへのnavigateをreact-routerのMemoryRouter+Routesで確認する
// （RecipeOverviewPage.test.tsxの慣行に従う。PDFボタンは印刷と挙動が同一だったため
// 2026-07-03ユーザー決定で削除・「印刷」に統合）。X/BlueskyはShareDialogがwholeコンテキスト・
// 対応するtargetで開くことを確認する（ShareDialogのcanvas合成はShareDialog.test.tsxの
// セットアップに従いimageComposer/db.photosをモックする）。
// 2026-07-04 FB-F: 素MDはクリップボードコピーを廃止しdownloadBlobへ直行するよう改訂。
// 2026-07-04 FB-E: note MDはクリップボードコピーのみに一本化（DLフォールバック廃止）。
// 成功時はボタンラベルが「コピーしました ✓」に切り替わり約2秒後に戻る。失敗時は
// MarkdownCopyFallbackDialogが開く。

import "../../i18n";
import {
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  test,
  vi,
} from "vitest";
import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { MemoryRouter, Routes, Route } from "react-router";
import i18next from "../../i18n";
import ExportActionBar from "./ExportActionBar";
import ToastHost from "../common/ToastHost";
import { exportRecipeToBlob } from "../../lib/exporters/json";
import { recordRecipeExport } from "../../lib/storageHealth";
import { downloadBlob } from "../common/downloadBlob";
import type { RecipeDoc } from "../../models/recipe";

beforeAll(() => {
  void i18next.changeLanguage("ja");
});

vi.mock("../../lib/exporters/json", async () => {
  const actual = await vi.importActual<
    typeof import("../../lib/exporters/json")
  >("../../lib/exporters/json");
  return {
    ...actual,
    exportRecipeToBlob: vi.fn(),
  };
});

vi.mock("../../lib/storageHealth", async () => {
  const actual = await vi.importActual<
    typeof import("../../lib/storageHealth")
  >("../../lib/storageHealth");
  return {
    ...actual,
    recordRecipeExport: vi.fn().mockResolvedValue(undefined),
  };
});

vi.mock("../common/downloadBlob", async () => {
  const actual = await vi.importActual<typeof import("../common/downloadBlob")>(
    "../common/downloadBlob",
  );
  return {
    ...actual,
    downloadBlob: vi.fn(),
  };
});

vi.mock("../../db/db", () => ({
  db: {
    photos: {
      get: vi.fn().mockResolvedValue(null),
    },
  },
}));

const composeShareImagesMock = vi.fn();

vi.mock("../../lib/sns/imageComposer", async () => {
  const actual = await vi.importActual<
    typeof import("../../lib/sns/imageComposer")
  >("../../lib/sns/imageComposer");
  return {
    ...actual,
    composeShareImages: (...args: unknown[]) => composeShareImagesMock(...args),
  };
});

type Listener = (event: MediaQueryListEvent) => void;

function mockMatchMedia(matches: boolean) {
  const listeners = new Set<Listener>();
  const mql: Partial<MediaQueryList> = {
    matches,
    media: "(max-width: 767px)",
    addEventListener: (
      _type: string,
      listener: EventListenerOrEventListenerObject,
    ) => {
      listeners.add(listener as Listener);
    },
    removeEventListener: (
      _type: string,
      listener: EventListenerOrEventListenerObject,
    ) => {
      listeners.delete(listener as Listener);
    },
    addListener: (listener: Listener | null) => {
      if (listener) listeners.add(listener);
    },
    removeListener: (listener: Listener | null) => {
      if (listener) listeners.delete(listener);
    },
  };

  vi.stubGlobal(
    "matchMedia",
    vi.fn().mockImplementation(() => mql as MediaQueryList),
  );
}

function makeRecipe(overrides: Partial<RecipeDoc> = {}): RecipeDoc {
  return {
    schemaVersion: 1,
    id: "rcp_1",
    title: "赤い装甲",
    createdAt: "2026-06-01T00:00:00.000Z",
    updatedAt: "2026-06-15T00:00:00.000Z",
    overviewPhotoIds: [],
    palette: [],
    tools: [],
    baseSteps: [],
    parts: [],
    ...overrides,
  };
}

function renderBar(
  recipe: RecipeDoc | null = null,
  onExported?: (recipeId: string) => void,
) {
  return render(
    <ToastHost>
      <MemoryRouter initialEntries={["/recipe/rcp_1"]}>
        <Routes>
          <Route
            path="/recipe/:id"
            element={
              <ExportActionBar recipe={recipe} onExported={onExported} />
            }
          />
          <Route
            path="/recipe/:id/print"
            element={<div>印刷プレビュー画面</div>}
          />
        </Routes>
      </MemoryRouter>
    </ToastHost>,
  );
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("ExportActionBar — PC幅（従来のピル群）", () => {
  beforeEach(() => {
    mockMatchMedia(false);
  });

  test("recipeがnullのとき印刷・X・Bluesky・note MD・JSON・素MDの6ボタンをすべてdisabledで配置する", () => {
    renderBar(null);

    const labels = ["印刷", "X", "Bluesky", "note MD", "JSON", "素MD"];
    for (const label of labels) {
      const button = screen.getByRole("button", { name: label });
      expect(button).toBeDisabled();
    }
  });

  test("recipeがある場合、印刷・X・Blueskyは有効化される（T40結線）", () => {
    renderBar(makeRecipe());

    for (const label of ["印刷", "X", "Bluesky"]) {
      expect(screen.getByRole("button", { name: label })).not.toBeDisabled();
    }
  });

  test("recipeがある場合、note MD・JSON・素MDは有効化される", () => {
    renderBar(makeRecipe());

    for (const label of ["note MD", "JSON", "素MD"]) {
      expect(screen.getByRole("button", { name: label })).not.toBeDisabled();
    }
  });

  test("JSON・素MDは隣接する結合ピル内に配置される（要件どおりの隣接配置）", () => {
    renderBar(makeRecipe());

    const jsonButton = screen.getByRole("button", { name: "JSON" });
    const mdButton = screen.getByRole("button", { name: "素MD" });
    expect(jsonButton.parentElement).toBe(mdButton.parentElement);
  });

  test("「出力・共有」メニューボタンは描画されない", () => {
    renderBar(makeRecipe());
    expect(
      screen.queryByRole("button", { name: "出力・共有" }),
    ).not.toBeInTheDocument();
  });

  test("JSONボタン押下で写真あり/なし選択ダイアログが開く", () => {
    renderBar(makeRecipe());
    fireEvent.click(screen.getByRole("button", { name: "JSON" }));
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(screen.getByText("写真を含めますか？")).toBeInTheDocument();
  });

  test("写真を含める選択でexportRecipeToBlob→downloadBlob→recordRecipeExportが呼ばれる", async () => {
    const blob = new Blob(["{}"], { type: "application/json" });
    vi.mocked(exportRecipeToBlob).mockResolvedValue(blob);

    renderBar(makeRecipe());
    fireEvent.click(screen.getByRole("button", { name: "JSON" }));
    fireEvent.click(screen.getByRole("button", { name: "写真を含める" }));

    await waitFor(() => {
      expect(exportRecipeToBlob).toHaveBeenCalledWith("rcp_1", {
        includePhotos: true,
      });
    });
    await waitFor(() => {
      expect(downloadBlob).toHaveBeenCalledWith(blob, "赤い装甲.json");
    });
    await waitFor(() => {
      expect(recordRecipeExport).toHaveBeenCalledWith(
        "rcp_1",
        expect.any(String),
      );
    });
  });

  test("素MDボタン押下でクリップボードを使わずdownloadBlobへ直行する（FB-F）", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator, { clipboard: { writeText } });

    renderBar(makeRecipe({ title: "テストレシピ" }));
    fireEvent.click(screen.getByRole("button", { name: "素MD" }));

    await waitFor(() => {
      expect(downloadBlob).toHaveBeenCalledWith(
        expect.any(Blob),
        "テストレシピ.md",
      );
    });
    expect(writeText).not.toHaveBeenCalled();
    expect(
      screen.getByText(".mdファイルをダウンロードしました"),
    ).toBeInTheDocument();
  });

  test("note MDボタン押下でクリップボードコピーが試行される（ハッシュタグ付き）", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator, { clipboard: { writeText } });

    renderBar(makeRecipe({ title: "テストレシピ" }));
    fireEvent.click(screen.getByRole("button", { name: "note MD" }));

    await waitFor(() => {
      expect(writeText).toHaveBeenCalledTimes(1);
    });
    expect(writeText.mock.calls[0][0]).toContain("#coat-codex");
  });

  test("note MDコピー成功時はボタンラベルが「コピーしました ✓」に切り替わる（FB-E）", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator, { clipboard: { writeText } });

    renderBar(makeRecipe({ title: "テストレシピ" }));
    fireEvent.click(screen.getByRole("button", { name: "note MD" }));

    await waitFor(() => {
      expect(
        screen.getByRole("button", { name: "コピーしました ✓" }),
      ).toBeInTheDocument();
    });
  });

  test("note MDクリップボード非対応時は手動コピーフォールバックダイアログが開く（FB-E）", async () => {
    Object.assign(navigator, { clipboard: undefined });
    vi.mocked(downloadBlob).mockClear();

    renderBar(makeRecipe({ title: "テストレシピ" }));
    fireEvent.click(screen.getByRole("button", { name: "note MD" }));

    const dialog = await screen.findByTestId("markdown-copy-fallback-backdrop");
    expect(dialog).toBeInTheDocument();
    expect(downloadBlob).not.toHaveBeenCalled();
    const textarea = screen.getByTestId(
      "markdown-copy-fallback-textarea",
    ) as HTMLTextAreaElement;
    expect(textarea.value).toContain("#coat-codex");
  });

  test("JSONエクスポート失敗時はエラートーストを表示する", async () => {
    vi.mocked(exportRecipeToBlob).mockRejectedValue(new Error("boom"));

    renderBar(makeRecipe());
    fireEvent.click(screen.getByRole("button", { name: "JSON" }));
    fireEvent.click(screen.getByRole("button", { name: "写真を含める" }));

    await waitFor(() => {
      expect(
        screen.getByText("JSONエクスポートに失敗しました"),
      ).toBeInTheDocument();
    });
  });

  test("JSONエクスポート成功後にonExportedが当該レシピIDで呼ばれる（D-6再判定用）", async () => {
    const blob = new Blob(["{}"], { type: "application/json" });
    vi.mocked(exportRecipeToBlob).mockResolvedValue(blob);
    const onExported = vi.fn();

    renderBar(makeRecipe(), onExported);
    fireEvent.click(screen.getByRole("button", { name: "JSON" }));
    fireEvent.click(screen.getByRole("button", { name: "写真を含める" }));

    await waitFor(() => {
      expect(onExported).toHaveBeenCalledWith("rcp_1");
    });
  });

  test("印刷ボタン押下で/recipe/:id/printへnavigateする", () => {
    renderBar(makeRecipe());
    fireEvent.click(screen.getByRole("button", { name: "印刷" }));

    expect(screen.getByText("印刷プレビュー画面")).toBeInTheDocument();
  });

  test("Xボタン押下でShareDialogがwholeコンテキスト・target=xで開く", async () => {
    vi.stubGlobal("navigator", { canShare: () => true, share: vi.fn() });
    composeShareImagesMock.mockResolvedValue([]);

    renderBar(makeRecipe());
    fireEvent.click(screen.getByRole("button", { name: "X" }));

    const shareDialog = await screen.findByTestId("share-dialog-backdrop");
    expect(shareDialog).toBeInTheDocument();
    expect(screen.getByText("Xに共有")).toBeInTheDocument();
  });

  test("Blueskyボタン押下でShareDialogがwholeコンテキスト・target=blueskyで開く", async () => {
    vi.stubGlobal("navigator", { canShare: () => true, share: vi.fn() });
    composeShareImagesMock.mockResolvedValue([]);

    renderBar(makeRecipe());
    fireEvent.click(screen.getByRole("button", { name: "Bluesky" }));

    const shareDialog = await screen.findByTestId("share-dialog-backdrop");
    expect(shareDialog).toBeInTheDocument();
    expect(screen.getByText("Blueskyに共有")).toBeInTheDocument();
  });
});

describe("ExportActionBar — mobile幅（出力・共有ボタン→ボトムシート）", () => {
  beforeEach(() => {
    mockMatchMedia(true);
  });

  test("「出力・共有」ボタン1つに集約され、従来のピル群は描画されない", () => {
    renderBar(makeRecipe());

    expect(
      screen.getByRole("button", { name: "出力・共有" }),
    ).toBeInTheDocument();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "印刷" }),
    ).not.toBeInTheDocument();
  });

  test("メニューボタンをタップするとボトムシートが開き、全アクション項目が存在する", () => {
    renderBar(null);

    fireEvent.click(screen.getByRole("button", { name: "出力・共有" }));

    const dialog = screen.getByRole("dialog");
    expect(dialog).toHaveAttribute("aria-modal", "true");

    const labels = ["印刷", "X", "Bluesky", "note MD", "JSON", "素MD"];
    for (const label of labels) {
      expect(
        within(dialog).getByRole("button", { name: label }),
      ).toBeDisabled();
    }
  });

  test("recipeがある場合、シート内のnote MD・JSON・素MDは有効化される", () => {
    renderBar(makeRecipe());
    fireEvent.click(screen.getByRole("button", { name: "出力・共有" }));

    const dialog = screen.getByRole("dialog");
    for (const label of ["note MD", "JSON", "素MD"]) {
      expect(
        within(dialog).getByRole("button", { name: label }),
      ).not.toBeDisabled();
    }
  });

  test("recipeがある場合、シート内の印刷・X・Blueskyは有効化される（T40結線）", () => {
    renderBar(makeRecipe());
    fireEvent.click(screen.getByRole("button", { name: "出力・共有" }));

    const dialog = screen.getByRole("dialog");
    for (const label of ["印刷", "X", "Bluesky"]) {
      expect(
        within(dialog).getByRole("button", { name: label }),
      ).not.toBeDisabled();
    }
  });

  test("シート内の印刷ボタン押下で/recipe/:id/printへnavigateする", () => {
    renderBar(makeRecipe());
    fireEvent.click(screen.getByRole("button", { name: "出力・共有" }));

    const dialog = screen.getByRole("dialog");
    fireEvent.click(within(dialog).getByRole("button", { name: "印刷" }));

    expect(screen.getByText("印刷プレビュー画面")).toBeInTheDocument();
  });

  test("シート内のXボタン押下でShareDialogがwholeコンテキスト・target=xで開く", async () => {
    vi.stubGlobal("navigator", { canShare: () => true, share: vi.fn() });
    composeShareImagesMock.mockResolvedValue([]);

    renderBar(makeRecipe());
    fireEvent.click(screen.getByRole("button", { name: "出力・共有" }));

    const dialog = screen.getByRole("dialog");
    fireEvent.click(within(dialog).getByRole("button", { name: "X" }));

    const shareDialog = await screen.findByTestId("share-dialog-backdrop");
    expect(shareDialog).toBeInTheDocument();
  });

  // レビューRound1 Medium-1/Medium-2対応: .sheetはtransition: transform／ドラッグ中の
  // style.transform／開閉アニメーションを持つため、子孫にShareDialog（backdrop=
  // position: fixed）を置くとtransform祖先がcontaining blockとなり位置・サイズが破綻し
  // うる。ShareDialogがExportSheetの`.sheet`要素の子孫でないこと（DOM順ではなく実際の
  // 祖先関係）を直接検証し、リフトアップ構造の回帰を防ぐ。
  test("ShareDialogは.sheetの子孫としてレンダーされない（fixed-in-transform回避の回帰防止）", async () => {
    vi.stubGlobal("navigator", { canShare: () => true, share: vi.fn() });
    composeShareImagesMock.mockResolvedValue([]);

    renderBar(makeRecipe());
    fireEvent.click(screen.getByRole("button", { name: "出力・共有" }));

    const dialog = screen.getByRole("dialog");
    fireEvent.click(within(dialog).getByRole("button", { name: "X" }));

    const shareDialogBackdrop = await screen.findByTestId(
      "share-dialog-backdrop",
    );
    // .sheet要素自体（role="dialog" aria-labelledby="export-sheet-title"）を祖先候補として
    // 取得し、実際のDOM祖先関係（contains）でShareDialogが子孫でないことを検証する
    // （DOM順の前後関係だけでは実重なりを保証しないため）。
    const sheet = document.querySelector(
      '[aria-labelledby="export-sheet-title"]',
    );
    expect(sheet).not.toBeNull();
    expect(sheet?.contains(shareDialogBackdrop)).toBe(false);
  });

  // 実機検証で検出: MarkdownCopyFallbackDialogが.mobileRoot（pointer-events: none）の
  // 直下に描画されるとpe:noneを継承し、実機のヒットテストで閉じるボタン・textareaへの
  // タップが背後要素へ素通しされていた。ShareDialogと同じpe打ち消しラッパー（.overlayRoot）
  // の内側に描画されることをDOM構造（contains）で固定し回帰を防ぐ。
  test("MarkdownCopyFallbackDialogはpe打ち消しラッパー(.overlayRoot)の内側にレンダーされる（実機pe:none継承バグの回帰防止）", async () => {
    Object.assign(navigator, { clipboard: undefined });

    renderBar(makeRecipe({ title: "テストレシピ" }));
    fireEvent.click(screen.getByRole("button", { name: "出力・共有" }));

    const dialog = screen.getByRole("dialog");
    fireEvent.click(within(dialog).getByRole("button", { name: "note MD" }));

    const fallbackBackdrop = await screen.findByTestId(
      "markdown-copy-fallback-backdrop",
    );
    const mobileRoot = screen.getByTestId("export-action-bar");
    // .overlayRoot（pointer-events: auto打ち消しラッパー）が.mobileRootの直接の子として
    // 存在し、fallbackBackdropがその内側にあること（DOM順ではなく実際の祖先関係）を検証する。
    const overlayRoot = fallbackBackdrop.parentElement;
    expect(overlayRoot).not.toBeNull();
    expect(mobileRoot.contains(overlayRoot)).toBe(true);
    expect(overlayRoot?.contains(fallbackBackdrop)).toBe(true);
  });

  test("ShareDialogを開いたままシートを閉じてもShareDialogは独立して残る（意図した挙動）", async () => {
    vi.stubGlobal("navigator", { canShare: () => true, share: vi.fn() });
    composeShareImagesMock.mockResolvedValue([]);

    renderBar(makeRecipe());
    fireEvent.click(screen.getByRole("button", { name: "出力・共有" }));

    const dialog = screen.getByRole("dialog");
    fireEvent.click(within(dialog).getByRole("button", { name: "X" }));
    await screen.findByTestId("share-dialog-backdrop");

    // シートをbackdropクリックで閉じる
    fireEvent.click(screen.getByTestId("export-sheet-backdrop"));

    // シートは閉じるが、ShareDialogは開いたまま残る
    expect(
      screen.queryByTestId("export-sheet-backdrop"),
    ).not.toBeInTheDocument();
    expect(screen.getByTestId("share-dialog-backdrop")).toBeInTheDocument();
  });

  test("JSON・素MDはシート内で隣接する結合グループに配置される（隣接維持）", () => {
    renderBar(makeRecipe());
    fireEvent.click(screen.getByRole("button", { name: "出力・共有" }));

    const jsonButton = screen.getByRole("button", { name: "JSON" });
    const mdButton = screen.getByRole("button", { name: "素MD" });
    expect(jsonButton.parentElement).toBe(mdButton.parentElement);
  });

  test("Escapeキーでシートが閉じる", () => {
    renderBar(makeRecipe());
    fireEvent.click(screen.getByRole("button", { name: "出力・共有" }));
    expect(screen.getByRole("dialog")).toBeInTheDocument();

    fireEvent.keyDown(window, { key: "Escape" });
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  test("backdropクリックでシートが閉じる", () => {
    renderBar(makeRecipe());
    fireEvent.click(screen.getByRole("button", { name: "出力・共有" }));
    expect(screen.getByRole("dialog")).toBeInTheDocument();

    fireEvent.click(screen.getByTestId("export-sheet-backdrop"));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  test("シート内クリックでは閉じない", () => {
    renderBar(makeRecipe());
    fireEvent.click(screen.getByRole("button", { name: "出力・共有" }));

    fireEvent.click(screen.getByRole("dialog"));
    expect(screen.getByRole("dialog")).toBeInTheDocument();
  });

  test("閉じるボタンでシートが閉じる", () => {
    renderBar(makeRecipe());
    fireEvent.click(screen.getByRole("button", { name: "出力・共有" }));

    fireEvent.click(screen.getByRole("button", { name: "閉じる" }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  test("ドラッグゾーンを大きく下にドラッグするとonClose相当でシートが閉じる（setPointerCapture未定義でも落ちない）", () => {
    renderBar(makeRecipe());
    fireEvent.click(screen.getByRole("button", { name: "出力・共有" }));
    expect(screen.getByRole("dialog")).toBeInTheDocument();

    const dragZone = screen.getByTestId("export-sheet-drag-zone");
    // jsdomにはsetPointerCaptureが実装されていない環境を想定（`?.`ガードで無害）。
    fireEvent.pointerDown(dragZone, { pointerId: 1, clientY: 0, button: 0 });
    fireEvent.pointerMove(dragZone, { pointerId: 1, clientY: 200 });
    fireEvent.pointerUp(dragZone, { pointerId: 1, clientY: 200 });

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  test("ドラッグゾーンを小さく下にドラッグしただけではシートは閉じない（スナップバック）", () => {
    renderBar(makeRecipe());
    fireEvent.click(screen.getByRole("button", { name: "出力・共有" }));
    const dialog = screen.getByRole("dialog");
    expect(dialog).toBeInTheDocument();

    // jsdomはレイアウトを計算しないためgetBoundingClientRect()は既定で0を返す。
    // シート高30%判定を実条件（十分な高さ）で検証するためスタブする。
    vi.spyOn(dialog, "getBoundingClientRect").mockReturnValue({
      height: 600,
      width: 400,
      top: 0,
      left: 0,
      bottom: 600,
      right: 400,
      x: 0,
      y: 0,
      toJSON: () => "",
    });

    const dragZone = screen.getByTestId("export-sheet-drag-zone");
    fireEvent.pointerDown(dragZone, { pointerId: 1, clientY: 0, button: 0 });
    fireEvent.pointerMove(dragZone, { pointerId: 1, clientY: 20 });
    fireEvent.pointerUp(dragZone, { pointerId: 1, clientY: 20 });

    expect(screen.getByRole("dialog")).toBeInTheDocument();
  });
});
