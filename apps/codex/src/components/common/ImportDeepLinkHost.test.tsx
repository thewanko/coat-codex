// components/common/ImportDeepLinkHost.test.tsx — useImportDeepLink結線ホストのテスト
// （技術計画v1.3 §6-2・§7 ST-23）
//
// useImportDeepLink自体（フックのロジック）はlib/useImportDeepLink.test.tsxで厚く検証済み。
// ここではホストがフックの戻り値を正しくImportFromScriptoriumDialog/ImportErrorDialogへ
// 結線しているかのみを、フックをモックして検証する（薄いラッパーの結線確認）。

import "../../i18n";
import { beforeAll, describe, expect, test, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import i18next from "../../i18n";
import ImportDeepLinkHost from "./ImportDeepLinkHost";
import { useImportDeepLink } from "../../lib/useImportDeepLink";
import type { UseImportDeepLinkResult } from "../../lib/useImportDeepLink";

vi.mock("../../lib/useImportDeepLink", () => ({
  useImportDeepLink: vi.fn(),
}));

beforeAll(() => {
  void i18next.changeLanguage("ja");
});

function mockResult(
  overrides: Partial<UseImportDeepLinkResult> = {},
): UseImportDeepLinkResult {
  return {
    state: { phase: "idle" },
    confirm: vi.fn(),
    dismiss: vi.fn(),
    importError: null,
    dismissImportError: vi.fn(),
    ...overrides,
  };
}

describe("ImportDeepLinkHost", () => {
  test("state.phase=idleかつimportError=nullのとき、どちらのダイアログも描画しない", () => {
    vi.mocked(useImportDeepLink).mockReturnValue(mockResult());

    render(<ImportDeepLinkHost />);
    expect(screen.queryAllByRole("dialog")).toHaveLength(0);
  });

  test("state.phase=loadingのときImportFromScriptoriumDialogを描画する", () => {
    vi.mocked(useImportDeepLink).mockReturnValue(
      mockResult({ state: { phase: "loading" } }),
    );

    render(<ImportDeepLinkHost />);
    expect(screen.getByText("レシピ情報を取得しています…")).toBeInTheDocument();
  });

  test("importError非nullのときImportErrorDialogへmessage/issuesを渡して描画する", () => {
    vi.mocked(useImportDeepLink).mockReturnValue(
      mockResult({
        importError: {
          message: "検証に失敗しました",
          issues: [{ path: ["recipe", "title"], message: "必須項目です" }],
        },
      }),
    );

    render(<ImportDeepLinkHost />);
    expect(screen.getByText("検証に失敗しました")).toBeInTheDocument();
    const issueList = screen.getByTestId("import-error-issues");
    expect(issueList).toHaveTextContent("recipe.title");
    expect(issueList).toHaveTextContent("必須項目です");
  });
});
