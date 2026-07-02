// stores/useRecipeStore.test.ts — 編集中レシピストアのテスト（技術計画v2.2 §4.2 T16）
//
// db層（loadRecipe/saveRecipe）はvi.mockでスタブする（fake-indexeddb不要。ストア自体の
// debounce/title補完/pending strip/エラー通知ロジックのみを検証する）。

import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import type { RecipeDoc, Step } from "../models/recipe";

vi.mock("../db/recipeStore", () => ({
  loadRecipe: vi.fn(),
  saveRecipe: vi.fn(),
}));

import { loadRecipe, saveRecipe } from "../db/recipeStore";
import { useRecipeStore, __resetRecipeStoreForTest } from "./useRecipeStore";

function makeStep(overrides: Partial<Step> = {}): Step {
  return {
    id: "stp_1",
    technique: { presetKey: null, label: null },
    photoId: null,
    paints: [],
    mix: null,
    toolIds: [],
    memo: "",
    ...overrides,
  };
}

function makeDoc(overrides: Partial<RecipeDoc> = {}): RecipeDoc {
  return {
    schemaVersion: 1,
    id: "rcp_1",
    title: "テストレシピ",
    createdAt: "2026-07-01T00:00:00.000Z",
    updatedAt: "2026-07-01T00:00:00.000Z",
    overviewPhotoIds: [],
    palette: [],
    tools: [],
    baseSteps: [],
    parts: [],
    ...overrides,
  };
}

beforeEach(() => {
  vi.mocked(loadRecipe).mockReset();
  vi.mocked(saveRecipe).mockReset();
  vi.mocked(saveRecipe).mockImplementation((doc: RecipeDoc) =>
    Promise.resolve(doc),
  );
  __resetRecipeStoreForTest();
});

afterEach(() => {
  vi.useRealTimers();
  __resetRecipeStoreForTest();
});

describe("load", () => {
  test("loadRecipeの結果をstate.docへセットする", async () => {
    const doc = makeDoc();
    vi.mocked(loadRecipe).mockResolvedValue(doc);

    await useRecipeStore.getState().load("rcp_1");

    expect(useRecipeStore.getState().doc).toEqual(doc);
    expect(useRecipeStore.getState().isLoading).toBe(false);
    expect(useRecipeStore.getState().loadError).toBeNull();
  });

  test("loadRecipe失敗時はloadErrorへ格納しdocはnullのまま", async () => {
    const err = new Error("boom");
    vi.mocked(loadRecipe).mockRejectedValue(err);

    await useRecipeStore.getState().load("rcp_1");

    expect(useRecipeStore.getState().doc).toBeNull();
    expect(useRecipeStore.getState().loadError).toBe(err);
    expect(useRecipeStore.getState().isLoading).toBe(false);
  });
});

describe("autosave debounce", () => {
  test("500ms未満ではsaveRecipeが呼ばれない", async () => {
    vi.useFakeTimers();
    const doc = makeDoc();
    vi.mocked(loadRecipe).mockResolvedValue(doc);
    await useRecipeStore.getState().load("rcp_1");

    useRecipeStore.getState().updateRecipe((d) => ({ ...d, title: "更新後" }));

    await vi.advanceTimersByTimeAsync(499);
    expect(saveRecipe).not.toHaveBeenCalled();
  });

  test("500ms経過でsaveRecipeが1回呼ばれる", async () => {
    vi.useFakeTimers();
    const doc = makeDoc();
    vi.mocked(loadRecipe).mockResolvedValue(doc);
    await useRecipeStore.getState().load("rcp_1");

    useRecipeStore.getState().updateRecipe((d) => ({ ...d, title: "更新後" }));

    await vi.advanceTimersByTimeAsync(500);
    expect(saveRecipe).toHaveBeenCalledTimes(1);
    expect(vi.mocked(saveRecipe).mock.calls[0][0].title).toBe("更新後");
  });

  test("500ms以内の複数回更新は1回の書き込みに集約される", async () => {
    vi.useFakeTimers();
    const doc = makeDoc();
    vi.mocked(loadRecipe).mockResolvedValue(doc);
    await useRecipeStore.getState().load("rcp_1");

    useRecipeStore.getState().updateRecipe((d) => ({ ...d, title: "A" }));
    await vi.advanceTimersByTimeAsync(200);
    useRecipeStore.getState().updateRecipe((d) => ({ ...d, title: "B" }));
    await vi.advanceTimersByTimeAsync(200);
    useRecipeStore.getState().updateRecipe((d) => ({ ...d, title: "C" }));
    await vi.advanceTimersByTimeAsync(500);

    expect(saveRecipe).toHaveBeenCalledTimes(1);
    expect(vi.mocked(saveRecipe).mock.calls[0][0].title).toBe("C");
  });
});

