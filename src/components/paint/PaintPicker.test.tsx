// components/paint/PaintPicker.test.tsx — PaintPickerのテスト（技術計画v2.2 §4.2 T19）
//
// paintPresetsをvi.mockし、ブランド選択→候補絞り込み→選択でonCommitのpalette要素形状
// （preset）／自由入力でonCommit形状（custom・presetId null）／hex正規表現不一致の
// 手入力は確定不可、を検証する。

import "../../i18n";
import { beforeAll, describe, expect, test, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import i18next from "../../i18n";
import PaintPicker from "./PaintPicker";
import ToastHost from "../common/ToastHost";
import { savePhoto } from "../../db/photoStore";
import type { PaletteColor } from "../../models/recipe";

beforeAll(() => {
  void i18next.changeLanguage("ja");
});

const CITADEL_COLORS = [
  {
    id: "citadel:mephiston-red",
    name: "Mephiston Red",
    nameJa: "メフィストンレッド",
    hex: "#960C0C",
  },
  {
    id: "citadel:abaddon-black",
    name: "Abaddon Black",
    nameJa: "アバドンブラック",
    hex: "#141414",
  },
];

// vallejoはrange（fantasy/military）を持つブランドとしてレンジフィルタのテストに使う
const VALLEJO_COLORS = [
  {
    id: "vallejo:elf-skintone",
    name: "Elf Skintone",
    range: "fantasy",
    hex: "#E8B48A",
  },
  {
    id: "vallejo:orc-skin",
    name: "Orc Skin",
    range: "fantasy",
    hex: "#6B8C4A",
  },
  {
    id: "vallejo:german-grey",
    name: "German Grey",
    range: "military",
    hex: "#5A5F5E",
  },
];

vi.mock("../../lib/paintPresets", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("../../lib/paintPresets")>();
  return {
    ...actual,
    loadBrandIndex: vi.fn().mockResolvedValue([
      { id: "citadel", label: "Citadel", file: "citadel.json", count: 2 },
      { id: "vallejo", label: "Vallejo", file: "vallejo.json", count: 3 },
    ]),
    loadBrandColors: vi.fn(async (brandId: string) => {
      if (brandId === "citadel") return CITADEL_COLORS;
      if (brandId === "vallejo") return VALLEJO_COLORS;
      return [];
    }),
    searchColors: vi.fn(
      async (brandId: string, query: string, range?: string) => {
        const all =
          brandId === "citadel"
            ? CITADEL_COLORS
            : brandId === "vallejo"
              ? VALLEJO_COLORS
              : [];
        const q = query.trim().toLowerCase();
        const byQuery =
          q === ""
            ? all
            : all.filter(
                (c) =>
                  c.name.toLowerCase().includes(q) ||
                  ("nameJa" in c && c.nameJa.toLowerCase().includes(q)),
              );
        if (!range) return byQuery;
        return byQuery.filter((c) => "range" in c && c.range === range);
      },
    ),
  };
});

vi.mock("../../db/photoStore", () => ({
  savePhoto: vi.fn(),
  resolvePhotoUrl: vi.fn().mockResolvedValue("blob:mock-url"),
}));

function renderPicker(onCommit = vi.fn()) {
  render(
    <ToastHost>
      <PaintPicker recipeId="rcp_1" onCommit={onCommit} />
    </ToastHost>,
  );
  return { onCommit };
}

