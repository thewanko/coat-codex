import { describe, expect, test } from "vitest";
import { render, screen } from "@testing-library/react";
import i18next from "i18next";
import { I18nextProvider, initReactI18next } from "react-i18next";
import MixBadge from "./MixBadge";

// MixBadgeはグローバルi18nextインスタンス（ホストアプリが初期化するもの）に依存するため、
// このテストではrecipe-ui専用の独立インスタンスをI18nextProvider経由で渡す
// （ホストアプリのi18n設定・localesファイルには依存しない。SwatchChip.test.tsxの前例に倣う）。
const testI18n = i18next.createInstance();
void testI18n.use(initReactI18next).init({
  lng: "ja",
  fallbackLng: "ja",
  resources: {
    ja: { translation: { mix: { badgeWarning: "⚠ 計 {{value}}%" } } },
  },
  interpolation: { escapeValue: false },
});

function renderWithI18n(ui: React.ReactElement) {
  return render(<I18nextProvider i18n={testI18n}>{ui}</I18nextProvider>);
}

describe("MixBadge", () => {
  test("合計100の混色はformatMixBadge出力（比率併記）を表示する", () => {
    renderWithI18n(
      <MixBadge paints={[{ colorId: "a" }, { colorId: "b" }]} mix={[60, 40]} />,
    );
    expect(screen.getByText("60% + 40% (3:2)")).toBeInTheDocument();
    expect(screen.queryByText(/⚠/)).not.toBeInTheDocument();
  });

  test("合計≠100の混色は比率省略の文字列とmix.badgeWarningを併記する", () => {
    renderWithI18n(
      <MixBadge paints={[{ colorId: "a" }, { colorId: "b" }]} mix={[60, 50]} />,
    );
    expect(screen.getByText("60% + 50%")).toBeInTheDocument();
    expect(screen.getByText("⚠ 計 110%")).toBeInTheDocument();
  });

  test("単色（paints<=1）はバッジ・警告ともに非描画（null）", () => {
    const { container } = renderWithI18n(
      <MixBadge paints={[{ colorId: "a" }]} mix={null} />,
    );
    expect(container).toBeEmptyDOMElement();
  });

  test("塗料0件もバッジ・警告ともに非描画（null）", () => {
    const { container } = renderWithI18n(<MixBadge paints={[]} mix={null} />);
    expect(container).toBeEmptyDOMElement();
  });

  test("surface省略時はdata-surface=defaultが付く", () => {
    renderWithI18n(
      <MixBadge paints={[{ colorId: "a" }, { colorId: "b" }]} mix={[60, 40]} />,
    );
    expect(screen.getByText("60% + 40% (3:2)")).toHaveAttribute(
      "data-surface",
      "default",
    );
  });

  test('surface="raised"はdata-surface=raisedが付く', () => {
    renderWithI18n(
      <MixBadge
        paints={[{ colorId: "a" }, { colorId: "b" }]}
        mix={[60, 40]}
        surface="raised"
      />,
    );
    expect(screen.getByText("60% + 40% (3:2)")).toHaveAttribute(
      "data-surface",
      "raised",
    );
  });
});
