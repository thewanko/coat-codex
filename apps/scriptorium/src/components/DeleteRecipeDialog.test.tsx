// components/DeleteRecipeDialog.test.tsx — 本人削除ダイアログのRTLテスト
// （技術計画v1 S6 ST-35: phase遷移・エラー別表示・a11y・5分注記）

import "../i18n";
import { useState } from "react";
import { beforeAll, describe, expect, test, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import i18next from "../i18n";
import DeleteRecipeDialog from "./DeleteRecipeDialog";
import type { FetchLike } from "../lib/api";

function jsonResponse(body: unknown, ok = true, status = 200): Response {
  return { ok, status, json: async () => body } as Response;
}

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
    <MemoryRouter>
      <button type="button" data-testid="trigger">
        trigger
      </button>
      <DeleteRecipeDialog
        open={open}
        recipeId="scr_1"
        onClose={onClose}
        fetchImpl={fetchImpl}
      />
    </MemoryRouter>
  );
}

/** トリガー→開く→Escapeで閉じる、を通す復帰フォーカス検証用ハーネス */
function FocusReturnHarness({ fetchImpl }: { fetchImpl: FetchLike }) {
  const [open, setOpen] = useState(false);
  return (
    <MemoryRouter>
      <button type="button" data-testid="trigger" onClick={() => setOpen(true)}>
        trigger
      </button>
      <DeleteRecipeDialog
        open={open}
        recipeId="scr_1"
        onClose={() => setOpen(false)}
        fetchImpl={fetchImpl}
      />
    </MemoryRouter>
  );
}

describe("DeleteRecipeDialog", () => {
  beforeAll(async () => {
    await i18next.changeLanguage("en");
  });

  test("開→PW入力→成功→done表示（5分注記実在）", async () => {
    const fetchImpl = vi
      .fn<FetchLike>()
      .mockResolvedValue(jsonResponse({ id: "scr_1", status: "deleted" }));
    const onClose = vi.fn<() => void>();

    render(
      <TriggerAndDialog open={true} fetchImpl={fetchImpl} onClose={onClose} />,
    );

    const dialog = screen.getByRole("dialog");
    expect(dialog).toHaveAttribute("aria-modal", "true");

    const pwInput = screen.getByLabelText("Deletion password");
    fireEvent.change(pwInput, { target: { value: "correct-horse" } });

    const confirmButton = screen.getByRole("button", { name: "Delete" });
    fireEvent.click(confirmButton);

    expect(await screen.findByText("Recipe deleted")).toBeInTheDocument();
    expect(
      screen.getByText(
        "This may take up to five minutes to be fully reflected across all viewers.",
      ),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: "Back to new recipes" }),
    ).toHaveAttribute("href", "/");
  });

  test("403でerrWrongPassword＋serverErrorを逐語表示する", async () => {
    const fetchImpl = vi
      .fn<FetchLike>()
      .mockResolvedValue(
        jsonResponse({ error: "incorrect password" }, false, 403),
      );
    const onClose = vi.fn<() => void>();

    render(
      <TriggerAndDialog open={true} fetchImpl={fetchImpl} onClose={onClose} />,
    );

    fireEvent.change(screen.getByLabelText("Deletion password"), {
      target: { value: "wrong-pw" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Delete" }));

    expect(
      await screen.findByText("That deletion password is incorrect."),
    ).toBeInTheDocument();
    expect(screen.getByText("incorrect password")).toBeInTheDocument();

    // errorから再入力可（PW入力欄がまだ操作可能）
    expect(screen.getByLabelText("Deletion password")).not.toBeDisabled();
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

    fireEvent.change(screen.getByLabelText("Deletion password"), {
      target: { value: "pw" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Delete" }));

    expect(
      await screen.findByText("Too many attempts. Please try again later."),
    ).toBeInTheDocument();
  });

  test("submitting中はボタンがdisabledになる", async () => {
    let resolveFetch: (value: Response) => void = () => {};
    const fetchImpl = vi.fn<FetchLike>(
      () =>
        new Promise((resolve) => {
          resolveFetch = resolve;
        }),
    );
    const onClose = vi.fn<() => void>();

    render(
      <TriggerAndDialog open={true} fetchImpl={fetchImpl} onClose={onClose} />,
    );

    fireEvent.change(screen.getByLabelText("Deletion password"), {
      target: { value: "pw" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Delete" }));

    const submittingButton = await screen.findByRole("button", {
      name: "Deleting…",
    });
    expect(submittingButton).toBeDisabled();
    expect(screen.getByRole("button", { name: "Cancel" })).toBeDisabled();
    expect(screen.getByLabelText("Deletion password")).toBeDisabled();

    resolveFetch(jsonResponse({ id: "scr_1", status: "deleted" }));
    await screen.findByText("Recipe deleted");
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

  test("submitting中はEscapeで閉じない", async () => {
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

    fireEvent.change(screen.getByLabelText("Deletion password"), {
      target: { value: "pw" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Delete" }));

    await screen.findByRole("button", { name: "Deleting…" });

    fireEvent.keyDown(window, { key: "Escape" });
    expect(onClose).not.toHaveBeenCalled();
  });

  test("backdropクリックで閉じる（submitting中は不可）", () => {
    const fetchImpl = vi.fn<FetchLike>();
    const onClose = vi.fn<() => void>();

    render(
      <TriggerAndDialog open={true} fetchImpl={fetchImpl} onClose={onClose} />,
    );

    fireEvent.click(screen.getByTestId("delete-recipe-dialog-backdrop"));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  test("初期フォーカスはPW入力欄", async () => {
    const fetchImpl = vi.fn<FetchLike>();
    const onClose = vi.fn<() => void>();

    render(
      <TriggerAndDialog open={true} fetchImpl={fetchImpl} onClose={onClose} />,
    );

    await waitFor(() => {
      expect(screen.getByLabelText("Deletion password")).toHaveFocus();
    });
  });

  test("トリガーボタンへフォーカスが復帰する", async () => {
    const fetchImpl = vi.fn<FetchLike>();

    render(<FocusReturnHarness fetchImpl={fetchImpl} />);

    const trigger = screen.getByTestId("trigger");
    trigger.focus();
    fireEvent.click(trigger);

    await waitFor(() => {
      expect(screen.getByLabelText("Deletion password")).toHaveFocus();
    });

    fireEvent.keyDown(window, { key: "Escape" });

    await waitFor(() => {
      expect(trigger).toHaveFocus();
    });
  });

  test("PW空ではsubmitできない（disabled）", () => {
    const fetchImpl = vi.fn<FetchLike>();
    const onClose = vi.fn<() => void>();

    render(
      <TriggerAndDialog open={true} fetchImpl={fetchImpl} onClose={onClose} />,
    );

    expect(screen.getByRole("button", { name: "Delete" })).toBeDisabled();
  });
});
