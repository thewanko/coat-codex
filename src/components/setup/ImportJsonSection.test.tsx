// components/setup/ImportJsonSection.test.tsx — 枠のみの設置を検証する
// （技術計画v2.2 §4.2 T23: 結線はT33）。

import "../../i18n";
import { beforeAll, describe, expect, test } from "vitest";
import { render, screen } from "@testing-library/react";
import i18next from "../../i18n";
import ImportJsonSection from "./ImportJsonSection";

beforeAll(() => {
  void i18next.changeLanguage("ja");
});

describe("ImportJsonSection", () => {
  test("見出し・説明・disabledボタンが表示される", () => {
    render(<ImportJsonSection />);

    expect(
      screen.getByRole("heading", { name: "JSONからインポート" }),
    ).toBeInTheDocument();
    expect(
      screen.getByText("エクスポートしたJSONファイルから復元できます"),
    ).toBeInTheDocument();
    const button = screen.getByRole("button", { name: "JSONからインポート" });
    expect(button).toBeDisabled();
  });
});
