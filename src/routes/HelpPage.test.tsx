// routes/HelpPage.test.tsx — 使い方＋Q&Aページの主要見出し・画像出し分け・ステップ件数の確認
// （2026-07-05新設）

import "../i18n";
import { beforeAll, describe, expect, test } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import i18next from "../i18n";
import HelpPage from "./HelpPage";

beforeAll(() => {
  void i18next.changeLanguage("ja");
});

function renderHelp() {
  return render(
    <MemoryRouter initialEntries={["/help"]}>
      <HelpPage />
    </MemoryRouter>,
  );
}

describe("HelpPage", () => {
  test("タイトル・使い方見出し・FAQ見出しが描画される", () => {
    renderHelp();

    expect(
      screen.getByRole("heading", { name: "HOW TO USE" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "使い方" })).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: "よくある質問" }),
    ).toBeInTheDocument();
  });

  test("スクリーンショットはpicture>sourceでPC/モバイルを出し分ける", () => {
    const { container } = renderHelp();

    const pictures = container.querySelectorAll("picture");
    expect(pictures.length).toBeGreaterThan(0);

    for (const picture of pictures) {
      const source = picture.querySelector("source");
      expect(source).not.toBeNull();
      expect(source).toHaveAttribute("media", "(min-width: 768px)");
      expect(source?.getAttribute("srcset")).toBeTruthy();

      const img = picture.querySelector("img");
      expect(img).not.toBeNull();
      expect(img).toHaveAttribute("loading", "lazy");
      expect(img?.getAttribute("alt")).toBeTruthy();
    }
  });

  test("使い方ステップ見出しが6件以上ある", () => {
    renderHelp();

    const stepHeadings = [
      "1. レシピを作る",
      "2. 基本情報を登録",
      "3. 工程を編集",
      "4. 全体表示で管理",
      "5. SNSに共有",
      "6. 印刷・PDF",
    ];

    for (const heading of stepHeadings) {
      expect(
        screen.getByRole("heading", { name: heading }),
      ).toBeInTheDocument();
    }
  });
});
