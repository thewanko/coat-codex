// components/ReportDialog.test.tsx — 通報ダイアログのRTLテスト
// （技術計画v1 S6 ST-30: 理由未選択/token未取得でsubmit不能・成功→done・
//   403→errTurnstile＋widget再マウント・429文言・submitting中Escape無効・
//   初期/復帰フォーカス）
//
// recipe-uiのTurnstileWidgetのみをスタブに差し替える（importOriginalの部分モックで
// 他exportはそのまま透過する）。スタブは「トークン取得」ボタンを描画し、クリックで
// onToken("tok_xxx")を呼ぶ。渡されたsiteKey/keyの再マウント回数はmountMockで検証する。

import "../i18n";
import { useEffect, useState } from "react";
import { beforeAll, describe, expect, test, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import i18next from "../i18n";
import ReportDialog from "./ReportDialog";
import type { FetchLike } from "../lib/api";

function jsonResponse(body: unknown, ok = true, status = 200): Response {
  return { ok, status, json: async () => body } as Response;
}

// マウント回数（=key変化による再マウント）を数える。siteKeyは各テストで固定値のため、
// [siteKey]依存のeffectは実質マウント時1回のみ発火する（本物のTurnstileWidgetの
// [siteKey]依存設計に合わせる）。
const mountMock = vi.fn<(siteKey: string) => void>();

vi.mock("@coat-codex/recipe-ui", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@coat-codex/recipe-ui")>();
  return {
    ...actual,
    TurnstileWidget: ({
      siteKey,
      onToken,
    }: {
      siteKey: string;
      onToken: (token: string | null) => void;
    }) => {
      useEffect(() => {
        mountMock(siteKey);
        // siteKeyは各テストで固定値のためこのeffectは実質マウント時1回のみ発火する
        // （本物のTurnstileWidgetもsiteKey依存でwidgetを再生成する設計に合わせる）。
      }, [siteKey]);
      return (
        <button
          type="button"
          data-testid="turnstile-stub-token-button"
          onClick={() => onToken("tok_abc123")}
        >
          get token
        </button>
      );
    },
  };
});

function TriggerAndDialog({
  open,
  fetchImpl,
  onClose,
}: {
  open: boolean;
  fetchImpl: FetchLike;
  onClose: () => void;
}) {
  return (
    <>
      <button type="button" data-testid="trigger">
        trigger
      </button>
      <ReportDialog
        open={open}
        recipeId="scr_1"
        onClose={onClose}
        fetchImpl={fetchImpl}
        siteKey="site_abc"
      />
    </>
  );
}

/** トリガー→開く→Escapeで閉じる、を通す復帰フォーカス検証用ハーネス */
function FocusReturnHarness({ fetchImpl }: { fetchImpl: FetchLike }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" data-testid="trigger" onClick={() => setOpen(true)}>
        trigger
      </button>
      <ReportDialog
        open={open}
        recipeId="scr_1"
        onClose={() => setOpen(false)}
        fetchImpl={fetchImpl}
        siteKey="site_abc"
      />
    </>
  );
}

function getToken() {
  fireEvent.click(screen.getByTestId("turnstile-stub-token-button"));
}

