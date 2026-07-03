// components/common/ImportErrorDialog.test.tsx — Dialog error-detailバリアント（D-4・T33）

import "../../i18n";
import { beforeAll, describe, expect, test, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import i18next from "../../i18n";
import ImportErrorDialog from "./ImportErrorDialog";

beforeAll(() => {
  void i18next.changeLanguage("ja");
});

describe("ImportErrorDialog", () => {
  test("openがfalseのとき何も描画しない", () => {
    render(
      <ImportErrorDialog
        open={false}
        message="失敗しました"
        issues={[]}
        onClose={vi.fn()}
      />,
    );
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  test("要約メッセージとzod issue一覧（パス・メッセージ）を表示する", () => {
    render(
      <ImportErrorDialog
        open
        message="レシピデータの検証に失敗しました"
        issues={[
          { path: ["recipe", "title"], message: "文字列は空にできません" },
          { path: ["recipe", "parts", 0, "name"], message: "必須項目です" },
        ]}
        onClose={vi.fn()}
      />,
    );

    expect(screen.getByRole("dialog")).toHaveAttribute("aria-modal", "true");
    expect(
      screen.getByText("レシピデータの検証に失敗しました"),
    ).toBeInTheDocument();

    const issueList = screen.getByTestId("import-error-issues");
    expect(issueList).toHaveTextContent("recipe.title");
    expect(issueList).toHaveTextContent("文字列は空にできません");
    expect(issueList).toHaveTextContent("recipe.parts[0].name");
    expect(issueList).toHaveTextContent("必須項目です");
  });

  test("issuesが空配列のときリストを描画しない", () => {
    render(
      <ImportErrorDialog
        open
        message="JSONファイルとして不正です"
        issues={[]}
        onClose={vi.fn()}
      />,
    );
    expect(screen.queryByTestId("import-error-issues")).not.toBeInTheDocument();
  });

  test("✕ボタンでonCloseが呼ばれる", () => {
    const onClose = vi.fn();
    render(
      <ImportErrorDialog
        open
        message="失敗しました"
        issues={[]}
        onClose={onClose}
      />,
    );
    fireEvent.click(screen.getByLabelText("エラーダイアログを閉じる"));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  test("閉じるボタン（フッタ）でonCloseが呼ばれる", () => {
    const onClose = vi.fn();
    render(
      <ImportErrorDialog
        open
        message="失敗しました"
        issues={[]}
        onClose={onClose}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "閉じる" }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  test("backdropクリックでonCloseが呼ばれる", () => {
    const onClose = vi.fn();
    render(
      <ImportErrorDialog
        open
        message="失敗しました"
        issues={[]}
        onClose={onClose}
      />,
    );
    fireEvent.click(screen.getByTestId("import-error-dialog-backdrop"));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  test("ダイアログ内クリックでは閉じない", () => {
    const onClose = vi.fn();
    render(
      <ImportErrorDialog
        open
        message="失敗しました"
        issues={[]}
        onClose={onClose}
      />,
    );
    fireEvent.click(screen.getByRole("dialog"));
    expect(onClose).not.toHaveBeenCalled();
  });

  test("Escapeキーで閉じる", () => {
    const onClose = vi.fn();
    render(
      <ImportErrorDialog
        open
        message="失敗しました"
        issues={[]}
        onClose={onClose}
      />,
    );
    fireEvent.keyDown(window, { key: "Escape" });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  test("root pathの場合は(root)と表示する", () => {
    render(
      <ImportErrorDialog
        open
        message="ヘッダの検証に失敗しました"
        issues={[{ path: [], message: "オブジェクトが必要です" }]}
        onClose={vi.fn()}
      />,
    );
    const issueList = screen.getByTestId("import-error-issues");
    expect(issueList).toHaveTextContent("(root)");
  });
});
