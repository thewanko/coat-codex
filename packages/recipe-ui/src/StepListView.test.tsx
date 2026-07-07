import { describe, expect, test } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import i18next from "i18next";
import { I18nextProvider, initReactI18next } from "react-i18next";
import type { RecipeDoc, Step } from "@coat-codex/recipe-core";
import { PhotoSourceProvider } from "./PhotoSource";
import StepListView from "./StepListView";

// StepListView（内部でMixBadge/TechniqueChip/SwatchChipのt()を使う）はグローバルi18nextに
// 依存するため、recipe-ui専用の独立インスタンスをI18nextProvider経由で渡す
// （SwatchChip.test.tsxの前例に倣う）。
const testI18n = i18next.createInstance();
void testI18n.use(initReactI18next).init({
  lng: "ja",
  fallbackLng: "ja",
  resources: {
    ja: {
      translation: {
        paint: { hexUnset: "hex未指定" },
        mix: { badgeWarning: "⚠ 計 {{value}}%" },
        techniques: { basecoat: "ベースコート" },
      },
    },
  },
  interpolation: { escapeValue: false },
});

function renderWithI18n(ui: React.ReactElement) {
  return render(<I18nextProvider i18n={testI18n}>{ui}</I18nextProvider>);
}

type PaletteColor = RecipeDoc["palette"][number];
type Tool = RecipeDoc["tools"][number];

function makeStep(overrides: Partial<Step> & { id: string }): Step {
  return {
    technique: { presetKey: null, label: null },
    photoId: null,
    paints: [],
    mix: null,
    toolIds: [],
    memo: "",
    ...overrides,
  };
}

function makeColor(
  overrides: Partial<PaletteColor> & { id: string },
): PaletteColor {
  return {
    source: "custom",
    brand: null,
    name: "色",
    presetId: null,
    hex: "#000000",
    chipPhotoId: null,
    ...overrides,
  };
}

describe("StepListView", () => {
  test("steps件数分の行（data-testid=step-list-row）を描画する", () => {
    const steps = [
      makeStep({ id: "s1" }),
      makeStep({ id: "s2" }),
      makeStep({ id: "s3" }),
    ];
    renderWithI18n(
      <StepListView steps={steps} palette={[]} tools={[]} photoCrops={{}} />,
    );
    expect(screen.getAllByTestId("step-list-row")).toHaveLength(3);
  });

  test("写真解決はPhotoSourceProvider経由のusePhotoUrlで行われる", async () => {
    const steps = [makeStep({ id: "s1", photoId: "ph_1" })];
    renderWithI18n(
      <PhotoSourceProvider resolvePhotoUrl={async () => "blob:mock-url"}>
        <StepListView steps={steps} palette={[]} tools={[]} photoCrops={{}} />
      </PhotoSourceProvider>,
    );

    await waitFor(() => {
      const img = document.querySelector("img");
      expect(img).toHaveAttribute("src", "blob:mock-url");
    });
  });

  test("PhotoSourceProvider未マウント時はプレースホルダ（imgなし）にフォールバックする", () => {
    const steps = [makeStep({ id: "s1", photoId: "ph_1" })];
    renderWithI18n(
      <StepListView steps={steps} palette={[]} tools={[]} photoCrops={{}} />,
    );
    expect(document.querySelector("img")).not.toBeInTheDocument();
  });

  test("ツール・メモを描画する", () => {
    const tools: Tool[] = [{ id: "tool_1", name: "エアブラシ", note: null }];
    const steps = [
      makeStep({ id: "s1", toolIds: ["tool_1"], memo: "薄めに2層" }),
    ];
    renderWithI18n(
      <StepListView steps={steps} palette={[]} tools={tools} photoCrops={{}} />,
    );
    expect(screen.getByText("エアブラシ")).toBeInTheDocument();
    expect(screen.getByText("薄めに2層")).toBeInTheDocument();
  });

  test("塗料行の混合バッジと技法チップを表示する", async () => {
    const palette: PaletteColor[] = [
      makeColor({ id: "col_a", name: "赤" }),
      makeColor({ id: "col_b", name: "白" }),
    ];
    const steps = [
      makeStep({
        id: "s1",
        technique: { presetKey: "basecoat", label: null },
        paints: [{ colorId: "col_a" }, { colorId: "col_b" }],
        mix: [60, 40],
      }),
    ];
    renderWithI18n(
      <StepListView
        steps={steps}
        palette={palette}
        tools={[]}
        photoCrops={{}}
      />,
    );

    expect(screen.getByText("ベースコート")).toBeInTheDocument();
    expect(screen.getByText("赤")).toBeInTheDocument();
    expect(screen.getByText("白")).toBeInTheDocument();
    await waitFor(() => {
      expect(screen.getByText("60% + 40% (3:2)")).toBeInTheDocument();
    });
  });
});