describe("D-8: 書き込み直前のtitle既定名補完", () => {
  test("trim後空文字のtitleは保存文書のみ既定名へ補完され、stateのtitleは空のまま維持される", async () => {
    vi.useFakeTimers();
    const doc = makeDoc({ title: "元のタイトル" });
    vi.mocked(loadRecipe).mockResolvedValue(doc);
    await useRecipeStore.getState().load("rcp_1");

    useRecipeStore.getState().updateRecipe((d) => ({ ...d, title: "   " }));
    await vi.advanceTimersByTimeAsync(500);

    expect(saveRecipe).toHaveBeenCalledTimes(1);
    expect(vi.mocked(saveRecipe).mock.calls[0][0].title).toBe("無題のレシピ");
    expect(useRecipeStore.getState().doc?.title).toBe("   ");
  });

  test("非空titleはそのまま保存される", async () => {
    vi.useFakeTimers();
    const doc = makeDoc();
    vi.mocked(loadRecipe).mockResolvedValue(doc);
    await useRecipeStore.getState().load("rcp_1");

    useRecipeStore
      .getState()
      .updateRecipe((d) => ({ ...d, title: "空じゃない" }));
    await vi.advanceTimersByTimeAsync(500);

    expect(vi.mocked(saveRecipe).mock.calls[0][0].title).toBe("空じゃない");
  });
});

describe("M4必須事項①: pending塗料スロットのstrip", () => {
  test("baseStepsのpendingスロットは保存文書からstripされ、stateには残る", async () => {
    vi.useFakeTimers();
    const pendingStep = makeStep({
      id: "stp_base1",
      paints: [{ colorId: "col_pending_abc" }],
      mix: null,
    });
    const doc = makeDoc({ baseSteps: [pendingStep] });
    vi.mocked(loadRecipe).mockResolvedValue(doc);
    await useRecipeStore.getState().load("rcp_1");

    useRecipeStore
      .getState()
      .updateRecipe((d) => ({ ...d, memo: "" }) as RecipeDoc);
    await vi.advanceTimersByTimeAsync(500);

    const saved = vi.mocked(saveRecipe).mock.calls[0][0];
    expect(saved.baseSteps[0].paints).toEqual([]);
    expect(saved.baseSteps[0].mix).toBeNull();

    // stateはpendingを保持したまま
    expect(useRecipeStore.getState().doc?.baseSteps[0].paints).toEqual([
      { colorId: "col_pending_abc" },
    ]);
  });

  test("parts[].stepsのpendingスロットも保存文書からstripされる", async () => {
    vi.useFakeTimers();
    const pendingStep = makeStep({
      id: "stp_part1",
      paints: [{ colorId: "col_real1" }, { colorId: "col_pending_xyz" }],
      mix: [60, 40],
    });
    const doc = makeDoc({
      parts: [{ id: "part_1", name: "兜", steps: [pendingStep] }],
    });
    vi.mocked(loadRecipe).mockResolvedValue(doc);
    await useRecipeStore.getState().load("rcp_1");

    useRecipeStore.getState().updateRecipe((d) => ({ ...d }));
    await vi.advanceTimersByTimeAsync(500);

    const saved = vi.mocked(saveRecipe).mock.calls[0][0];
    expect(saved.parts[0].steps[0].paints).toEqual([{ colorId: "col_real1" }]);
    expect(saved.parts[0].steps[0].mix).toBeNull();

    expect(useRecipeStore.getState().doc?.parts[0].steps[0].paints).toEqual([
      { colorId: "col_real1" },
      { colorId: "col_pending_xyz" },
    ]);
  });

  test("pendingを含まないstepは保存文書でも同一参照が保たれる（不要なclone防止）", async () => {
    vi.useFakeTimers();
    const cleanStep = makeStep({ id: "stp_clean" });
    const doc = makeDoc({ baseSteps: [cleanStep] });
    vi.mocked(loadRecipe).mockResolvedValue(doc);
    await useRecipeStore.getState().load("rcp_1");

    useRecipeStore.getState().updateRecipe((d) => ({ ...d }));
    await vi.advanceTimersByTimeAsync(500);

    const saved = vi.mocked(saveRecipe).mock.calls[0][0];
    expect(saved.baseSteps[0]).toBe(cleanStep);
  });
});

