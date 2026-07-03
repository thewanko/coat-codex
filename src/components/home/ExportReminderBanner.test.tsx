// components/home/ExportReminderBanner.test.tsx — エクスポート促しリマインダー
// （技術計画v2.2 §3.5「ExportReminderBanner」・T34）
//
// 表示条件（リマインダー対象判定）自体はlib/storageHealth.tsのshouldShowExportReminder
// （T15）でテスト済み。ここではvariant出し分け・ワンタップエクスポート（写真を含めて
// exportRecipeToBlob→downloadBlob→recordRecipeExport→onExported）・
// 「あとで」7日スヌーズ（snoozeReminder呼び出し・onSnoozed）を検証する。

import "../../i18n";
import { beforeAll, beforeEach, describe, expect, test, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import i18next from "../../i18n";
import ExportReminderBanner from "./ExportReminderBanner";
import ToastHost from "../common/ToastHost";
import { exportRecipeToBlob } from "../../lib/exporters/json";
import { recordRecipeExport, snoozeReminder } from "../../lib/storageHealth";
import { downloadBlob } from "../common/downloadBlob";
import type { RecipeDoc } from "../../models/recipe";

beforeAll(() => {
  void i18next.changeLanguage("ja");
});

vi.mock("../../lib/exporters/json", async () => {
  const actual = await vi.importActual<
    typeof import("../../lib/exporters/json")
  >("../../lib/exporters/json");
  return {
    ...actual,
    exportRecipeToBlob: vi.fn(),
  };
});

vi.mock("../../lib/storageHealth", async () => {
  const actual = await vi.importActual<
    typeof import("../../lib/storageHealth")
  >("../../lib/storageHealth");
  return {
    ...actual,
    recordRecipeExport: vi.fn().mockResolvedValue(undefined),
    snoozeReminder: vi.fn().mockResolvedValue(undefined),
  };
});

vi.mock("../common/downloadBlob", async () => {
  const actual = await vi.importActual<typeof import("../common/downloadBlob")>(
    "../common/downloadBlob",
  );
  return {
    ...actual,
    downloadBlob: vi.fn(),
  };
});

function makeRecipe(overrides: Partial<RecipeDoc> = {}): RecipeDoc {
  return {
    schemaVersion: 1,
    id: "rcp_1",
    title: "赤い装甲",
    createdAt: "2026-06-01T00:00:00.000Z",
    updatedAt: "2026-06-15T00:00:00.000Z",
    overviewPhotoIds: [],
    palette: [],
    tools: [],
    baseSteps: [],
    parts: [],
    ...overrides,
  };
}

function renderBanner(
  props: Partial<React.ComponentProps<typeof ExportReminderBanner>> = {},
) {
  return render(
    <ToastHost>
      <ExportReminderBanner
        variant="full"
        targetRecipe={makeRecipe()}
        {...props}
      />
    </ToastHost>,
  );
}

describe("ExportReminderBanner", () => {
  beforeEach(() => {
    vi.mocked(exportRecipeToBlob).mockReset();
    vi.mocked(recordRecipeExport).mockClear();
    vi.mocked(snoozeReminder).mockClear();
    vi.mocked(downloadBlob).mockReset();
  });

  test("variant=fullはHome向け全幅メッセージを表示する", () => {
    renderBanner({ variant: "full" });
    expect(
      screen.getByText(
        "未バックアップの秘伝書があります。JSONでバックアップしましょう",
      ),
    ).toBeInTheDocument();
  });

  test("variant=compactはOverview向けメッセージを表示する", () => {
    renderBanner({ variant: "compact" });
    expect(
      screen.getByText("このレシピはまだバックアップされていません"),
    ).toBeInTheDocument();
  });

  test("「今すぐエクスポート」押下でexportRecipeToBlobが写真を含めて呼ばれる", async () => {
    const blob = new Blob(["{}"], { type: "application/json" });
    vi.mocked(exportRecipeToBlob).mockResolvedValue(blob);

    renderBanner();
    fireEvent.click(screen.getByRole("button", { name: "今すぐエクスポート" }));

    await waitFor(() => {
      expect(exportRecipeToBlob).toHaveBeenCalledWith("rcp_1", {
        includePhotos: true,
      });
    });
  });

  test("エクスポート成功後にdownloadBlob→recordRecipeExport→onExportedが呼ばれる", async () => {
    const blob = new Blob(["{}"], { type: "application/json" });
    vi.mocked(exportRecipeToBlob).mockResolvedValue(blob);
    const onExported = vi.fn();

    renderBanner({ onExported });
    fireEvent.click(screen.getByRole("button", { name: "今すぐエクスポート" }));

    await waitFor(() => {
      expect(downloadBlob).toHaveBeenCalledWith(blob, "赤い装甲.json");
    });
    await waitFor(() => {
      expect(recordRecipeExport).toHaveBeenCalledWith(
        "rcp_1",
        expect.any(String),
      );
    });
    await waitFor(() => {
      expect(onExported).toHaveBeenCalledWith("rcp_1");
    });
  });

  test("エクスポート失敗時はエラートーストを表示しonExportedは呼ばれない", async () => {
    vi.mocked(exportRecipeToBlob).mockRejectedValue(new Error("fail"));
    const onExported = vi.fn();

    renderBanner({ onExported });
    fireEvent.click(screen.getByRole("button", { name: "今すぐエクスポート" }));

    expect(
      await screen.findByText("JSONエクスポートに失敗しました"),
    ).toBeInTheDocument();
    expect(onExported).not.toHaveBeenCalled();
  });

  test("「あとで」押下でsnoozeReminderが呼ばれ、onSnoozedが呼ばれる", async () => {
    const onSnoozed = vi.fn();
    renderBanner({ onSnoozed });

    fireEvent.click(screen.getByRole("button", { name: "あとで" }));

    await waitFor(() => {
      expect(snoozeReminder).toHaveBeenCalledWith(expect.any(String));
    });
    await waitFor(() => {
      expect(onSnoozed).toHaveBeenCalledTimes(1);
    });
  });

  test("「あとで」はsnoozeReminderへ7日後の日時を渡す", async () => {
    renderBanner();
    const before = Date.now();

    fireEvent.click(screen.getByRole("button", { name: "あとで" }));

    await waitFor(() => {
      expect(snoozeReminder).toHaveBeenCalled();
    });
    const [untilArg] = vi.mocked(snoozeReminder).mock.calls[0];
    const diffDays =
      (new Date(untilArg).getTime() - before) / (24 * 60 * 60 * 1000);
    expect(diffDays).toBeGreaterThan(6.9);
    expect(diffDays).toBeLessThan(7.1);
  });
});
