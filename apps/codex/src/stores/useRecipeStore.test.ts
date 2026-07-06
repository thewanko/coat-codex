// stores/useRecipeStore.test.ts — 編集中レシピストアのテスト（技術計画v2.3 §4.2 T16）
//
// db層（loadRecipe/saveRecipe/deletePhoto）はvi.mockでスタブする（fake-indexeddb不要。
// ストア自体のdebounce/title補完/pending strip/未使用palette色の自動GC/
// エラー通知ロジックのみを検証する）。

import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import type { PaletteColor, RecipeDoc, Step } from "@coat-codex/recipe-core";

vi.mock("../db/recipeStore", () => ({
  loadRecipe: vi.fn(),
  saveRecipe: vi.fn(),
}));

vi.mock("../db/photoStore", () => ({
  deletePhoto: vi.fn(),
}));

import { loadRecipe, saveRecipe } from "../db/recipeStore";
import { deletePhoto } from "../db/photoStore";
import { useRecipeStore, __resetRecipeStoreForTest } from "./useRecipeStore";

function makeColor(overrides: Partial<PaletteColor> = {}): PaletteColor {
  return {
    id: "col_a",
    source: "custom",
    brand: null,
    name: "朱金",
    presetId: null,
    hex: "#7A2E1F",
    chipPhotoId: null,
    ...overrides,
  };
}

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
    schemaVersion: 3,
    id: "rcp_1",
    title: "テストレシピ",
    createdAt: "2026-07-01T00:00:00.000Z",
    updatedAt: "2026-07-01T00:00:00.000Z",
    overviewPhotoIds: [],
    palette: [],
    tools: [],
    baseSteps: [],
    parts: [],
    photoCrops: {},
    source: null,
    ...overrides,
  };
}

