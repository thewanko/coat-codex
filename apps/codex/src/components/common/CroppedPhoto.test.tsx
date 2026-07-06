import { describe, expect, test } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import CroppedPhoto from "./CroppedPhoto";
import type { CropRect } from "../../models/recipe";

describe("CroppedPhoto", () => {
  test("crop=nullの場合はplain imgをobject-fit: coverで表示する", () => {
    render(<CroppedPhoto src="blob:test" crop={null} alt="test-photo" />);
    const img = screen.getByAltText("test-photo") as HTMLImageElement;
    expect(img).toBeInTheDocument();
    expect(img.src).toContain("blob:test");
    // plainImg構造であることを確認（cropBox要素が存在しない）
    expect(
      screen.queryByTestId("cropped-photo-cropbox"),
    ).not.toBeInTheDocument();
  });

  test("crop=undefinedの場合もplain img表示になる", () => {
    render(<CroppedPhoto src="blob:test" crop={undefined} alt="test-photo" />);
    expect(screen.getByAltText("test-photo")).toBeInTheDocument();
    expect(
      screen.queryByTestId("cropped-photo-cropbox"),
    ).not.toBeInTheDocument();
  });

  test("crop設定時: ロード前はimgがvisibility hidden、onLoad後にcropBox/imgへスタイルが適用される", () => {
    const crop: CropRect = { x: 0.1, y: 0.1, w: 0.5, h: 0.5 };
    render(<CroppedPhoto src="blob:test" crop={crop} alt="cropped" />);

    const img = screen.getByAltText("cropped") as HTMLImageElement;
    // ロード前: visibility hidden
    expect(img.style.visibility).toBe("hidden");

    Object.defineProperty(img, "naturalWidth", {
      value: 1000,
      configurable: true,
    });
    Object.defineProperty(img, "naturalHeight", {
      value: 800,
      configurable: true,
    });
    fireEvent.load(img);

    expect(img.style.visibility).toBe("visible");
    // jsdomのCSSOMがcalc()式を正規化するため、計算結果（200%）で比較する
    expect(img.style.width).toBe("calc(200%)");

    const cropBox = screen.getByTestId("cropped-photo-cropbox");
    // CA = (0.5*1000)/(0.5*800) = 1.25（jsdomのCSSOMは"1.25 / 1"へ正規化する）
    expect(cropBox.style.aspectRatio).toBe("1.25 / 1");
  });
});
