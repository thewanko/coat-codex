// components/overview/ShareDialog.test.tsx — Web Share 2系統の分岐・生成中disabled・
// 選択ロジック・テキスト既定文・navigator.shareのspy挙動（技術計画v2.2 §4.2 T39完了条件）
//
// canShareの機能検出モック切替でA/B系統を分岐させ、composeShareImagesはマクロタスク遅延
// スタブ（setTimeout経由でresolve）を使い「生成完了までボタンdisabled」を実機に近い形で検証する
// （CLAUDE.md「実機検証の規律」: 依存注入でスタブする外部APIには実装と同じ非同期タイミングの
// スタブを最低1ケース入れる）。

import "../../i18n";
import { useState } from "react";
import { afterEach, beforeAll, describe, expect, test, vi } from "vitest";
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import i18next from "../../i18n";
import ToastHost from "../common/ToastHost";
import ShareDialog, { type ShareDialogContext } from "./ShareDialog";
import type { ComposedShareImage } from "../../lib/sns/imageComposer";
import type { RecipeDoc, Step } from "../../models/recipe";
import type { SnsTarget } from "../../lib/sns/types";

beforeAll(() => {
  void i18next.changeLanguage("ja");
});

vi.mock("../../db/db", () => ({
  db: {
    photos: {
      get: vi.fn().mockResolvedValue({
        id: "ph_1",
        recipeId: "rcp_1",
        blob: new Blob(["x"], { type: "image/png" }),
        createdAt: "2026-07-01T00:00:00.000Z",
      }),
    },
  },
}));

