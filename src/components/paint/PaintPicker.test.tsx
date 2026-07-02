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

vi.mock("../../lib/paintPresets", () => ({
  loadBrandIndex: vi.fn().mockResolvedValue([
    { id: "citadel", label: "Citadel", file: "citadel.json", count: 2 },
    { id: "vallejo", label: "Vallejo", file: "vallejo.json", count: 1 },
  ]),
  searchColors: vi.fn(async (brandId: string, query: string) => {
    const all = [
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
    if (brandId !== "citadel") return [];
    const q = query.trim().toLowerCase();
    if (q === "") return all;
    return all.filter(
      (c) =>
        c.name.toLowerCase().includes(q) || c.nameJa.toLowerCase().includes(q),
    );
  }),
}));

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
