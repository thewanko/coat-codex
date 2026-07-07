// routes/ContentPolicyPage.test.tsx — コンテンツポリシーの見出し・自己撮影ルール・通報手続・商標文言のレンダーテスト
// （技術計画v1 §5.4）

import "../i18n";
import { beforeAll, describe, expect, test } from "vitest";
import { render, screen } from "@testing-library/react";
import i18next from "../i18n";
import ContentPolicyPage from "./ContentPolicyPage";

describe("ContentPolicyPage — en", () => {
  beforeAll(async () => {
    await i18next.changeLanguage("en");
  });

  test("見出しと自己撮影ルール・通報手続を表示する", () => {
    render(<ContentPolicyPage />);

    expect(
      screen.getByRole("heading", { name: "Content Policy" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: "Photos you post must be your own" }),
    ).toBeInTheDocument();
    expect(screen.getByText(/box art/)).toBeInTheDocument();
    expect(
      screen.getByText(/automatically hidden from the public feed/),
    ).toBeInTheDocument();
  });

  test("商標表記の長文を表示する", () => {
    render(<ContentPolicyPage />);

    expect(
      screen.getByRole("heading", { name: "Trademark Notice" }),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        "Citadel Colour — a trademark of Games Workshop Limited",
      ),
    ).toBeInTheDocument();
  });
});

describe("ContentPolicyPage — ja", () => {
  beforeAll(async () => {
    await i18next.changeLanguage("ja");
  });

  test("見出しと自己撮影ルール・通報手続を表示する", () => {
    render(<ContentPolicyPage />);

    expect(
      screen.getByRole("heading", { name: "コンテンツポリシー" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("heading", {
        name: "投稿できる写真はご自身で撮影したものに限ります",
      }),
    ).toBeInTheDocument();
    expect(screen.getByText(/ボックスアート/)).toBeInTheDocument();
    expect(
      screen.getByText(/公開一覧から自動的に非表示になります/),
    ).toBeInTheDocument();
  });

  test("商標表記の長文を表示する", () => {
    render(<ContentPolicyPage />);

    expect(
      screen.getByRole("heading", { name: "商標について" }),
    ).toBeInTheDocument();
    expect(
      screen.getByText("Citadel Colour — Games Workshop Limitedの商標"),
    ).toBeInTheDocument();
  });
});
