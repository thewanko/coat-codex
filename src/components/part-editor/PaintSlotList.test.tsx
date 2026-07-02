// components/part-editor/PaintSlotList.test.tsx — PaintSlotList/PaintSlotのテスト
// （技術計画v2.2 §4.2 T21）
//
// paintPresetsをvi.mockし、PaintPicker自体はスタブ（テストから直接onCommitを起動できる
// ボタン群）に差し替えて、addPaintSlot/removePaintSlot/commitPercentInputへの反映・
// 単色時%欄非表示・5件到達disabled+残数表示・colorId重複防止を検証する。

import "../../i18n";
import { beforeAll, describe, expect, test, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import i18next from "../../i18n";
import PaintSlotList from "./PaintSlotList";
import ToastHost from "../common/ToastHost";
import type { MixState } from "../../lib/mixRatio";
import type { PaletteColor } from "../../models/recipe";

beforeAll(() => {
  void i18next.changeLanguage("ja");
});

vi.mock("../../lib/paintPresets", () => ({
  loadBrandIndex: vi.fn().mockResolvedValue([]),
  searchColors: vi.fn().mockResolvedValue([]),
}));

vi.mock("../../db/photoStore", () => ({
  savePhoto: vi.fn(),
  resolvePhotoUrl: vi.fn().mockResolvedValue("blob:mock-url"),
}));

// PaintPickerはT19で別途テスト済みのため、ここではスタブに差し替えて
// PaintSlotList側のロジック（追加/削除/％反映/重複防止）にテストを集中させる。
vi.mock("../paint/PaintPicker", () => ({
  default: ({
    onCommit,
  }: {
    recipeId: string;
    value?: PaletteColor;
    onCommit: (color: PaletteColor) => void;
  }) => (
    <div>
      <button
        type="button"
        onClick={() =>
          onCommit({
            id: "col_red",
            source: "custom",
            brand: null,
            name: "Red",
            presetId: null,
            hex: "#AA0000",
            chipPhotoId: null,
          })
        }
      >
        pick-red
      </button>
      <button
        type="button"
        onClick={() =>
          onCommit({
            id: "col_blue",
            source: "custom",
            brand: null,
            name: "Blue",
            presetId: null,
            hex: "#0000AA",
            chipPhotoId: null,
          })
        }
      >
        pick-blue
      </button>
      <button
        type="button"
        onClick={() =>
          onCommit({
            // PaintPickerは選択のたびに新規idを発行する。ここでは既存palette色
            // （col_citadel_red／presetId citadel:mephiston-red）と同一presetIdだが
            // 新規発行idを持つcolor要素を模して再選択を再現する。
            id: `col_new_${crypto.randomUUID()}`,
            source: "preset",
            brand: "Citadel",
            name: "Mephiston Red",
            presetId: "citadel:mephiston-red",
            hex: "#960C0C",
            chipPhotoId: null,
          })
        }
      >
        pick-existing-preset
      </button>
    </div>
  ),
}));

function makeState(
  paints: { colorId: string }[],
  mix: number[] | null,
): MixState {
  return { paints, mix };
}

function renderList(
  state: MixState,
  palette: PaletteColor[] = [],
  onChange = vi.fn(),
  onAddColor = vi.fn(),
) {
  render(
    <ToastHost>
      <PaintSlotList
        state={state}
        palette={palette}
        recipeId="rcp_1"
        onChange={onChange}
        onAddColor={onAddColor}
      />
    </ToastHost>,
  );
  return { onChange, onAddColor };
}

describe("PaintSlotList — スロット追加/削除", () => {
  test("塗料を追加ボタン押下でaddPaintSlot相当の結果がonChangeへ渡る", () => {
    const { onChange } = renderList(makeState([], null));

    fireEvent.click(screen.getByText("＋塗料を追加"));

    expect(onChange).toHaveBeenCalledTimes(1);
    const next = onChange.mock.calls[0][0] as MixState;
    expect(next.paints).toHaveLength(1);
    expect(next.mix).toBeNull();
  });

  test("2件目追加でmix=[100, 0]相当になる（addPaintSlotの規則）", () => {
    const state = makeState([{ colorId: "col_a" }], null);
    const { onChange } = renderList(state);

    fireEvent.click(screen.getByText("＋塗料を追加"));

    const next = onChange.mock.calls[0][0] as MixState;
    expect(next.paints).toHaveLength(2);
    expect(next.mix).toEqual([100, 0]);
  });

  test("✕クリックでremovePaintSlot相当の結果がonChangeへ渡る", () => {
    const state = makeState(
      [{ colorId: "col_a" }, { colorId: "col_b" }],
      [60, 40],
    );
    const { onChange } = renderList(state);

    const removeButtons = screen.getAllByRole("button", { name: /削除/ });
    fireEvent.click(removeButtons[0]);

    const next = onChange.mock.calls[0][0] as MixState;
    expect(next.paints).toEqual([{ colorId: "col_b" }]);
    expect(next.mix).toBeNull();
  });
});

describe("PaintSlotList — %入力", () => {
  test("%入力欄の確定でcommitPercentInput相当の結果がonChangeへ渡る", () => {
    const state = makeState(
      [{ colorId: "col_a" }, { colorId: "col_b" }],
      [60, 40],
    );
    const { onChange } = renderList(state);

    const percentInputs = screen.getAllByRole("spinbutton");
    fireEvent.change(percentInputs[0], { target: { value: "70" } });
    fireEvent.blur(percentInputs[0]);

    expect(onChange).toHaveBeenCalledWith({
      paints: [{ colorId: "col_a" }, { colorId: "col_b" }],
      mix: [70, 40],
    });
  });

  test("単色（paints.length<=1）では%入力欄が描画されない", () => {
    const state = makeState([{ colorId: "col_a" }], null);
    renderList(state);

    expect(screen.queryByRole("spinbutton")).not.toBeInTheDocument();
  });

  test("塗料0件でも%入力欄は描画されない", () => {
    renderList(makeState([], null));
    expect(screen.queryByRole("spinbutton")).not.toBeInTheDocument();
  });
});

describe("PaintSlotList — 5件到達", () => {
  test("5件未満では追加ボタンが活性かつ残数が表示される", () => {
    const state = makeState(
      [{ colorId: "col_a" }, { colorId: "col_b" }, { colorId: "col_c" }],
      [40, 30, 30],
    );
    renderList(state);

    const addButton = screen.getByText("＋塗料を追加");
    expect(addButton).not.toBeDisabled();
    expect(screen.getByText("（あと2）")).toBeInTheDocument();
  });

  test("5件到達で追加ボタンがdisabledになり最大件数メッセージが表示される", () => {
    const state = makeState(
      [
        { colorId: "col_a" },
        { colorId: "col_b" },
        { colorId: "col_c" },
        { colorId: "col_d" },
        { colorId: "col_e" },
      ],
      [20, 20, 20, 20, 20],
    );
    renderList(state);

    const addButton = screen.getByText("＋塗料を追加");
    expect(addButton).toBeDisabled();
    expect(screen.getByText("最大5種まで")).toBeInTheDocument();
  });
});

describe("PaintSlotList — colorId重複防止", () => {
  test("他スロットで使用中の色を選択するとonChange/onAddColorが呼ばれずトースト警告が出る", () => {
    const state = makeState(
      [{ colorId: "col_red" }, { colorId: "col_pending_1" }],
      [50, 50],
    );
    const palette: PaletteColor[] = [
      {
        id: "col_red",
        source: "custom",
        brand: null,
        name: "Red",
        presetId: null,
        hex: "#AA0000",
        chipPhotoId: null,
      },
    ];
    const { onChange, onAddColor } = renderList(state, palette);

    const pickRedButtons = screen.getAllByText("pick-red");
    // 2番目のスロット（index=1）で既にスロット0が使用中の col_red を選択する
    fireEvent.click(pickRedButtons[1]);

    expect(onAddColor).not.toHaveBeenCalled();
    expect(onChange).not.toHaveBeenCalled();
    expect(screen.getByRole("status")).not.toBeEmptyDOMElement();
  });

  test("未使用の色を選択すると正常にonAddColor/onChangeが呼ばれる", () => {
    const state = makeState(
      [{ colorId: "col_red" }, { colorId: "col_pending_1" }],
      [50, 50],
    );
    const palette: PaletteColor[] = [
      {
        id: "col_red",
        source: "custom",
        brand: null,
        name: "Red",
        presetId: null,
        hex: "#AA0000",
        chipPhotoId: null,
      },
    ];
    const { onChange, onAddColor } = renderList(state, palette);

    const pickBlueButtons = screen.getAllByText("pick-blue");
    fireEvent.click(pickBlueButtons[1]);

    expect(onAddColor).toHaveBeenCalledWith(
      expect.objectContaining({ id: "col_blue" }),
    );
    const next = onChange.mock.calls[0][0] as MixState;
    expect(next.paints).toEqual([
      { colorId: "col_red" },
      { colorId: "col_blue" },
    ]);
  });
});

describe("PaintSlotList — 既存palette色の再利用", () => {
  test("同一presetIdを再選択してもpaletteは増えず（onAddColor不発）、既存idが反映される", () => {
    const state = makeState(
      [{ colorId: "col_pending_1" }, { colorId: "col_pending_2" }],
      [50, 50],
    );
    const palette: PaletteColor[] = [
      {
        id: "col_citadel_red",
        source: "preset",
        brand: "Citadel",
        name: "Mephiston Red",
        presetId: "citadel:mephiston-red",
        hex: "#960C0C",
        chipPhotoId: null,
      },
    ];
    const { onChange, onAddColor } = renderList(state, palette);

    const pickButtons = screen.getAllByText("pick-existing-preset");
    // index=0のスロットでは既存paletteのpresetIdと同一色を選択（他スロットでは未使用）
    fireEvent.click(pickButtons[0]);

    expect(onAddColor).not.toHaveBeenCalled();
    const next = onChange.mock.calls[0][0] as MixState;
    expect(next.paints[0]).toEqual({ colorId: "col_citadel_red" });
  });

  test("同一presetIdの既存色が別スロットで使用中なら重複ガード（toast）に掛かる", () => {
    const state = makeState(
      [{ colorId: "col_citadel_red" }, { colorId: "col_pending_2" }],
      [50, 50],
    );
    const palette: PaletteColor[] = [
      {
        id: "col_citadel_red",
        source: "preset",
        brand: "Citadel",
        name: "Mephiston Red",
        presetId: "citadel:mephiston-red",
        hex: "#960C0C",
        chipPhotoId: null,
      },
    ];
    const { onChange, onAddColor } = renderList(state, palette);

    const pickButtons = screen.getAllByText("pick-existing-preset");
    // index=1のスロットで、既にindex=0が使用中のcol_citadel_redと同一presetIdを選択する
    fireEvent.click(pickButtons[1]);

    expect(onAddColor).not.toHaveBeenCalled();
    expect(onChange).not.toHaveBeenCalled();
    expect(screen.getByRole("status")).not.toBeEmptyDOMElement();
  });
});
