// routes/PrivacyPage.test.tsx — プライバシーポリシーページの見出し・contact補間のレンダーテスト
// （技術計画v1 §10 公開必須）

import "../i18n";
import { beforeAll, describe, expect, test } from "vitest";
import { render, screen } from "@testing-library/react";
import i18next from "../i18n";
import PrivacyPage from "./PrivacyPage";

describe("PrivacyPage — en", () => {
  beforeAll(async () => {
    await i18next.changeLanguage("en");
  });

  test("見出しと各セクション見出しを表示する", () => {
    render(<PrivacyPage />);

    expect(
      screen.getByRole("heading", { name: "Privacy Policy", level: 1 }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: "Information we collect and store" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: "Deletion password" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: "Infrastructure we use" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: "Tracking" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: "Retention and deletion" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: "Contact" }),
    ).toBeInTheDocument();
  });

  test("contact窓口のメールアドレスを表示する", () => {
    render(<PrivacyPage />);

    expect(
      screen.getAllByText(/contact@coat-codex\.com/).length,
    ).toBeGreaterThan(0);
  });
});

describe("PrivacyPage — ja", () => {
  beforeAll(async () => {
    await i18next.changeLanguage("ja");
  });

  test("見出しと各セクション見出しを表示する", () => {
    render(<PrivacyPage />);

    expect(
      screen.getByRole("heading", { name: "プライバシーポリシー", level: 1 }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: "収集・保存する情報" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: "削除用パスワードについて" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: "利用しているインフラ" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: "トラッキングについて" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: "保持期間と削除" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: "お問い合わせ窓口" }),
    ).toBeInTheDocument();
  });

  test("contact窓口のメールアドレスを表示する", () => {
    render(<PrivacyPage />);

    expect(
      screen.getAllByText(/contact@coat-codex\.com/).length,
    ).toBeGreaterThan(0);
  });
});
