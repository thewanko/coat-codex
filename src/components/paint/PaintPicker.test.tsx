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
