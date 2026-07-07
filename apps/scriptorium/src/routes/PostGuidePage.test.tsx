// routes/PostGuidePage.test.tsx — 投稿ガイドの見出し・coat-codexアプリ導線・削除ポリシーへのリンクのレンダーテスト
// （技術計画v1 §5.1）

import "../i18n";
import { beforeAll, describe, expect, test } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import i18next from "../i18n";
import PostGuidePage from "./PostGuidePage";

describe("PostGuidePage — en", () => {
  beforeAll(async () => {
    await i18next.changeLanguage("en");
  });

  test("見出しとcoat-codexアプリへの外部リンクを表示する", () => {
    render(
      <MemoryRouter>
        <PostGuidePage />
      </MemoryRouter>,
    );

    expect(
      screen.getByRole("heading", { name: "How to post a recipe" }),
    ).toBeInTheDocument();

    const appLink = screen.getByRole("link", {
      name: "Open the coat-codex app",
    });
    expect(appLink).toHaveAttribute("href", "https://coat-codex.com");
    expect(appLink.getAttribute("rel")).toContain("noopener");
  });

  test("利用規約・コンテンツポリシーへのアプリ内リンクを表示する", () => {
    render(
      <MemoryRouter>
        <PostGuidePage />
      </MemoryRouter>,
    );

    expect(
      screen.getByRole("link", { name: "Terms & Disclaimer" }),
    ).toHaveAttribute("href", "/terms");
    expect(
      screen.getByRole("link", { name: "Content Policy" }),
    ).toHaveAttribute("href", "/content-policy");
  });

  test("公開の手順を3ステップ表示する", () => {
    render(
      <MemoryRouter>
        <PostGuidePage />
      </MemoryRouter>,
    );

    expect(
      screen.getByText("Create or open a recipe in the coat-codex app."),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/Choose “Publish to Scriptorium”/),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        "Your recipe appears in the public feed here within a few minutes.",
      ),
    ).toBeInTheDocument();
  });
});

describe("PostGuidePage — ja", () => {
  beforeAll(async () => {
    await i18next.changeLanguage("ja");
  });

  test("見出しとcoat-codexアプリへの外部リンクを表示する（ja）", () => {
    render(
      <MemoryRouter>
        <PostGuidePage />
      </MemoryRouter>,
    );

    expect(
      screen.getByRole("heading", { name: "レシピの投稿方法" }),
    ).toBeInTheDocument();

    const appLink = screen.getByRole("link", {
      name: "coat-codex アプリを開く",
    });
    expect(appLink).toHaveAttribute("href", "https://coat-codex.com");
    expect(appLink.getAttribute("rel")).toContain("noopener");
  });
});
