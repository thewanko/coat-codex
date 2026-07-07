import { describe, expect, test } from "vitest";
import { render, screen } from "@testing-library/react";
import i18next from "i18next";
import { I18nextProvider, initReactI18next } from "react-i18next";
import TechniqueChip from "./TechniqueChip";

// TechniqueChipはグローバルi18nextインスタンスに依存するため、recipe-ui専用の
// 独立インスタンスをI18nextProvider経由で渡す（SwatchChip.test.tsxの前例に倣う）。
const testI18n = i18next.createInstance();
void testI18n.use(initReactI18next).init({
  lng: "ja",
  fallbackLng: "ja",
  resources: {
    ja: { translation: { techniques: { basecoat: "ベースコート" } } },
  },
  interpolation: { escapeValue: false },
});

function renderWithI18n(ui: React.ReactElement) {
  return render(<I18nextProvider i18n={testI18n}>{ui}</I18nextProvider>);
}

describe("TechniqueChip", () => {
  test("presetKeyがマスタ内ならt(techniques.<presetKey>)で解決したラベルを表示する", () => {
    renderWithI18n(
      <TechniqueChip technique={{ presetKey: "basecoat", label: null }} />,
    );
    expect(screen.getByText("ベースコート")).toBeInTheDocument();
  });

  test("presetKey=null・label非nullはlabelをそのまま表示する", () => {
    renderWithI18n(
      <TechniqueChip
        technique={{ presetKey: null, label: "自由記述の技法" }}
      />,
    );
    expect(screen.getByText("自由記述の技法")).toBeInTheDocument();
  });

  test("presetKey・labelともnullの場合は非描画（null）", () => {
    const { container } = renderWithI18n(
      <TechniqueChip technique={{ presetKey: null, label: null }} />,
    );
    expect(container).toBeEmptyDOMElement();
  });
});
