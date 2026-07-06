// components/home/StorageStatusBar.test.tsx — 永続化状態・使用量・最終エクスポート表示
// （技術計画v2.2 §3.5「StorageStatusBar」・T34）
//
// 判定ロジック自体（persisted/estimate/鮮度計算）はlib/storageHealth.ts（T15）でテスト済み。
// ここではUIがそれをどう表示するか（バッジ出し分け・Safari警告・使用量非表示条件・
// 最終エクスポート表示）のみを検証する。

import "../../i18n";
import { beforeAll, beforeEach, describe, expect, test, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import i18next from "../../i18n";
import StorageStatusBar from "./StorageStatusBar";
import {
  checkPersisted,
  estimateUsage,
  readAllRecipeExports,
} from "../../lib/storageHealth";

beforeAll(() => {
  void i18next.changeLanguage("ja");
});

vi.mock("../../lib/storageHealth", async () => {
  const actual = await vi.importActual<
    typeof import("../../lib/storageHealth")
  >("../../lib/storageHealth");
  return {
    ...actual,
    checkPersisted: vi.fn(),
    estimateUsage: vi.fn(),
    readAllRecipeExports: vi.fn(),
  };
});

describe("StorageStatusBar", () => {
  beforeEach(() => {
    vi.mocked(checkPersisted).mockReset();
    vi.mocked(estimateUsage).mockReset();
    vi.mocked(readAllRecipeExports).mockReset();
  });

  test("persisted=trueのとき「データ保護: 有効」を表示し、警告文は出さない", async () => {
    vi.mocked(checkPersisted).mockResolvedValue(true);
    vi.mocked(estimateUsage).mockResolvedValue(undefined);
    vi.mocked(readAllRecipeExports).mockResolvedValue({});

    render(<StorageStatusBar />);

    expect(await screen.findByText("データ保護: 有効")).toBeInTheDocument();
    expect(
      screen.queryByText(/JSONバックアップを推奨します/),
    ).not.toBeInTheDocument();
  });

  test("persisted=falseのとき「保護なし」表示とSafari警告文の両方を表示する", async () => {
    vi.mocked(checkPersisted).mockResolvedValue(false);
    vi.mocked(estimateUsage).mockResolvedValue(undefined);
    vi.mocked(readAllRecipeExports).mockResolvedValue({});

    render(<StorageStatusBar />);

    expect(await screen.findByText(/保護なし/)).toBeInTheDocument();
    expect(
      screen.getByText(/JSONバックアップを推奨します/),
    ).toBeInTheDocument();
  });

  test("persisted=undefined（API非対応）のときバッジは出さずSafari警告文のみ表示する", async () => {
    vi.mocked(checkPersisted).mockResolvedValue(undefined);
    vi.mocked(estimateUsage).mockResolvedValue(undefined);
    vi.mocked(readAllRecipeExports).mockResolvedValue({});

    render(<StorageStatusBar />);

    await waitFor(() => {
      expect(
        screen.getByText(/JSONバックアップを推奨します/),
      ).toBeInTheDocument();
    });
    expect(screen.queryByText("データ保護: 有効")).not.toBeInTheDocument();
    expect(screen.queryByText(/保護なし/)).not.toBeInTheDocument();
  });

  test("estimate()が値を返す場合は使用量を表示する", async () => {
    vi.mocked(checkPersisted).mockResolvedValue(true);
    vi.mocked(estimateUsage).mockResolvedValue({
      usage: 12.3 * 1024 * 1024,
      quota: 1024 * 1024 * 1024,
    });
    vi.mocked(readAllRecipeExports).mockResolvedValue({});

    render(<StorageStatusBar />);

    expect(await screen.findByText(/12\.3 MB/)).toBeInTheDocument();
    expect(screen.getByText(/1\.0 GB/)).toBeInTheDocument();
  });

  test("estimate()がundefined（非対応環境）のとき使用量部分を表示しない", async () => {
    vi.mocked(checkPersisted).mockResolvedValue(true);
    vi.mocked(estimateUsage).mockResolvedValue(undefined);
    vi.mocked(readAllRecipeExports).mockResolvedValue({});

    render(<StorageStatusBar />);

    await screen.findByText("データ保護: 有効");
    expect(screen.queryByText(/MB/)).not.toBeInTheDocument();
    expect(screen.queryByText(/GB/)).not.toBeInTheDocument();
  });

  test("recipeExportが1件もなければ「未実施」を表示する", async () => {
    vi.mocked(checkPersisted).mockResolvedValue(true);
    vi.mocked(estimateUsage).mockResolvedValue(undefined);
    vi.mocked(readAllRecipeExports).mockResolvedValue({});

    render(<StorageStatusBar />);

    expect(
      await screen.findByText(/最終エクスポート: 未実施/),
    ).toBeInTheDocument();
  });

  test("全レシピのrecipeExport:*の最大値を最終エクスポートとして表示する", async () => {
    vi.mocked(checkPersisted).mockResolvedValue(true);
    vi.mocked(estimateUsage).mockResolvedValue(undefined);
    vi.mocked(readAllRecipeExports).mockResolvedValue({
      rcp_1: "2026-06-01T00:00:00.000Z",
      rcp_2: "2026-07-01T00:00:00.000Z",
    });

    render(<StorageStatusBar />);

    const expected = new Date("2026-07-01T00:00:00.000Z").toLocaleDateString(
      "ja",
    );
    expect(
      await screen.findByText(new RegExp(`最終エクスポート: ${expected}`)),
    ).toBeInTheDocument();
  });

  test("volumeCountが渡された場合はVOLUMES表示を含む", async () => {
    vi.mocked(checkPersisted).mockResolvedValue(true);
    vi.mocked(estimateUsage).mockResolvedValue(undefined);
    vi.mocked(readAllRecipeExports).mockResolvedValue({});

    render(<StorageStatusBar volumeCount={6} />);

    expect(await screen.findByText(/6 VOLUMES/)).toBeInTheDocument();
  });
});