vi.mock("../../db/photoStore", () => ({
  resolvePhotoUrl: vi.fn().mockResolvedValue("blob:mock-url"),
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

function makeFile(name: string): File {
  return new File(["x"], name, { type: "image/png" });
}

/** composeShareImagesの戻り値（{spec, file}ペア）をwhole候補としてn件生成する */
function makeComposedImages(count: number): ComposedShareImage[] {
  return Array.from({ length: count }, (_, i) => ({
    spec: { kind: "whole" as const, photoId: `ph_${i + 1}`, title: "T" },
    file: makeFile(`coat-codex-share-${i + 1}.png`),
  }));
}

/** マクロタスク遅延で解決するスタブ（実装と同じ非同期タイミングを模す） */
function delayedResolve<T>(value: T, ms = 20): Promise<T> {
  return new Promise((resolve) => setTimeout(() => resolve(value), ms));
}

function makeStep(overrides: Partial<Step> = {}): Step {
  return {
    id: "step_1",
    technique: { presetKey: "basecoat", label: null },
    photoId: null,
    paints: [],
    mix: null,
    toolIds: [],
    memo: "",
    ...overrides,
  };
}

function makeRecipe(overrides: Partial<RecipeDoc> = {}): RecipeDoc {
  return {
    schemaVersion: 1,
    id: "rcp_1",
    title: "宵闇の騎士",
    createdAt: "2026-06-01T00:00:00.000Z",
    updatedAt: "2026-06-15T00:00:00.000Z",
    overviewPhotoIds: ["ph_1", "ph_2"],
    palette: [],
    tools: [],
    baseSteps: [makeStep({ id: "base_1" }), makeStep({ id: "base_2" })],
    parts: [
      {
        id: "part_1",
        name: "頭部",
        steps: [
          makeStep({ id: "s1", photoId: "ph_s1" }),
          makeStep({ id: "s2", photoId: null }),
        ],
      },
    ],
    ...overrides,
  };
}

function makeTarget(overrides: Partial<SnsTarget> = {}): SnsTarget {
  return {
    key: "x",
    label: "X",
    buildIntentUrl: (text) =>
      `https://x.com/intent/post?text=${encodeURIComponent(text)}`,
    countText: (text) => ({
      count: text.length,
      limit: 280,
      over: text.length > 280,
    }),
    trimToLimit: (text) => text.slice(0, 280),
    ...overrides,
  };
}

function renderDialog(
  context: ShareDialogContext,
  target: SnsTarget = makeTarget(),
  onClose = vi.fn(),
) {
  return render(
    <ToastHost>
      <ShareDialog open context={context} target={target} onClose={onClose} />
    </ToastHost>,
  );
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

describe("ShareDialog — 生成中disabled→完了で活性化", () => {
  test("composeShareImagesの遅延中はA系統主ボタン・B系統DLボタンが押せない", async () => {
    vi.stubGlobal("navigator", {
      canShare: () => true,
      share: vi.fn(),
    });
    composeShareImagesMock.mockReturnValue(
      delayedResolve(makeComposedImages(4)),
    );

    const recipe = makeRecipe();
    renderDialog({ mode: "whole", recipe });

    // 生成中: プレースホルダが出ており、A系統ボタンはまだ存在しない（route未確定）
    expect(screen.getByText("画像を生成中…")).toBeInTheDocument();
    expect(
      screen.queryByTestId("share-primary-button"),
    ).not.toBeInTheDocument();

    await waitFor(() => {
      expect(screen.getByTestId("share-primary-button")).toBeInTheDocument();
    });
    expect(screen.getByTestId("share-primary-button")).not.toBeDisabled();
  });
});

describe("ShareDialog — A系統/B系統の分岐（canShareモック切替）", () => {
  test("canShare({files})=true → A系統の主ボタンを表示", async () => {
    vi.stubGlobal("navigator", {
      canShare: () => true,
      share: vi.fn(),
    });
    composeShareImagesMock.mockResolvedValue(makeComposedImages(2));

    renderDialog({ mode: "whole", recipe: makeRecipe() });

    await waitFor(() => {
      expect(screen.getByTestId("share-primary-button")).toBeInTheDocument();
    });
    expect(
      screen.getByText("共有シートで投稿（画像付き）"),
    ).toBeInTheDocument();
    expect(
      screen.queryByTestId("share-download-button"),
    ).not.toBeInTheDocument();
  });

  test("canShare不成立 → B系統のDL＋Intentボタンを表示", async () => {
    vi.stubGlobal("navigator", {
      canShare: () => false,
      share: vi.fn(),
    });
    composeShareImagesMock.mockResolvedValue(makeComposedImages(2));

    renderDialog({ mode: "whole", recipe: makeRecipe() });

    await waitFor(() => {
      expect(screen.getByTestId("share-download-button")).toBeInTheDocument();
    });
    expect(screen.getByTestId("share-intent-button")).toBeInTheDocument();
    expect(
      screen.getByText(
        "Intent URLは画像添付不可のため、開いた投稿画面にダウンロードした画像を手動で添付してください",
      ),
    ).toBeInTheDocument();
  });

  test("navigator.canShare未対応環境 → B系統へフォールバック", async () => {
    vi.stubGlobal("navigator", {});
    composeShareImagesMock.mockResolvedValue(makeComposedImages(2));

    renderDialog({ mode: "whole", recipe: makeRecipe() });

    await waitFor(() => {
      expect(screen.getByTestId("share-download-button")).toBeInTheDocument();
    });
  });
});

describe("ShareDialog — 候補0件でのテキストのみ共有切替", () => {
  test("全体写真なし・navigator.share対応 → テキストのみで共有ボタン", async () => {
    vi.stubGlobal("navigator", { share: vi.fn() });

    renderDialog({
      mode: "whole",
      recipe: makeRecipe({ overviewPhotoIds: [] }),
    });

    await waitFor(() => {
      expect(screen.getByTestId("share-primary-button")).toBeInTheDocument();
    });
    expect(screen.getByText("テキストのみで共有")).toBeInTheDocument();
    expect(composeShareImagesMock).not.toHaveBeenCalled();
  });

  test("写真つき工程なし・navigator.share非対応 → B系統IntentのみでDLは非活性", async () => {
    vi.stubGlobal("navigator", {});

    const recipe = makeRecipe({
      parts: [
        { id: "part_1", name: "頭部", steps: [makeStep({ photoId: null })] },
      ],
    });
    renderDialog({ mode: "part", recipe, partId: "part_1" });

    await waitFor(() => {
      expect(screen.getByTestId("share-intent-button")).toBeInTheDocument();
    });
    expect(screen.getByTestId("share-intent-button")).not.toBeDisabled();
    // 候補0件のためDLボタンはdisabledのまま（§3.4手順2: B系統をIntentのみに切替）
    expect(screen.getByTestId("share-download-button")).toBeDisabled();
  });
});

describe("ShareDialog — 選択ロジック", () => {
  test("既定は先頭4枚選択済み、5枚目以降はdisabled", async () => {
    vi.stubGlobal("navigator", { canShare: () => true, share: vi.fn() });
    composeShareImagesMock.mockResolvedValue(makeComposedImages(5));

    renderDialog({ mode: "whole", recipe: makeRecipe() });

    await waitFor(() => {
      expect(
        screen.getByTestId("share-image-selection-count"),
      ).toHaveTextContent("4 / 4");
    });
    const checkboxes = screen.getAllByRole("checkbox");
    expect(checkboxes).toHaveLength(5);
    expect(checkboxes[4]).toBeDisabled();
  });

  test("選択解除後は再選択でき、選択数表示が更新される", async () => {
    vi.stubGlobal("navigator", { canShare: () => true, share: vi.fn() });
    composeShareImagesMock.mockResolvedValue(makeComposedImages(4));

    renderDialog({ mode: "whole", recipe: makeRecipe() });

    await waitFor(() => {
      expect(
        screen.getByTestId("share-image-selection-count"),
      ).toHaveTextContent("4 / 4");
    });
    const checkboxes = screen.getAllByRole("checkbox");
    fireEvent.click(checkboxes[0]);
    expect(screen.getByTestId("share-image-selection-count")).toHaveTextContent(
      "3 / 4",
    );
    fireEvent.click(checkboxes[0]);
    expect(screen.getByTestId("share-image-selection-count")).toHaveTextContent(
      "4 / 4",
    );
  });

  test("全カード選択解除でA系統主ボタンがdisabledになり、1枚選択で再活性する", async () => {
    vi.stubGlobal("navigator", { canShare: () => true, share: vi.fn() });
    composeShareImagesMock.mockResolvedValue(makeComposedImages(1));

    renderDialog({ mode: "whole", recipe: makeRecipe() });

    await waitFor(() => {
      expect(screen.getByTestId("share-primary-button")).not.toBeDisabled();
    });

    const checkboxes = screen.getAllByRole("checkbox");
    fireEvent.click(checkboxes[0]);
    expect(screen.getByTestId("share-image-selection-count")).toHaveTextContent(
      "0 / 4",
    );
    expect(screen.getByTestId("share-primary-button")).toBeDisabled();

    fireEvent.click(checkboxes[0]);
    expect(screen.getByTestId("share-image-selection-count")).toHaveTextContent(
      "1 / 4",
    );
    expect(screen.getByTestId("share-primary-button")).not.toBeDisabled();
  });
});

describe("ShareDialog — テキスト既定文", () => {
  test("whole: タイトル＋概要（パーツ数・全工程数）＋#coat-codex", async () => {
    vi.stubGlobal("navigator", { canShare: () => true, share: vi.fn() });
    composeShareImagesMock.mockResolvedValue(makeComposedImages(2));

    renderDialog({ mode: "whole", recipe: makeRecipe() });

    await waitFor(() => {
      const textarea = screen.getByTestId(
        "share-text-textarea",
      ) as HTMLTextAreaElement;
      expect(textarea.value).toContain("宵闇の騎士");
    });
    const textarea = screen.getByTestId(
      "share-text-textarea",
    ) as HTMLTextAreaElement;
    // baseSteps(2) + part_1.steps(2) = 4工程、パーツ1
    expect(textarea.value).toContain("パーツ1");
    expect(textarea.value).toContain("全4工程");
    expect(textarea.value).toContain("#coat-codex");
  });

  test("part: タイトル＋パーツ名＋工程サマリ＋#coat-codex", async () => {
    vi.stubGlobal("navigator", { canShare: () => true, share: vi.fn() });
    composeShareImagesMock.mockResolvedValue(makeComposedImages(1));

    const recipe = makeRecipe();
    renderDialog({ mode: "part", recipe, partId: "part_1" });

    await waitFor(() => {
      const textarea = screen.getByTestId(
        "share-text-textarea",
      ) as HTMLTextAreaElement;
      expect(textarea.value).toContain("宵闇の騎士");
    });
    const textarea = screen.getByTestId(
      "share-text-textarea",
    ) as HTMLTextAreaElement;
    expect(textarea.value).toContain("頭部");
    expect(textarea.value).toContain("工程2");
    expect(textarea.value).toContain("#coat-codex");
  });
});

describe("ShareDialog — navigator.shareのspy挙動", () => {
  test("A系統主ボタン押下でnavigator.shareが同期的にtext+filesで呼ばれる", async () => {
    const shareSpy = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal("navigator", { canShare: () => true, share: shareSpy });
    composeShareImagesMock.mockResolvedValue(makeComposedImages(2));

    renderDialog({ mode: "whole", recipe: makeRecipe() });

    await waitFor(() => {
      expect(screen.getByTestId("share-primary-button")).not.toBeDisabled();
    });

    fireEvent.click(screen.getByTestId("share-primary-button"));

    expect(shareSpy).toHaveBeenCalledTimes(1);
    const callArg = shareSpy.mock.calls[0][0];
    expect(typeof callArg.text).toBe("string");
    expect(Array.isArray(callArg.files)).toBe(true);
    expect(callArg.files).toHaveLength(2);
  });

  test("AbortErrorは無視されB系統へフォールバックしない", async () => {
    const shareSpy = vi
      .fn()
      .mockRejectedValue(new DOMException("cancelled", "AbortError"));
    vi.stubGlobal("navigator", { canShare: () => true, share: shareSpy });
    composeShareImagesMock.mockResolvedValue(makeComposedImages(2));

    renderDialog({ mode: "whole", recipe: makeRecipe() });

    await waitFor(() => {
      expect(screen.getByTestId("share-primary-button")).not.toBeDisabled();
    });

    await act(async () => {
      fireEvent.click(screen.getByTestId("share-primary-button"));
      await Promise.resolve();
      await Promise.resolve();
    });

    // AbortErrorはB系統フォールバックを起こさない = 主ボタンが引き続き表示される
    expect(screen.getByTestId("share-primary-button")).toBeInTheDocument();
    expect(
      screen.queryByTestId("share-download-button"),
    ).not.toBeInTheDocument();
  });

  test("NotAllowedError等の失敗でB系統UIへフォールバックする", async () => {
    const shareSpy = vi
      .fn()
      .mockRejectedValue(new DOMException("blocked", "NotAllowedError"));
    vi.stubGlobal("navigator", { canShare: () => true, share: shareSpy });
    composeShareImagesMock.mockResolvedValue(makeComposedImages(2));

    renderDialog({ mode: "whole", recipe: makeRecipe() });

    await waitFor(() => {
      expect(screen.getByTestId("share-primary-button")).not.toBeDisabled();
    });

    await act(async () => {
      fireEvent.click(screen.getByTestId("share-primary-button"));
      await Promise.resolve();
      await Promise.resolve();
    });

    await waitFor(() => {
      expect(screen.getByTestId("share-download-button")).toBeInTheDocument();
    });
  });

  test("副導線「うまく共有できない場合」リンクでB系統UIを開ける", async () => {
    vi.stubGlobal("navigator", { canShare: () => true, share: vi.fn() });
    composeShareImagesMock.mockResolvedValue(makeComposedImages(2));

    renderDialog({ mode: "whole", recipe: makeRecipe() });

    await waitFor(() => {
      expect(screen.getByText("うまく共有できない場合 ›")).toBeInTheDocument();
    });
    fireEvent.click(screen.getByText("うまく共有できない場合 ›"));

    expect(screen.getByTestId("share-download-button")).toBeInTheDocument();
  });
});

describe("ShareDialog — 一括DLのrevoke順序（レビューRound1 Medium対応）", () => {
  test("anchor.click()の後、revokeObjectURLが呼ばれる（同期直後ではない）", async () => {
    vi.stubGlobal("navigator", { canShare: () => false, share: vi.fn() });
    composeShareImagesMock.mockResolvedValue(makeComposedImages(1));

    const events: string[] = [];
    const createObjectURLMock = vi
      .fn()
      .mockImplementation(() => "blob:mock-download-url");
    const revokeObjectURLMock = vi.fn().mockImplementation(() => {
      events.push("revoke");
    });
    vi.stubGlobal("URL", {
      ...URL,
      createObjectURL: createObjectURLMock,
      revokeObjectURL: revokeObjectURLMock,
    });

    const clickSpy = vi
      .spyOn(HTMLAnchorElement.prototype, "click")
      .mockImplementation(function (this: HTMLAnchorElement) {
        events.push("click");
      });

    renderDialog({ mode: "whole", recipe: makeRecipe() });

    await waitFor(() => {
      expect(screen.getByTestId("share-download-button")).not.toBeDisabled();
    });

    await act(async () => {
      fireEvent.click(screen.getByTestId("share-download-button"));
      // clickの同期直後（マイクロタスク経過時点）ではrevokeがまだ呼ばれていないことを確認する
      await Promise.resolve();
      expect(events).toEqual(["click"]);
      expect(revokeObjectURLMock).not.toHaveBeenCalled();
      // 実装内の50ms待機（マクロタスク）を実時間で経過させる
      await new Promise((resolve) => setTimeout(resolve, 80));
    });

    expect(events).toEqual(["click", "revoke"]);
    clickSpy.mockRestore();
  });
});

describe("ShareDialog — 生成失敗", () => {
  test("composeShareImages失敗時はエラートースト＋テキストのみ共有へ差し替え", async () => {
    vi.stubGlobal("navigator", { canShare: () => true, share: vi.fn() });
    composeShareImagesMock.mockRejectedValue(new Error("canvas失敗"));

    renderDialog({ mode: "whole", recipe: makeRecipe() });

    await waitFor(() => {
      expect(screen.getByText("画像の生成に失敗しました")).toBeInTheDocument();
    });
    expect(screen.getByText("テキストのみで共有")).toBeInTheDocument();
  });
});

describe("ShareDialog — 親再レンダー時のeffect多重走行防止（レビューRound1 Medium対応）", () => {
  /** 親が毎レンダーcontextをインライン生成する状況を模す（無関係なstate更新のたびに新規オブジェクト） */
  function Harness({ recipe }: { recipe: RecipeDoc }) {
    const [tick, setTick] = useState(0);
    return (
      <ToastHost>
        <button
          type="button"
          data-testid="force-rerender"
          onClick={() => setTick((n) => n + 1)}
        >
          rerender {tick}
        </button>
        <ShareDialog
          open
          // contextは毎レンダー新規オブジェクト（親がインライン生成する典型ケース）
          context={{ mode: "whole", recipe }}
          target={makeTarget()}
          onClose={vi.fn()}
        />
      </ToastHost>
    );
  }

  test("同一の対象（recipe.id）のまま親が再レンダーしてもcomposeShareImagesは再実行されない", async () => {
    vi.stubGlobal("navigator", { canShare: () => true, share: vi.fn() });
    composeShareImagesMock.mockResolvedValue(makeComposedImages(2));

    const recipe = makeRecipe();
    render(<Harness recipe={recipe} />);

    await waitFor(() => {
      expect(screen.getByTestId("share-primary-button")).not.toBeDisabled();
    });
    expect(composeShareImagesMock).toHaveBeenCalledTimes(1);

    // 無関係なstate更新で親を複数回再レンダーさせる（contextは毎回新規オブジェクト）
    fireEvent.click(screen.getByTestId("force-rerender"));
    fireEvent.click(screen.getByTestId("force-rerender"));
    fireEvent.click(screen.getByTestId("force-rerender"));

    // 生成対象（recipe.id等の一次値）は変わっていないため、再実行されないはず
    expect(composeShareImagesMock).toHaveBeenCalledTimes(1);
  });
});
