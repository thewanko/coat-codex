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

const loadBrandColorsMock = vi.fn();

vi.mock("../../lib/paintPresets", () => ({
  loadBrandColors: (...args: unknown[]) => loadBrandColorsMock(...args),
}));

function makeFile(name: string): File {
  return new File(["x"], name, { type: "image/png" });
}

/** composeShareImagesの戻り値（{spec, file}ペア）をwhole候補としてn件生成する */
function makeComposedImages(count: number): ComposedShareImage[] {
  return Array.from({ length: count }, (_, i) => ({
    spec: { kind: "whole" as const, photoId: `ph_${i + 1}`, title: "T" },
    file: makeFile(`T-sfx${i + 1}.png`),
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
    photoCrops: {},
    ...overrides,
  };
}

function renderDialog(context: ShareDialogContext, onClose = vi.fn()) {
  return render(
    <ToastHost>
      <ShareDialog open context={context} onClose={onClose} />
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
    // FB-A: 個別保存ボタンは選択チェックとは独立にA系統でも常時表示される
    expect(
      screen.getAllByTestId("share-image-download-button").length,
    ).toBeGreaterThan(0);
  });

  test("canShare不成立 → B系統の個別保存＋Intentボタンを表示", async () => {
    vi.stubGlobal("navigator", {
      canShare: () => false,
      share: vi.fn(),
    });
    composeShareImagesMock.mockResolvedValue(makeComposedImages(2));

    renderDialog({ mode: "whole", recipe: makeRecipe() });

    await waitFor(() => {
      expect(screen.getByTestId("share-intent-button")).toBeInTheDocument();
    });
    expect(
      screen.getAllByTestId("share-image-download-button").length,
    ).toBeGreaterThan(0);
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
      expect(screen.getByTestId("share-intent-button")).toBeInTheDocument();
    });
  });
});

