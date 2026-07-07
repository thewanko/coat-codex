import { describe, expect, test } from "vitest";
import { render, screen } from "@testing-library/react";
import i18next from "i18next";
import { I18nextProvider, initReactI18next } from "react-i18next";
import { PhotoSourceProvider } from "./PhotoSource";
import SwatchChip from "./SwatchChip";

// SwatchChipはグローバルi18nextインスタンス（ホストアプリが初期化するもの）に依存するため、
// このテストではrecipe-ui専用の独立インスタンスをI18nextProvider経由で渡す
// （ホストアプリのi18n設定・localesファイルには依存しない）。
const testI18n = i18next.createInstance();
void testI18n.use(initReactI18next).init({
  lng: "ja",
  fallbackLng: "ja",
  resources: {
    ja: { translation: { paint: { hexUnset: "hex未指定" } } },
  },
  interpolation: { escapeValue: false },
});

function renderWithI18n(ui: React.ReactElement) {
  return render(<I18nextProvider i18n={testI18n}>{ui}</I18nextProvider>);
}

describe("SwatchChip", () => {
  test("variant=hex renders a solid-fill chip with name and brand/hex at lg", () => {
    renderWithI18n(
      <SwatchChip
        variant="hex"
        size="lg"
        hex="#7A2E1F"
        name="封蝋レッド"
        brand="Holbein"
      />,
    );

    expect(screen.getByText("封蝋レッド")).toBeInTheDocument();
    expect(screen.getByText("Holbein ・ #7A2E1F")).toBeInTheDocument();
  });

  test("variant=photo resolves photoId to an <img> and renders it non-processed", async () => {
    renderWithI18n(
      <PhotoSourceProvider resolvePhotoUrl={async () => "blob:mock-url"}>
        <SwatchChip
          variant="photo"
          size="md"
          photoId="ph_1"
          name="チップ写真"
        />
      </PhotoSourceProvider>,
    );

    const img = await screen.findByRole("img");
    expect(img).toHaveAttribute("src", "blob:mock-url");
    expect(screen.getByText("チップ写真")).toBeInTheDocument();
  });

  test("variant=empty shows checker pattern and paint.hexUnset label at md+", () => {
    renderWithI18n(<SwatchChip variant="empty" size="md" />);

    expect(screen.getByTestId("swatch-chip-checker")).toBeInTheDocument();
    expect(screen.getByText("hex未指定")).toBeInTheDocument();
  });

  test("size=sm does not render name/meta label", () => {
    renderWithI18n(<SwatchChip variant="hex" size="sm" hex="#000" name="小" />);
    expect(screen.queryByText("小")).not.toBeInTheDocument();
  });

  test("variant=photo without PhotoSourceProvider falls back to placeholder (no img)", () => {
    renderWithI18n(
      <SwatchChip variant="photo" size="md" photoId="ph_1" name="チップ写真" />,
    );

    expect(screen.queryByRole("img")).not.toBeInTheDocument();
    expect(
      screen.getByTestId("swatch-chip-frame").querySelector("span"),
    ).toBeInTheDocument();
  });
});
