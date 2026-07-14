// components/common/AppFooter.test.tsx — 封蝋ロゴ実画像化（2026-07-03）の疎通確認
// フッターに封蝋ロゴ画像がaria-hiddenの装飾要素として表示されることのみを検証する。

import "../../i18n";
import { afterEach, beforeAll, describe, expect, test } from "vitest";
import { render, cleanup, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import i18next from "../../i18n";
import AppFooter from "./AppFooter";

beforeAll(() => {
  void i18next.changeLanguage("ja");
});

afterEach(() => {
  cleanup();
});

describe("AppFooter — 封蝋ロゴ", () => {
  test("ロゴ画像がaria-hiddenの装飾画像として表示される", () => {
    render(
      <MemoryRouter>
        <AppFooter />
      </MemoryRouter>,
    );

    const logo = screen.getByAltText("");
    expect(logo.tagName).toBe("IMG");
    expect(logo).toHaveAttribute("aria-hidden", "true");
  });

  test("© coat-codexと利用規約リンクは維持される", () => {
    render(
      <MemoryRouter>
        <AppFooter />
      </MemoryRouter>,
    );

    expect(screen.getByText("© coat-codex")).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: "利用規約・免責" }),
    ).toBeInTheDocument();
  });

  test("使い方・Q&Aへのリンクが表示される", () => {
    render(
      <MemoryRouter>
        <AppFooter />
      </MemoryRouter>,
    );

    expect(screen.getByRole("link", { name: "使い方・Q&A" })).toHaveAttribute(
      "href",
      "/help",
    );
  });

  test("ツールライブラリへのリンクが表示される", () => {
    render(
      <MemoryRouter>
        <AppFooter />
      </MemoryRouter>,
    );

    expect(
      screen.getByRole("link", { name: "ツールライブラリ" }),
    ).toHaveAttribute("href", "/tools");
  });

  test("更新履歴へのリンクが表示される", () => {
    render(
      <MemoryRouter>
        <AppFooter />
      </MemoryRouter>,
    );

    expect(screen.getByRole("link", { name: "更新履歴" })).toHaveAttribute(
      "href",
      "/updates",
    );
  });
});