describe("保存失敗経路", () => {
  test("saveRecipeがrejectするとonSaveErrorリスナーが発火し、stateのsaveErrorへ反映される", async () => {
    vi.useFakeTimers();
    const doc = makeDoc();
    vi.mocked(loadRecipe).mockResolvedValue(doc);
    await useRecipeStore.getState().load("rcp_1");

    const err = new Error("QuotaExceeded");
    vi.mocked(saveRecipe).mockRejectedValueOnce(err);

    const listener = vi.fn();
    const unsubscribe = useRecipeStore.getState().onSaveError(listener);

    useRecipeStore.getState().updateRecipe((d) => ({ ...d, title: "X" }));
    await vi.advanceTimersByTimeAsync(500);

    expect(listener).toHaveBeenCalledTimes(1);
    expect(listener).toHaveBeenCalledWith({ error: err, recipeId: "rcp_1" });
    expect(useRecipeStore.getState().saveError).toBe(err);

    unsubscribe();
  });

  test("unsubscribe後はリスナーが呼ばれない", async () => {
    vi.useFakeTimers();
    const doc = makeDoc();
    vi.mocked(loadRecipe).mockResolvedValue(doc);
    await useRecipeStore.getState().load("rcp_1");

    const err = new Error("boom");
    vi.mocked(saveRecipe).mockRejectedValueOnce(err);

    const listener = vi.fn();
    const unsubscribe = useRecipeStore.getState().onSaveError(listener);
    unsubscribe();

    useRecipeStore.getState().updateRecipe((d) => ({ ...d, title: "X" }));
    await vi.advanceTimersByTimeAsync(500);

    expect(listener).not.toHaveBeenCalled();
  });

  test("成功後は次回saveでsaveErrorがクリアされる", async () => {
    vi.useFakeTimers();
    const doc = makeDoc();
    vi.mocked(loadRecipe).mockResolvedValue(doc);
    await useRecipeStore.getState().load("rcp_1");

    vi.mocked(saveRecipe).mockRejectedValueOnce(new Error("first fail"));
    useRecipeStore.getState().updateRecipe((d) => ({ ...d, title: "X" }));
    await vi.advanceTimersByTimeAsync(500);
    expect(useRecipeStore.getState().saveError).not.toBeNull();

    useRecipeStore.getState().updateRecipe((d) => ({ ...d, title: "Y" }));
    await vi.advanceTimersByTimeAsync(500);
    expect(useRecipeStore.getState().saveError).toBeNull();
  });
});

describe("flushAutosave / unload", () => {
  test("flushAutosaveはpending中のタイマーを待たず即座に保存する", async () => {
    vi.useFakeTimers();
    const doc = makeDoc();
    vi.mocked(loadRecipe).mockResolvedValue(doc);
    await useRecipeStore.getState().load("rcp_1");

    useRecipeStore.getState().updateRecipe((d) => ({ ...d, title: "即時" }));
    await useRecipeStore.getState().flushAutosave();

    expect(saveRecipe).toHaveBeenCalledTimes(1);
    expect(vi.mocked(saveRecipe).mock.calls[0][0].title).toBe("即時");
  });

  test("unloadはpendingをflushしてからstateをリセットする", async () => {
    vi.useFakeTimers();
    const doc = makeDoc();
    vi.mocked(loadRecipe).mockResolvedValue(doc);
    await useRecipeStore.getState().load("rcp_1");

    useRecipeStore.getState().updateRecipe((d) => ({ ...d, title: "退出前" }));
    await useRecipeStore.getState().unload();

    expect(saveRecipe).toHaveBeenCalledTimes(1);
    expect(vi.mocked(saveRecipe).mock.calls[0][0].title).toBe("退出前");
    expect(useRecipeStore.getState().doc).toBeNull();
  });
});
