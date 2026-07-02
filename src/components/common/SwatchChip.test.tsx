import "../../i18n";
import { beforeAll, describe, expect, test, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import i18next from "../../i18n";
import SwatchChip from "./SwatchChip";

vi.mock("../../db/photoStore", () => ({
  resolvePhotoUrl: vi.fn().mockResolvedValue("blob:mock-url"),
}));

beforeAll(() => {
  void i18next.changeLanguage("ja");
});

describe("SwatchChip", () => {
  test("variant=hex renders a solid-fill chip with name and brand/hex at lg", () => {
    render(
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
    render(
      <SwatchChip variant="photo" size="md" photoId="ph_1" name="チップ写真" />,
    );

    const img = await screen.findByRole("img");
    expect(img).toHaveAttribute("src", "blob:mock-url");
    expect(screen.getByText("チップ写真")).toBeInTheDocument();
  });

  test("variant=empty shows checker pattern and paint.hexUnset label at md+", () => {
    render(<SwatchChip variant="empty" size="md" />);

    expect(screen.getByTestId("swatch-chip-checker")).toBeInTheDocument();
    expect(screen.getByText("hex未指定")).toBeInTheDocument();
  });

  test("size=sm does not render name/meta label", () => {
    render(<SwatchChip variant="hex" size="sm" hex="#000" name="小" />);
    expect(screen.queryByText("小")).not.toBeInTheDocument();
  });
});
