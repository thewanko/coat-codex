// routes/TermsPage.test.tsx — 利用規約ページの見出し・削除フロー（5分TTL）・商標文言のレンダーテスト
// （技術計画v1 §5.4）

import "../i18n";
import { beforeAll, describe, expect, test } from "vitest";
import { render, screen } from "@testing-library/react";
import i18next from "../i18n";
import TermsPage from "./TermsPage";

describe("TermsPage — en", () => {
  beforeAll(async () => {
    await i18next.changeLanguage("en");
  });

  test("見出しと削除フロー・5分キャッシュTTLの明記を表示する", () => {
    render(<TermsPage />);

    expect(
      screen.getByRole("heading", { name: "Terms & Disclaimer" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: "Deleting your post" }),
    ).toBeInTheDocument();
    expect(
      screen.getAllByText(/contact@coat-codex\.com/).length,
    ).toBeGreaterThan(0);
    expect(screen.getByText(/up to 5 minutes/)).toBeInTheDocument();
  });

  test("商標表記の長文を表示する", () => {
    render(<TermsPage />);

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

describe("TermsPage — ja", () => {
  beforeAll(async () => {
    await i18next.changeLanguage("ja");
  });

  test("見出しと削除フロー・5分キャッシュTTLの明記を表示する", () => {
    render(<TermsPage />);

    expect(
      screen.getByRole("heading", { name: "利用規約・免責" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: "投稿の削除について" }),
    ).toBeInTheDocument();
    expect(
      screen.getAllByText(/contact@coat-codex\.com/).length,
    ).toBeGreaterThan(0);
    expect(
      screen.getByText(/最大5分程度かかる場合があります/),
    ).toBeInTheDocument();
  });

  test("商標表記の長文を表示する", () => {
    render(<TermsPage />);

    expect(
      screen.getByRole("heading", { name: "商標について" }),
    ).toBeInTheDocument();
    expect(
      screen.getByText("Citadel Colour — Games Workshop Limitedの商標"),
    ).toBeInTheDocument();
  });
});