describe("PaintPicker — preset flow", () => {
  test("ブランド選択→候補絞り込み→選択でonCommitがpreset形状のpalette要素を受け取る", async () => {
    const { onCommit } = renderPicker();

    const brandSelect = await screen.findByRole("combobox", {
      name: "メーカー",
    });
    fireEvent.change(brandSelect, { target: { value: "citadel" } });

    const colorInput = await screen.findByLabelText("カラー");
    fireEvent.focus(colorInput);
    fireEvent.change(colorInput, { target: { value: "mephiston" } });

    const option = await screen.findByRole("option", {
      name: /Mephiston Red/,
    });
    fireEvent.click(option);

    await waitFor(() => {
      expect(onCommit).toHaveBeenCalledWith(
        expect.objectContaining({
          source: "preset",
          brand: "Citadel",
          name: "Mephiston Red",
          presetId: "citadel:mephiston-red",
          hex: "#960C0C",
          chipPhotoId: null,
        }),
      );
    });
    const committed = onCommit.mock.calls[0][0];
    expect(committed.id).toMatch(/^col_/);
  });

  test("候補は部分一致で絞り込まれ、一致しない候補は表示されない", async () => {
    renderPicker();

    const brandSelect = await screen.findByRole("combobox", {
      name: "メーカー",
    });
    fireEvent.change(brandSelect, { target: { value: "citadel" } });

    const colorInput = await screen.findByLabelText("カラー");
    fireEvent.focus(colorInput);
    fireEvent.change(colorInput, { target: { value: "アバドン" } });

    await screen.findByRole("option", { name: /Abaddon Black/ });
    expect(
      screen.queryByRole("option", { name: /Mephiston Red/ }),
    ).not.toBeInTheDocument();
  });
});