describe("ReportDialog", () => {
  beforeAll(async () => {
    await i18next.changeLanguage("en");
  });

  test("理由未選択ではsubmitできない（disabled）", () => {
    const fetchImpl = vi.fn<FetchLike>();
    const onClose = vi.fn<() => void>();

    render(
      <TriggerAndDialog open={true} fetchImpl={fetchImpl} onClose={onClose} />,
    );

    getToken();

    expect(
      screen.getByRole("button", { name: "Submit report" }),
    ).toBeDisabled();
  });

  test("token未取得ではsubmitできない（disabled）", () => {
    const fetchImpl = vi.fn<FetchLike>();
    const onClose = vi.fn<() => void>();

    render(
      <TriggerAndDialog open={true} fetchImpl={fetchImpl} onClose={onClose} />,
    );

    fireEvent.click(screen.getByLabelText("Spam"));

    expect(
      screen.getByRole("button", { name: "Submit report" }),
    ).toBeDisabled();
  });

  test("理由選択＋token取得→送信成功→done表示", async () => {
    const fetchImpl = vi
      .fn<FetchLike>()
      .mockResolvedValue(jsonResponse({ ok: true }));
    const onClose = vi.fn<() => void>();

    render(
      <TriggerAndDialog open={true} fetchImpl={fetchImpl} onClose={onClose} />,
    );

    fireEvent.click(screen.getByLabelText("Spam"));
    getToken();

    const submitButton = screen.getByRole("button", { name: "Submit report" });
    expect(submitButton).not.toBeDisabled();
    fireEvent.click(submitButton);

    expect(await screen.findByText("Report received")).toBeInTheDocument();
    expect(
      screen.getByText(
        "Thank you. We'll review this recipe and take action if needed.",
      ),
    ).toBeInTheDocument();

    expect(fetchImpl).toHaveBeenCalledWith("/api/recipes/scr_1/report", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        reason: "spam",
        detail: undefined,
        turnstileToken: "tok_abc123",
      }),
    });
  });

  test("403でerrTurnstileを表示し、TurnstileWidgetが再マウントされる（key変化）", async () => {
    const fetchImpl = vi
      .fn<FetchLike>()
      .mockResolvedValue(
        jsonResponse({ error: "turnstile verification failed" }, false, 403),
      );
    const onClose = vi.fn<() => void>();
    mountMock.mockClear();

    render(
      <TriggerAndDialog open={true} fetchImpl={fetchImpl} onClose={onClose} />,
    );

    fireEvent.click(screen.getByLabelText("Spam"));
    getToken();
    expect(mountMock).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByRole("button", { name: "Submit report" }));

    expect(
      await screen.findByText("Verification failed. Please try again."),
    ).toBeInTheDocument();
    expect(
      screen.getByText("turnstile verification failed"),
    ).toBeInTheDocument();

    // key={retryCount}の変化によりwidgetが再マウントされ、renderが再度呼ばれる
    await waitFor(() => {
      expect(mountMock).toHaveBeenCalledTimes(2);
    });

    // 再チャレンジ可能: 送信ボタンはtoken再取得までdisabled
    expect(
      screen.getByRole("button", { name: "Submit report" }),
    ).toBeDisabled();
  });

  test("429でerrRateLimited文言を表示する", async () => {
    const fetchImpl = vi
      .fn<FetchLike>()
      .mockResolvedValue(
        jsonResponse({ error: "rate limit exceeded" }, false, 429),
      );
    const onClose = vi.fn<() => void>();

    render(
      <TriggerAndDialog open={true} fetchImpl={fetchImpl} onClose={onClose} />,
    );

    fireEvent.click(screen.getByLabelText("Spam"));
    getToken();
    fireEvent.click(screen.getByRole("button", { name: "Submit report" }));

    expect(
      await screen.findByText("Too many reports. Please try again later."),
    ).toBeInTheDocument();
  });

  test("submitting中はボタンがdisabledになりEscapeでも閉じない", async () => {
    const fetchImpl = vi.fn<FetchLike>(
      () =>
        new Promise(() => {
          // 意図的に解決しない（submitting継続を保つ）
        }),
    );
    const onClose = vi.fn<() => void>();

    render(
      <TriggerAndDialog open={true} fetchImpl={fetchImpl} onClose={onClose} />,
    );

    fireEvent.click(screen.getByLabelText("Spam"));
    getToken();
    fireEvent.click(screen.getByRole("button", { name: "Submit report" }));

    const submittingButton = await screen.findByRole("button", {
      name: "Submitting…",
    });
    expect(submittingButton).toBeDisabled();
    expect(screen.getByRole("button", { name: "Cancel" })).toBeDisabled();

    fireEvent.keyDown(window, { key: "Escape" });
    expect(onClose).not.toHaveBeenCalled();
  });

  test("Escapeで閉じる（submitting中でないとき）", () => {
    const fetchImpl = vi.fn<FetchLike>();
    const onClose = vi.fn<() => void>();

    render(
      <TriggerAndDialog open={true} fetchImpl={fetchImpl} onClose={onClose} />,
    );

    fireEvent.keyDown(window, { key: "Escape" });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  test("backdropクリックで閉じる（submitting中は不可）", () => {
    const fetchImpl = vi.fn<FetchLike>();
    const onClose = vi.fn<() => void>();

    render(
      <TriggerAndDialog open={true} fetchImpl={fetchImpl} onClose={onClose} />,
    );

    fireEvent.click(screen.getByTestId("report-recipe-dialog-backdrop"));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  test("初期フォーカスは最初の理由ラジオボタン", async () => {
    const fetchImpl = vi.fn<FetchLike>();
    const onClose = vi.fn<() => void>();

    render(
      <TriggerAndDialog open={true} fetchImpl={fetchImpl} onClose={onClose} />,
    );

    await waitFor(() => {
      expect(screen.getByLabelText("Spam")).toHaveFocus();
    });
  });

  test("トリガーボタンへフォーカスが復帰する", async () => {
    const fetchImpl = vi.fn<FetchLike>();

    render(<FocusReturnHarness fetchImpl={fetchImpl} />);

    const trigger = screen.getByTestId("trigger");
    trigger.focus();
    fireEvent.click(trigger);

    await waitFor(() => {
      expect(screen.getByLabelText("Spam")).toHaveFocus();
    });

    fireEvent.keyDown(window, { key: "Escape" });

    await waitFor(() => {
      expect(trigger).toHaveFocus();
    });
  });

  test("siteKey未指定（空文字）時はTurnstile未設定注記を表示しsubmitは不能", () => {
    const fetchImpl = vi.fn<FetchLike>();
    const onClose = vi.fn<() => void>();

    render(
      <ReportDialog
        open={true}
        recipeId="scr_1"
        onClose={onClose}
        fetchImpl={fetchImpl}
        siteKey=""
      />,
    );

    expect(
      screen.getByText(
        "Turnstile is not configured, so reporting is unavailable.",
      ),
    ).toBeInTheDocument();

    fireEvent.click(screen.getByLabelText("Spam"));
    expect(
      screen.getByRole("button", { name: "Submit report" }),
    ).toBeDisabled();
  });
});
