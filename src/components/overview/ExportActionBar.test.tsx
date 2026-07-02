// components/overview/ExportActionBar.test.tsx — 枠のみ配置（全disabled）のテスト
// （技術計画v2.2 §3.3・§4.2 T28。結線はT33/T40）

import "../../i18n";
import { beforeAll, describe, expect, test } from "vitest";
import { render, screen } from "@testing-library/react";
import i18next from "../../i18n";
import ExportActionBar from "./ExportActionBar";

beforeAll(() => {
  void i18next.changeLanguage("ja");
});

describe("ExportActionBar — 配置のみ（全ボタンdisabled）", () => {
  test("印刷・PDF・X・Bluesky・note MD・JSON・素MDの7ボタンをすべてdisabledで配置する", () => {
    render(<ExportActionBar />);

    const labels = ["印刷", "PDF", "X", "Bluesky", "note MD", "JSON", "素MD"];
    for (const label of labels) {
      const button = screen.getByRole("button", { name: label });
      expect(button).toBeDisabled();
    }
  });

  test("JSON・素MDは隣接する結合ピル内に配置される（要件どおりの隣接配置）", () => {
    render(<ExportActionBar />);

    const jsonButton = screen.getByRole("button", { name: "JSON" });
    const mdButton = screen.getByRole("button", { name: "素MD" });
    expect(jsonButton.parentElement).toBe(mdButton.parentElement);
  });
});