describe("PaintPicker — レンジフィルタ", () => {
  test("rangeを持たないブランド（Citadel）ではレンジフィルタが表示されない", async () => {
    renderPicker();

    const brandSelect = await screen.findByRole("combobox", {
      name: "メーカー",
    });
    fireEvent.change(brandSelect, { target: { value: "citadel" } });

    await screen.findByLabelText("カラー");
    // レンジフィルタは「すべて」チップの存在で判定する
    await waitFor(() => {
      expect(screen.queryByRole("button", { name: "すべて" })).toBeNull();
    });
  });

  test("rangeを持つブランド（Vallejo）を選ぶとレンジフィルタが表示され、レンジ選択で候補が絞られる", async () => {
    renderPicker();

    const brandSelect = await screen.findByRole("combobox", {
      name: "メーカー",
    });
    fireEvent.change(brandSelect, { target: { value: "vallejo" } });

    const allChip = await screen.findByRole("button", { name: "すべて" });
    const militaryChip = await screen.findByRole("button", {
      name: "military",
    });

    fireEvent.click(militaryChip);

    const colorInput = await screen.findByLabelText("カラー");
    fireEvent.focus(colorInput);

    await screen.findByRole("option", { name: /German Grey/ });
    expect(
      screen.queryByRole("option", { name: /Elf Skintone/ }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("option", { name: /Orc Skin/ }),
    ).not.toBeInTheDocument();

    // activeなチップはaria-pressed=trueで判定できる
    expect(militaryChip.getAttribute("aria-pressed")).toBe("true");
    expect(allChip.getAttribute("aria-pressed")).toBe("false");
  });

  test("「すべて」を選ぶと全レンジの候補が表示される", async () => {
    renderPicker();

    const brandSelect = await screen.findByRole("combobox", {
      name: "メーカー",
    });
    fireEvent.change(brandSelect, { target: { value: "vallejo" } });

    const militaryChip = await screen.findByRole("button", {
      name: "military",
    });
    fireEvent.click(militaryChip);

    const colorInput = await screen.findByLabelText("カラー");
    fireEvent.focus(colorInput);
    await screen.findByRole("option", { name: /German Grey/ });

    const allChip = await screen.findByRole("button", { name: "すべて" });
    fireEvent.click(allChip);

    await screen.findByRole("option", { name: /Elf Skintone/ });
    await screen.findByRole("option", { name: /Orc Skin/ });
    await screen.findByRole("option", { name: /German Grey/ });
  });

  test("ブランドを切り替えるとレンジフィルタは「すべて」にリセットされる", async () => {
    renderPicker();

    const brandSelect = await screen.findByRole("combobox", {
      name: "メーカー",
    });
    fireEvent.change(brandSelect, { target: { value: "vallejo" } });

    const militaryChip = await screen.findByRole("button", {
      name: "military",
    });
    fireEvent.click(militaryChip);
    expect(militaryChip.getAttribute("aria-pressed")).toBe("true");

    // 別ブランド（citadel、rangeなし）へ切替 → フィルタ自体が消える
    fireEvent.change(brandSelect, { target: { value: "citadel" } });
    await screen.findByLabelText("カラー");
    await waitFor(() => {
      expect(screen.queryByRole("button", { name: "すべて" })).toBeNull();
    });

    // vallejoへ戻すと「すべて」がactiveな状態（リセット済み）で再表示される
    fireEvent.change(brandSelect, { target: { value: "vallejo" } });
    const allChipAgain = await screen.findByRole("button", { name: "すべて" });
    await waitFor(() => {
      expect(allChipAgain.getAttribute("aria-pressed")).toBe("true");
    });
  });
});

describe("PaintPicker — custom flow", () => {
  test("自由入力（その他）選択でカラー名＋hex入力からonCommitがcustom形状（presetId null）を受け取る", async () => {
    const { onCommit } = renderPicker();

    const brandSelect = await screen.findByRole("combobox", {
      name: "メーカー",
    });
    fireEvent.change(brandSelect, { target: { value: "__custom__" } });

    const colorNameInput = await screen.findByLabelText("カラー名");
    fireEvent.change(colorNameInput, { target: { value: "自作レッド" } });
    fireEvent.blur(colorNameInput);

    const hexInput = screen.getByPlaceholderText("#RRGGBB");
    fireEvent.change(hexInput, { target: { value: "#AA3300" } });
    fireEvent.blur(hexInput);

    await waitFor(() => {
      expect(onCommit).toHaveBeenLastCalledWith(
        expect.objectContaining({
          source: "custom",
          name: "自作レッド",
          presetId: null,
          hex: "#AA3300",
        }),
      );
    });
  });

  test("hex正規表現に一致しない手入力は確定されない（onCommit不発）", async () => {
    const { onCommit } = renderPicker();

    const brandSelect = await screen.findByRole("combobox", {
      name: "メーカー",
    });
    fireEvent.change(brandSelect, { target: { value: "__custom__" } });

    const colorNameInput = await screen.findByLabelText("カラー名");
    fireEvent.change(colorNameInput, { target: { value: "不正カラー" } });
    fireEvent.blur(colorNameInput);
    onCommit.mockClear();

    const hexInput = screen.getByPlaceholderText("#RRGGBB");
    fireEvent.change(hexInput, { target: { value: "not-a-hex" } });
    fireEvent.blur(hexInput);

    expect(onCommit).not.toHaveBeenCalled();
    expect(hexInput.getAttribute("aria-invalid")).toBe("true");
  });

  test("カラー名が空のままではonCommitされない", async () => {
    const { onCommit } = renderPicker();

    const brandSelect = await screen.findByRole("combobox", {
      name: "メーカー",
    });
    fireEvent.change(brandSelect, { target: { value: "__custom__" } });

    const hexInput = screen.getByPlaceholderText("#RRGGBB");
    fireEvent.change(hexInput, { target: { value: "#123456" } });
    fireEvent.blur(hexInput);

    expect(onCommit).not.toHaveBeenCalled();
  });

  test("カラーチップ写真添付でsavePhoto経由のchipPhotoIdがonCommitへ渡る", async () => {
    vi.mocked(savePhoto).mockResolvedValue("ph_chip1");
    const { onCommit } = renderPicker();

    const brandSelect = await screen.findByRole("combobox", {
      name: "メーカー",
    });
    fireEvent.change(brandSelect, { target: { value: "__custom__" } });

    const colorNameInput = await screen.findByLabelText("カラー名");
    fireEvent.change(colorNameInput, { target: { value: "チップカラー" } });
    fireEvent.blur(colorNameInput);

    const fileInput = document.querySelector(
      'input[type="file"]',
    ) as HTMLInputElement;
    const file = new File(["binary"], "chip.png", { type: "image/png" });
    fireEvent.change(fileInput, { target: { files: [file] } });

    await waitFor(() => {
      expect(savePhoto).toHaveBeenCalledWith(expect.any(File), "rcp_1");
    });
    await waitFor(() => {
      expect(onCommit).toHaveBeenLastCalledWith(
        expect.objectContaining({
          source: "custom",
          chipPhotoId: "ph_chip1",
        }),
      );
    });
  });
});

describe("PaintPicker — カラーピッカーの連続コミット防止", () => {
  test("color inputへの連続changeではonCommitが発火せず、blurで1回だけ発火する", async () => {
    const { onCommit } = renderPicker();

    const brandSelect = await screen.findByRole("combobox", {
      name: "メーカー",
    });
    fireEvent.change(brandSelect, { target: { value: "__custom__" } });

    const colorNameInput = await screen.findByLabelText("カラー名");
    fireEvent.change(colorNameInput, { target: { value: "ドラッグテスト" } });
    fireEvent.blur(colorNameInput);
    await waitFor(() => {
      expect(onCommit).toHaveBeenCalledTimes(1);
    });
    onCommit.mockClear();

    const colorPicker = screen.getByLabelText(
      "色見本を指定",
    ) as HTMLInputElement;

    // ドラッグ中を模した連続change（onBlurが発生するまでcommitされない）
    fireEvent.change(colorPicker, { target: { value: "#111111" } });
    fireEvent.change(colorPicker, { target: { value: "#222222" } });
    fireEvent.change(colorPicker, { target: { value: "#333333" } });

    expect(onCommit).not.toHaveBeenCalled();

    fireEvent.blur(colorPicker);

    await waitFor(() => {
      expect(onCommit).toHaveBeenCalledTimes(1);
    });
    expect(onCommit).toHaveBeenLastCalledWith(
      expect.objectContaining({
        source: "custom",
        name: "ドラッグテスト",
        hex: "#333333",
      }),
    );
  });
});

describe("PaintPicker — valueプロパティの再同期", () => {
  test("rerenderでvalue（preset形状）を与えると選択状態表示（ブランド・色名）に復元される", async () => {
    const onCommit = vi.fn();
    const { rerender } = render(
      <ToastHost>
        <PaintPicker recipeId="rcp_1" onCommit={onCommit} />
      </ToastHost>,
    );

    // ブランドがロードされるまで待つ（loadBrandIndexは非同期）
    await screen.findByRole("combobox", { name: "メーカー" });

    const presetValue: PaletteColor = {
      id: "col_existing",
      source: "preset",
      brand: "Citadel",
      name: "Mephiston Red",
      presetId: "citadel:mephiston-red",
      hex: "#960C0C",
      chipPhotoId: null,
    };

    rerender(
      <ToastHost>
        <PaintPicker recipeId="rcp_1" value={presetValue} onCommit={onCommit} />
      </ToastHost>,
    );

    const brandSelect = await screen.findByRole("combobox", {
      name: "メーカー",
    });
    await waitFor(() => {
      expect((brandSelect as HTMLSelectElement).value).toBe("citadel");
    });

    const colorInput = (await screen.findByLabelText(
      "カラー",
    )) as HTMLInputElement;
    await waitFor(() => {
      expect(colorInput.value).toContain("Mephiston Red");
    });
  });

  test("valueをundefined→確定色に切替えても表示が追従する", async () => {
    const onCommit = vi.fn();
    const { rerender } = render(
      <ToastHost>
        <PaintPicker recipeId="rcp_1" onCommit={onCommit} />
      </ToastHost>,
    );
    await screen.findByRole("combobox", { name: "メーカー" });

    // 初期はカスタムモード（brandId=null）のためカラー名入力が表示される
    expect(await screen.findByLabelText("カラー名")).toBeInTheDocument();

    const customValue: PaletteColor = {
      id: "col_custom_1",
      source: "custom",
      brand: "自家調合",
      name: "自作レッド",
      presetId: null,
      hex: "#AA3300",
      chipPhotoId: null,
    };

    rerender(
      <ToastHost>
        <PaintPicker recipeId="rcp_1" value={customValue} onCommit={onCommit} />
      </ToastHost>,
    );

    await waitFor(() => {
      const colorNameInput = screen.getByLabelText(
        "カラー名",
      ) as HTMLInputElement;
      expect(colorNameInput.value).toBe("自作レッド");
    });
    const brandNameInput = screen.getByLabelText(
      "ブランド名（任意）",
    ) as HTMLInputElement;
    expect(brandNameInput.value).toBe("自家調合");
  });
});
