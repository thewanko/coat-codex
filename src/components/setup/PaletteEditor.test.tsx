// components/setup/PaletteEditor.test.tsx — PaletteEditorのテスト（技術計画v2.2 §4.2 T23・D-7・§2.6）
//
// 使用数バッジ・使用中削除ガード（§2.6一次防衛線）・削除時の参照同一性維持
// （M4必須事項②: 変更のないpalette要素の参照は保つ）を検証する。
// PaintPicker経由の新規追加はloadBrandIndexをモックしてカスタムモードの入力フローで行う。

import "../../i18n";
import { beforeAll, describe, expect, test, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import i18next from "../../i18n";
import PaletteEditor from "./PaletteEditor";
import ToastHost from "../common/ToastHost";
import type { PaletteColor, RecipeDoc, Step } from "../../models/recipe";

beforeAll(() => {
  void i18next.changeLanguage("ja");
});

vi.mock("../../lib/paintPresets", () => ({
  loadBrandIndex: vi.fn().mockResolvedValue([]),
}));

vi.mock("../../db/photoStore", () => ({
  savePhoto: vi.fn(),
  resolvePhotoUrl: vi.fn().mockResolvedValue("blob:mock-url"),
}));

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
    schemaVersion: 1,
    id: "rcp_1",
    title: "テスト",
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

describe("PaletteEditor", () => {
  test("使用数0のエントリは「未使用」バッジ・削除ボタンが活性で、押すとonUpdateへ削除後のpaletteを渡す", () => {
    const colorA = makeColor({ id: "col_a", name: "朱金" });
    const doc = makeDoc({ palette: [colorA] });
    const onUpdate = vi.fn();

    render(
      <ToastHost>
        <PaletteEditor recipeId="rcp_1" doc={doc} onUpdate={onUpdate} />
      </ToastHost>,
    );

    expect(screen.getByText("未使用")).toBeInTheDocument();
    const deleteButton = screen.getByLabelText("削除 朱金");
    expect(deleteButton).not.toBeDisabled();

    fireEvent.click(deleteButton);

    expect(onUpdate).toHaveBeenCalledTimes(1);
    const updater = onUpdate.mock.calls[0][0] as (d: RecipeDoc) => RecipeDoc;
    const next = updater(doc);
    expect(next.palette).toEqual([]);
  });

  test("使用中（工程から参照）のエントリは削除ボタンが無効化され、注記が表示される", () => {
    const colorA = makeColor({ id: "col_a", name: "朱金" });
    const doc = makeDoc({
      palette: [colorA],
      baseSteps: [makeStep({ paints: [{ colorId: "col_a" }], mix: null })],
    });
    const onUpdate = vi.fn();

    render(
      <ToastHost>
        <PaletteEditor recipeId="rcp_1" doc={doc} onUpdate={onUpdate} />
      </ToastHost>,
    );

    expect(screen.getByText("1工程で使用中")).toBeInTheDocument();
    const deleteButton = screen.getByLabelText("削除 朱金");
    expect(deleteButton).toBeDisabled();
    expect(
      screen.getByText(
        "↳ 工程で使用中のため削除できません（工程側で外すと削除可）",
      ),
    ).toBeInTheDocument();

    fireEvent.click(deleteButton);
    expect(onUpdate).not.toHaveBeenCalled();
  });

  test("削除時、削除対象以外のpalette要素オブジェクトの参照は維持される（M4必須事項②）", () => {
    const colorA = makeColor({ id: "col_a", name: "A" });
    const colorB = makeColor({ id: "col_b", name: "B" });
    const doc = makeDoc({ palette: [colorA, colorB] });
    const onUpdate = vi.fn();

    render(
      <ToastHost>
        <PaletteEditor recipeId="rcp_1" doc={doc} onUpdate={onUpdate} />
      </ToastHost>,
    );

    fireEvent.click(screen.getByLabelText("削除 A"));

    const updater = onUpdate.mock.calls[0][0] as (d: RecipeDoc) => RecipeDoc;
    const next = updater(doc);
    expect(next.palette).toHaveLength(1);
    expect(next.palette[0]).toBe(colorB);
  });

  test("新規カラー追加（自由入力）でonUpdateへ既存要素の参照を保ったまま追加後のpaletteを渡す", () => {
    const colorA = makeColor({ id: "col_a", name: "A" });
    const doc = makeDoc({ palette: [colorA] });
    const onUpdate = vi.fn();

    render(
      <ToastHost>
        <PaletteEditor recipeId="rcp_1" doc={doc} onUpdate={onUpdate} />
      </ToastHost>,
    );

    const nameInput = screen.getByLabelText("カラー名");
    fireEvent.change(nameInput, { target: { value: "新色" } });
    fireEvent.blur(nameInput);

    expect(onUpdate).toHaveBeenCalledTimes(1);
    const updater = onUpdate.mock.calls[0][0] as (d: RecipeDoc) => RecipeDoc;
    const next = updater(doc);
    expect(next.palette).toHaveLength(2);
    expect(next.palette[0]).toBe(colorA);
    expect(next.palette[1].name).toBe("新色");
  });
});
