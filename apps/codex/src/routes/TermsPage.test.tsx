// routes/TermsPage.test.tsx — 利用規約ページの主要セクション描画とフッターからの到達確認
// （技術計画v2 §4.2 T35・v1レビュー指摘11）

import "../i18n";
import { beforeAll, describe, expect, test } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router";
import i18next from "../i18n";
import TermsPage from "./TermsPage";
import AppFooter from "../components/common/AppFooter";

beforeAll(() => {
  void i18next.changeLanguage("ja");
});

function renderTerms() {
  return render(
    <MemoryRouter initialEntries={["/terms"]}>
      <TermsPage />
    </MemoryRouter>,
  );
}

describe("TermsPage", () => {
  test("免責事項セクションを表示する", () => {
    renderTerms();

    expect(
      screen.getByRole("heading", { name: "免責事項" }),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/データの消失・破損その他の損害について/),
    ).toBeInTheDocument();
  });

  test("Safariの7日消去リスクを説明する", () => {
    renderTerms();

    expect(
      screen.getByRole("heading", { name: "Safariの7日間消去リスク" }),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/7日間coat-codexを開かない状態が続くと/),
    ).toBeInTheDocument();
  });

  test("バックアップ（JSONエクスポート）推奨を説明する", () => {
    renderTerms();

    expect(
      screen.getByRole("heading", { name: "バックアップのお願い" }),
    ).toBeInTheDocument();
    expect(screen.getByText(/JSONエクスポート機能で/)).toBeInTheDocument();
  });

  test("商標表記の長文（原典§2）と各ブランド名を表示する", () => {
    renderTerms();

    expect(
      screen.getByRole("heading", { name: "商標について" }),
    ).toBeInTheDocument();
    expect(
      screen.getByText("Citadel Colour — Games Workshop Limitedの商標"),
    ).toBeInTheDocument();
    expect(
      screen.getByText("Vallejo — Acrylicos Vallejo, S.L.の商標"),
    ).toBeInTheDocument();
    expect(screen.getByText("AK Interactive — 同社の商標")).toBeInTheDocument();
    expect(
      screen.getByText("Coat d'Arms — 現在の製造・販売元の商号"),
    ).toBeInTheDocument();
  });

  test("連絡先メールアドレスを表示する", () => {
    renderTerms();

    expect(screen.getByText(/contact@coat-codex\.com/)).toBeInTheDocument();
  });

  test("ホームへ戻る導線を表示する", () => {
    renderTerms();

    expect(screen.getByRole("link", { name: "レシピ一覧へ" })).toHaveAttribute(
      "href",
      "/",
    );
  });
});

describe("AppFooter — /terms への到達", () => {
  test("フッターの利用規約リンクから/termsに遷移し、商標短文も表示する", () => {
    render(
      <MemoryRouter initialEntries={["/"]}>
        <Routes>
          <Route
            path="/"
            element={
              <>
                <div>Home</div>
                <AppFooter />
              </>
            }
          />
          <Route path="/terms" element={<TermsPage />} />
        </Routes>
      </MemoryRouter>,
    );

    expect(
      screen.getByText(/coat-codexは非公式のファンメイドツールであり/),
    ).toBeInTheDocument();

    fireEvent.click(screen.getByRole("link", { name: "利用規約・免責" }));

    expect(
      screen.getByRole("heading", { name: "利用規約・免責事項" }),
    ).toBeInTheDocument();
  });
});