describe("ShareDialog — 候補0件でのテキストのみ共有切替", () => {
  // まとめカード（kind: "summary"）が常に先頭に1枚生成されるため、写真ゼロのレシピでも
  // listShareCandidatesの結果は空配列にならない（imageComposer.ts実装済み挙動）。
  // 「候補0件」経路（generating段階でcomposeShareImages自体を呼ばずルート確定）が
  // 実際に発生するのは、partモードで対象partIdがrecipe.parts内に存在しない場合のみ。

  test("全体写真なし → summaryカードが生成されA系統（画像付き）で共有できる", async () => {
    vi.stubGlobal("navigator", { canShare: () => true, share: vi.fn() });
    composeShareImagesMock.mockResolvedValue(makeComposedImages(1));

    renderDialog({
      mode: "whole",
      recipe: makeRecipe({ overviewPhotoIds: [] }),
    });

    await waitFor(() => {
      expect(screen.getByTestId("share-primary-button")).toBeInTheDocument();
    });
    expect(
      screen.getByText("共有シートで投稿（画像付き）"),
    ).toBeInTheDocument();
    // 候補0件経路は通らない = 空配列判定でのcomposeShareImagesスキップは発生しない
    expect(composeShareImagesMock).toHaveBeenCalledTimes(1);
  });

  test("写真つき工程なし → summaryカードのみ生成されB系統で共有できる（DLも活性）", async () => {
    vi.stubGlobal("navigator", {});
    composeShareImagesMock.mockResolvedValue(makeComposedImages(1));

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
    // summaryカード1枚は生成される（写真つき工程がなくても候補は空にならない）ため
    // 個別保存ボタンが表示される（選択チェックとは独立に常時表示・disabledを持たない）
    expect(
      screen.getByTestId("share-image-download-button"),
    ).toBeInTheDocument();
  });

  test("partモードで対象partIdが存在しない → 候補0件経路（generation skip）でテキストのみ共有", async () => {
    vi.stubGlobal("navigator", { share: vi.fn() });

    const recipe = makeRecipe({
      parts: [{ id: "part_1", name: "頭部", steps: [] }],
    });
    renderDialog({ mode: "part", recipe, partId: "part_missing" });

    await waitFor(() => {
      expect(screen.getByTestId("share-primary-button")).toBeInTheDocument();
    });
    expect(screen.getByText("テキストのみで共有")).toBeInTheDocument();
    // listShareCandidatesが空配列を返す（存在しないpartId）ため生成自体が呼ばれない
    expect(composeShareImagesMock).not.toHaveBeenCalled();
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
  test("whole: タイトル＋概要（パーツ数・全工程数）＋#coatcodex", async () => {
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
    expect(textarea.value).toContain("#coatcodex");
  });

  test("part: タイトル＋パーツ名＋技法の流れ（3件以下は全列挙）＋全工程数＋#coatcodex", async () => {
    vi.stubGlobal("navigator", { canShare: () => true, share: vi.fn() });
    composeShareImagesMock.mockResolvedValue(makeComposedImages(1));

    // part_1.steps はデフォルトで2工程とも technique.presetKey: "basecoat"
    // （ラベル「ベースコート」）のため、技法の流れは「ベースコート→ベースコート」（2件、全列挙）
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
    expect(textarea.value).toBe(
      "宵闇の騎士 - 頭部の塗装レシピ。ベースコート→ベースコート、全2工程。#coatcodex",
    );
  });

  test("part: 工程が4以上のとき技法の流れは「最初→…→最後」に短縮される", async () => {
    vi.stubGlobal("navigator", { canShare: () => true, share: vi.fn() });
    composeShareImagesMock.mockResolvedValue(makeComposedImages(1));

    const recipe = makeRecipe({
      parts: [
        {
          id: "part_1",
          name: "頭部",
          steps: [
            makeStep({
              id: "s1",
              technique: { presetKey: "prime", label: null },
            }),
            makeStep({
              id: "s2",
              technique: { presetKey: "basecoat", label: null },
            }),
            makeStep({
              id: "s3",
              technique: { presetKey: "wash", label: null },
            }),
            makeStep({
              id: "s4",
              technique: { presetKey: "edge-highlight", label: null },
            }),
          ],
        },
      ],
    });
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
    expect(textarea.value).toBe(
      "宵闇の騎士 - 頭部の塗装レシピ。プライマー→…→エッジハイライト、全4工程。#coatcodex",
    );
  });

  test("part: 全工程の技法ラベルが空のとき、流れ部分を省略して全工程数のみ表示する", async () => {
    vi.stubGlobal("navigator", { canShare: () => true, share: vi.fn() });
    composeShareImagesMock.mockResolvedValue(makeComposedImages(1));

    const recipe = makeRecipe({
      parts: [
        {
          id: "part_1",
          name: "頭部",
          steps: [
            makeStep({
              id: "s1",
              technique: { presetKey: null, label: null },
            }),
          ],
        },
      ],
    });
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
    expect(textarea.value).toBe(
      "宵闇の騎士 - 頭部の塗装レシピ。全1工程。#coatcodex",
    );
  });

  test("part: 空白のみの技法ラベルは流れから除外される（レビューRound1 Low対応: 「→   →」防止）", async () => {
    vi.stubGlobal("navigator", { canShare: () => true, share: vi.fn() });
    composeShareImagesMock.mockResolvedValue(makeComposedImages(1));

    const recipe = makeRecipe({
      parts: [
        {
          id: "part_1",
          name: "頭部",
          steps: [
            makeStep({
              id: "s1",
              technique: { presetKey: "prime", label: null },
            }),
            makeStep({
              // presetKeyがnull・labelが空白のみ → resolveTechniqueLabelはlabelをそのまま
              // 返すため、trimしなければ「プライマー→   →ウォッシュ」のように空白ラベルが
              // 流れに混入してしまう
              id: "s2",
              technique: { presetKey: null, label: "   " },
            }),
            makeStep({
              id: "s3",
              technique: { presetKey: "wash", label: null },
            }),
          ],
        },
      ],
    });
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
    // 空白のみラベルの工程は除外され、有効な2件（プライマー・ウォッシュ）のみが「→」で連結される
    expect(textarea.value).toBe(
      "宵闇の騎士 - 頭部の塗装レシピ。プライマー→ウォッシュ、全3工程。#coatcodex",
    );
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
    expect(screen.queryByTestId("share-intent-button")).not.toBeInTheDocument();
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
      expect(
        screen.getAllByTestId("share-image-download-button").length,
      ).toBeGreaterThan(0);
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

    expect(screen.getByTestId("share-intent-button")).toBeInTheDocument();
  });
});

describe("ShareDialog — 個別DLのrevoke順序（FB-A: 旧一括DLから個別保存ボタンへ移行）", () => {
  test("保存ボタン押下後、anchor.click()の後にrevokeObjectURLが呼ばれる（同期直後ではない）", async () => {
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
      expect(
        screen.getByTestId("share-image-download-button"),
      ).toBeInTheDocument();
    });

    await act(async () => {
      fireEvent.click(screen.getByTestId("share-image-download-button"));
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

  test("保存ボタン押下は選択チェックボックスをトグルしない（親labelへのクリックバブル防止）", async () => {
    vi.stubGlobal("navigator", { canShare: () => true, share: vi.fn() });
    composeShareImagesMock.mockResolvedValue(makeComposedImages(1));

    renderDialog({ mode: "whole", recipe: makeRecipe() });

    await waitFor(() => {
      expect(
        screen.getByTestId("share-image-download-button"),
      ).toBeInTheDocument();
    });

    const checkbox = screen.getByRole("checkbox") as HTMLInputElement;
    expect(checkbox.checked).toBe(true);

    fireEvent.click(screen.getByTestId("share-image-download-button"));

    expect(checkbox.checked).toBe(true);
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

describe("ShareDialog — ブランド・レンジ併記のresolver結線（§3.4 SNSカード塗料表示 要件4）", () => {
  /** RecipeDoc.palette[]要素のfixture（paletteColorSchema準拠） */
  function makePaletteColor(
    overrides: Partial<RecipeDoc["palette"][number]> = {},
  ): RecipeDoc["palette"][number] {
    return {
      id: "col_1",
      source: "preset",
      brand: "Citadel",
      name: "Eshin Grey",
      presetId: "citadel:eshin-grey",
      hex: "#3C3C3C",
      chipPhotoId: null,
      ...overrides,
    };
  }

  test("recipe.paletteのpresetIdが属するブランドのマスタをロードし、候補生成specにrangeLabelが反映される", async () => {
    vi.stubGlobal("navigator", { canShare: () => true, share: vi.fn() });
    composeShareImagesMock.mockResolvedValue(makeComposedImages(1));
    loadBrandColorsMock.mockResolvedValue([
      {
        id: "citadel:eshin-grey",
        name: "Eshin Grey",
        range: "Layer",
        hex: "#3C3C3C",
      },
    ]);

    const recipe = makeRecipe({
      palette: [makePaletteColor()],
      parts: [
        {
          id: "part_1",
          name: "頭部",
          steps: [
            makeStep({
              id: "s1",
              photoId: "ph_s1",
              paints: [{ colorId: "col_1" }],
            }),
          ],
        },
      ],
    });
    renderDialog({ mode: "part", recipe, partId: "part_1" });

    await waitFor(() => {
      expect(composeShareImagesMock).toHaveBeenCalledTimes(1);
    });
    // ブランドのマスタが正しいbrandIdでロードされている（presetId "citadel:eshin-grey" → "citadel"）
    expect(loadBrandColorsMock).toHaveBeenCalledWith("citadel");

    // composeShareImagesへ渡されたspecsのsummary(part)候補内でrangeLabelが解決されている
    const specsArg = composeShareImagesMock.mock.calls[0][0] as Array<{
      kind: string;
      variant?: string;
      steps?: Array<{
        swatches: { rangeLabel: string | null; brand: string | null }[];
      }>;
    }>;
    const summarySpec = specsArg.find(
      (s) => s.kind === "summary" && s.variant === "part",
    );
    expect(summarySpec?.steps?.[0]?.swatches[0]).toMatchObject({
      brand: "Citadel",
      rangeLabel: "Layer",
    });
  });

  test("プリセットマスタfetch失敗時はレンジなし（brandのみ）で共有機能自体は継続する", async () => {
    vi.stubGlobal("navigator", { canShare: () => true, share: vi.fn() });
    composeShareImagesMock.mockResolvedValue(makeComposedImages(1));
    // loadBrandColorsは実装上fetch失敗時に空配列へ丸めるため、そのフォールバック挙動をスタブする
    loadBrandColorsMock.mockResolvedValue([]);

    const recipe = makeRecipe({
      palette: [makePaletteColor()],
      parts: [
        {
          id: "part_1",
          name: "頭部",
          steps: [
            makeStep({
              id: "s1",
              photoId: "ph_s1",
              paints: [{ colorId: "col_1" }],
            }),
          ],
        },
      ],
    });
    renderDialog({ mode: "part", recipe, partId: "part_1" });

    // マスタfetch失敗（空配列）でも生成・共有導線は止まらない
    await waitFor(() => {
      expect(screen.getByTestId("share-primary-button")).not.toBeDisabled();
    });
    expect(composeShareImagesMock).toHaveBeenCalledTimes(1);

    const specsArg = composeShareImagesMock.mock.calls[0][0] as Array<{
      kind: string;
      variant?: string;
      steps?: Array<{
        swatches: { rangeLabel: string | null; brand: string | null }[];
      }>;
    }>;
    const summarySpec = specsArg.find(
      (s) => s.kind === "summary" && s.variant === "part",
    );
    // brandは同期解決可能なため残るが、rangeLabelはマスタ未解決のためnull
    expect(summarySpec?.steps?.[0]?.swatches[0]).toMatchObject({
      brand: "Citadel",
      rangeLabel: null,
    });
  });

  test("custom色（presetId=null）はマスタロード対象外で、brand・rangeLabelともにnullのまま", async () => {
    vi.stubGlobal("navigator", { canShare: () => true, share: vi.fn() });
    composeShareImagesMock.mockResolvedValue(makeComposedImages(1));

    const recipe = makeRecipe({
      palette: [
        makePaletteColor({
          id: "col_custom",
          source: "custom",
          brand: null,
          name: "Water",
          presetId: null,
          hex: null,
        }),
      ],
      parts: [
        {
          id: "part_1",
          name: "頭部",
          steps: [
            makeStep({
              id: "s1",
              photoId: "ph_s1",
              paints: [{ colorId: "col_custom" }],
            }),
          ],
        },
      ],
    });
    renderDialog({ mode: "part", recipe, partId: "part_1" });

    await waitFor(() => {
      expect(composeShareImagesMock).toHaveBeenCalledTimes(1);
    });
    // custom色はpresetIdを持たないためloadBrandColorsは呼ばれない（無駄なfetch回避）
    expect(loadBrandColorsMock).not.toHaveBeenCalled();
  });
});

describe("ShareDialog — SNS切替タブ（FB-A: target propの内部state化）", () => {
  test("既定はXタブが選択され、カウンタ上限280・Intent URLがx.com系", async () => {
    const openSpy = vi.spyOn(window, "open").mockReturnValue(null);
    vi.stubGlobal("navigator", { canShare: () => false, share: vi.fn() });
    composeShareImagesMock.mockResolvedValue(makeComposedImages(1));

    renderDialog({ mode: "whole", recipe: makeRecipe() });

    await waitFor(() => {
      expect(screen.getByRole("tab", { name: "X" })).toHaveAttribute(
        "aria-selected",
        "true",
      );
    });
    expect(screen.getByRole("tab", { name: "Bluesky" })).toHaveAttribute(
      "aria-selected",
      "false",
    );
    expect(screen.getByTestId("share-text-counter")).toHaveTextContent("/ 280");

    fireEvent.click(screen.getByTestId("share-intent-button"));
    expect(openSpy).toHaveBeenCalledWith(
      expect.stringContaining("https://x.com/intent/post"),
      "_blank",
      "noopener,noreferrer",
    );
  });

  test("Blueskyタブへ切替でカウンタ上限が300になり、Intent URLがbsky.app系に変わる", async () => {
    const openSpy = vi.spyOn(window, "open").mockReturnValue(null);
    vi.stubGlobal("navigator", { canShare: () => false, share: vi.fn() });
    composeShareImagesMock.mockResolvedValue(makeComposedImages(1));

    renderDialog({ mode: "whole", recipe: makeRecipe() });

    await waitFor(() => {
      expect(screen.getByRole("tab", { name: "Bluesky" })).toBeInTheDocument();
    });
    fireEvent.click(screen.getByRole("tab", { name: "Bluesky" }));

    expect(screen.getByRole("tab", { name: "Bluesky" })).toHaveAttribute(
      "aria-selected",
      "true",
    );
    expect(screen.getByTestId("share-text-counter")).toHaveTextContent("/ 300");

    fireEvent.click(screen.getByTestId("share-intent-button"));
    expect(openSpy).toHaveBeenCalledWith(
      expect.stringContaining("https://bsky.app/intent/compose"),
      "_blank",
      "noopener,noreferrer",
    );
  });

  test("ArrowRightキーでXタブからBlueskyタブへ切替・focusも移動する（矢印キーナビゲーション）", async () => {
    vi.stubGlobal("navigator", { canShare: () => false, share: vi.fn() });
    composeShareImagesMock.mockResolvedValue(makeComposedImages(1));

    renderDialog({ mode: "whole", recipe: makeRecipe() });

    await waitFor(() => {
      expect(screen.getByRole("tab", { name: "X" })).toHaveAttribute(
        "aria-selected",
        "true",
      );
    });

    const tablist = screen.getByRole("tablist");
    fireEvent.keyDown(tablist, { key: "ArrowRight" });

    const blueskyTab = screen.getByRole("tab", { name: "Bluesky" });
    expect(blueskyTab).toHaveAttribute("aria-selected", "true");
    expect(blueskyTab).toHaveFocus();
    expect(screen.getByTestId("share-text-counter")).toHaveTextContent("/ 300");
  });

  test("タブ切替後もテキスト編集内容・画像選択は保持され、候補は再生成されない", async () => {
    vi.stubGlobal("navigator", { canShare: () => true, share: vi.fn() });
    composeShareImagesMock.mockResolvedValue(makeComposedImages(2));

    renderDialog({ mode: "whole", recipe: makeRecipe() });

    await waitFor(() => {
      expect(screen.getByTestId("share-primary-button")).not.toBeDisabled();
    });
    expect(composeShareImagesMock).toHaveBeenCalledTimes(1);

    const textarea = screen.getByTestId(
      "share-text-textarea",
    ) as HTMLTextAreaElement;
    fireEvent.change(textarea, { target: { value: "編集済みテキスト" } });

    const checkboxes = screen.getAllByRole("checkbox");
    fireEvent.click(checkboxes[0]);
    expect(screen.getByTestId("share-image-selection-count")).toHaveTextContent(
      "1 / 4",
    );

    fireEvent.click(screen.getByRole("tab", { name: "Bluesky" }));

    expect(textarea.value).toBe("編集済みテキスト");
    expect(screen.getByTestId("share-image-selection-count")).toHaveTextContent(
      "1 / 4",
    );
    // 候補生成（composeShareImages）はタブ切替では再実行されない
    expect(composeShareImagesMock).toHaveBeenCalledTimes(1);
  });
});