beforeEach(() => {
  vi.mocked(loadRecipe).mockReset();
  vi.mocked(saveRecipe).mockReset();
  vi.mocked(saveRecipe).mockImplementation((doc: RecipeDoc) =>
    Promise.resolve(doc),
  );
  vi.mocked(deletePhoto).mockReset();
  vi.mocked(deletePhoto).mockResolvedValue(undefined);
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

describe("M4必須事項③: 未使用palette色の自動GC（v2.3）", () => {
  test("参照0のpalette色は保存文書から除去され、deletePhotoは呼ばれない（chipPhotoIdがnull）", async () => {
    vi.useFakeTimers();
    const unusedColor = makeColor({ id: "col_unused", chipPhotoId: null });
    const doc = makeDoc({ palette: [unusedColor] });
    vi.mocked(loadRecipe).mockResolvedValue(doc);
    await useRecipeStore.getState().load("rcp_1");

    useRecipeStore.getState().updateRecipe((d) => ({ ...d }));
    await vi.advanceTimersByTimeAsync(500);

    const saved = vi.mocked(saveRecipe).mock.calls[0][0];
    expect(saved.palette).toEqual([]);
    expect(deletePhoto).not.toHaveBeenCalled();
  });

  test("参照0のcustom色のchipPhotoIdはdeletePhotoで回収される", async () => {
    vi.useFakeTimers();
    const unusedColor = makeColor({ id: "col_unused", chipPhotoId: "ph_1" });
    const doc = makeDoc({ palette: [unusedColor] });
    vi.mocked(loadRecipe).mockResolvedValue(doc);
    await useRecipeStore.getState().load("rcp_1");

    useRecipeStore.getState().updateRecipe((d) => ({ ...d }));
    await vi.advanceTimersByTimeAsync(500);

    const saved = vi.mocked(saveRecipe).mock.calls[0][0];
    expect(saved.palette).toEqual([]);
    expect(deletePhoto).toHaveBeenCalledTimes(1);
    expect(deletePhoto).toHaveBeenCalledWith("ph_1");
  });

  test("工程から参照されているpalette色は保存文書に残る", async () => {
    vi.useFakeTimers();
    const usedColor = makeColor({ id: "col_used" });
    const usedStep = makeStep({
      id: "stp_used",
      paints: [{ colorId: "col_used" }],
      mix: null,
    });
    const doc = makeDoc({ palette: [usedColor], baseSteps: [usedStep] });
    vi.mocked(loadRecipe).mockResolvedValue(doc);
    await useRecipeStore.getState().load("rcp_1");

    useRecipeStore.getState().updateRecipe((d) => ({ ...d }));
    await vi.advanceTimersByTimeAsync(500);

    const saved = vi.mocked(saveRecipe).mock.calls[0][0];
    expect(saved.palette).toEqual([usedColor]);
    expect(deletePhoto).not.toHaveBeenCalled();
  });

  test("deletePhotoが失敗してもconsole.warnのみで保存自体は成功する", async () => {
    vi.useFakeTimers();
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    vi.mocked(deletePhoto).mockRejectedValueOnce(new Error("boom"));
    const unusedColor = makeColor({ id: "col_unused", chipPhotoId: "ph_1" });
    const doc = makeDoc({ palette: [unusedColor] });
    vi.mocked(loadRecipe).mockResolvedValue(doc);
    await useRecipeStore.getState().load("rcp_1");

    useRecipeStore.getState().updateRecipe((d) => ({ ...d }));
    await vi.advanceTimersByTimeAsync(500);
    // deletePhotoのrejectハンドラ（.catch）はマイクロタスクとして解決するため、
    // タイマー進行後にもう一段マイクロタスクをflushする。
    await Promise.resolve();
    await Promise.resolve();

    expect(useRecipeStore.getState().saveError).toBeNull();
    expect(warnSpy).toHaveBeenCalledTimes(1);

    warnSpy.mockRestore();
  });

  test("未使用色が無ければstateのpaletteはstate側で変化しない（stateは常にupdater結果のまま）", async () => {
    vi.useFakeTimers();
    const usedColor = makeColor({ id: "col_used" });
    const usedStep = makeStep({
      id: "stp_used",
      paints: [{ colorId: "col_used" }],
      mix: null,
    });
    const doc = makeDoc({ palette: [usedColor], baseSteps: [usedStep] });
    vi.mocked(loadRecipe).mockResolvedValue(doc);
    await useRecipeStore.getState().load("rcp_1");

    useRecipeStore.getState().updateRecipe((d) => ({ ...d }));
    await vi.advanceTimersByTimeAsync(500);

    // GCは保存文書にのみ適用され、stateのpalette要素の参照は変わらない
    expect(useRecipeStore.getState().doc?.palette[0]).toBe(usedColor);
  });
});

describe("保存時GC: dangling photoCropsの除去（B-1）", () => {
  test("overviewPhotoIds・baseSteps・partsのいずれからも参照されなくなったcropは保存文書から除去される", async () => {
    vi.useFakeTimers();
    const doc = makeDoc({
      overviewPhotoIds: [],
      baseSteps: [],
      parts: [],
      photoCrops: { ph_orphan: { x: 0.1, y: 0.1, w: 0.5, h: 0.5 } },
    });
    vi.mocked(loadRecipe).mockResolvedValue(doc);
    await useRecipeStore.getState().load("rcp_1");

    useRecipeStore.getState().updateRecipe((d) => ({ ...d }));
    await vi.advanceTimersByTimeAsync(500);

    const saved = vi.mocked(saveRecipe).mock.calls[0][0];
    expect(saved.photoCrops).toEqual({});
  });

  test("overviewPhotoIdsから参照されているcropは保持される", async () => {
    vi.useFakeTimers();
    const doc = makeDoc({
      overviewPhotoIds: ["ph_overview"],
      photoCrops: { ph_overview: { x: 0.1, y: 0.1, w: 0.5, h: 0.5 } },
    });
    vi.mocked(loadRecipe).mockResolvedValue(doc);
    await useRecipeStore.getState().load("rcp_1");

    useRecipeStore.getState().updateRecipe((d) => ({ ...d }));
    await vi.advanceTimersByTimeAsync(500);

    const saved = vi.mocked(saveRecipe).mock.calls[0][0];
    expect(saved.photoCrops).toEqual({
      ph_overview: { x: 0.1, y: 0.1, w: 0.5, h: 0.5 },
    });
  });

  test("baseStepsから参照されているcropは保持される", async () => {
    vi.useFakeTimers();
    const stepWithPhoto = makeStep({ id: "stp_base", photoId: "ph_base" });
    const doc = makeDoc({
      baseSteps: [stepWithPhoto],
      photoCrops: { ph_base: { x: 0.2, y: 0.2, w: 0.4, h: 0.4 } },
    });
    vi.mocked(loadRecipe).mockResolvedValue(doc);
    await useRecipeStore.getState().load("rcp_1");

    useRecipeStore.getState().updateRecipe((d) => ({ ...d }));
    await vi.advanceTimersByTimeAsync(500);

    const saved = vi.mocked(saveRecipe).mock.calls[0][0];
    expect(saved.photoCrops).toEqual({
      ph_base: { x: 0.2, y: 0.2, w: 0.4, h: 0.4 },
    });
  });

  test("parts[].stepsから参照されているcropは保持される", async () => {
    vi.useFakeTimers();
    const stepWithPhoto = makeStep({ id: "stp_part", photoId: "ph_part" });
    const doc = makeDoc({
      parts: [{ id: "part_1", name: "頭部", steps: [stepWithPhoto] }],
      photoCrops: { ph_part: { x: 0.3, y: 0.3, w: 0.2, h: 0.2 } },
    });
    vi.mocked(loadRecipe).mockResolvedValue(doc);
    await useRecipeStore.getState().load("rcp_1");

    useRecipeStore.getState().updateRecipe((d) => ({ ...d }));
    await vi.advanceTimersByTimeAsync(500);

    const saved = vi.mocked(saveRecipe).mock.calls[0][0];
    expect(saved.photoCrops).toEqual({
      ph_part: { x: 0.3, y: 0.3, w: 0.2, h: 0.2 },
    });
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
