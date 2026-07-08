// components/common/ImportFromScriptoriumDialog.test.tsx — Scriptoriumインポート確認ダイアログ
// （技術計画v1.3 §6-2・§7 ST-23）
//
// useImportDeepLinkのstateをphaseごとに直接渡し、表示切替・画像あり/なし選択の既定値と
// onConfirm引数・重複通知・エラー分岐を検証する。i18n流儀はImportErrorDialog.test.tsx
// （実i18nインスタンス・changeLanguage("ja")）を踏襲する。

import "../../i18n";
import { beforeAll, describe, expect, test, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import i18next from "../../i18n";
import ImportFromScriptoriumDialog from "./ImportFromScriptoriumDialog";
import type { ImportDeepLinkPhase } from "../../lib/useImportDeepLink";
import type { ScriptoriumDetail } from "../../lib/importFromScriptorium";
import type { PublishedRecipe } from "@coat-codex/recipe-core";
import type { RecipeDoc } from "@coat-codex/recipe-core";

beforeAll(() => {
  void i18next.changeLanguage("ja");
});

function makePublishedRecipe(
  overrides: Partial<PublishedRecipe> = {},
): PublishedRecipe {
  return {
    scriptoriumSchemaVersion: 1,
    title: "赤い装甲",
    palette: [],
    tools: [],
    baseSteps: [],
    parts: [],
    ...overrides,
  };
}

function makeDetail(
  overrides: Partial<ScriptoriumDetail> = {},
): ScriptoriumDetail {
  return {
    id: "scr_1",
    handle: "painter_taro",
    publishedAt: "2026-07-01T00:00:00.000Z",
    coverUrl: null,
    recipe: makePublishedRecipe(),
    ...overrides,
  };
}

function makeDuplicate(overrides: Partial<RecipeDoc> = {}): RecipeDoc {
  return {
    schemaVersion: 3,
    id: "rcp_dup",
    title: "既存の複製",
    createdAt: "2026-06-01T00:00:00.000Z",
    updatedAt: "2026-06-15T00:00:00.000Z",
    overviewPhotoIds: [],
    palette: [],
    tools: [],
    baseSteps: [],
    parts: [],
    photoCrops: {},
    source: null,
    ...overrides,
  };
}

function buildReady(args: {
  detail?: ReturnType<typeof makeDetail>;
  cover?: { dataUrl: string; bytes: number } | null;
  duplicate?: RecipeDoc | null;
  phase?: "ready" | "importing";
}): ImportDeepLinkPhase {
  return {
    phase: args.phase ?? "ready",
    scriptoriumId: "scr_1",
    detail: args.detail ?? makeDetail(),
    cover: args.cover ?? null,
    duplicate: args.duplicate ?? null,
  };
}

describe("ImportFromScriptoriumDialog — phase分岐", () => {
  test("idleのとき何も描画しない", () => {
    render(
      <ImportFromScriptoriumDialog
        state={{ phase: "idle" }}
        onConfirm={vi.fn()}
        onDismiss={vi.fn()}
      />,
    );
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  test("loadingでは取得中文言とキャンセルボタンを表示する", () => {
    const onDismiss = vi.fn();
    render(
      <ImportFromScriptoriumDialog
        state={{ phase: "loading" }}
        onConfirm={vi.fn()}
        onDismiss={onDismiss}
      />,
    );

    expect(screen.getByRole("dialog")).toHaveAttribute("aria-modal", "true");
    expect(screen.getByText("レシピ情報を取得しています…")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "キャンセル" }));
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });

  test("invalidUrlでは無効リンク文言と閉じるボタンを表示する", () => {
    const onDismiss = vi.fn();
    render(
      <ImportFromScriptoriumDialog
        state={{ phase: "invalidUrl" }}
        onConfirm={vi.fn()}
        onDismiss={onDismiss}
      />,
    );

    expect(
      screen.getByText("このインポートリンクは無効です"),
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "閉じる" }));
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });

  test.each([
    ["notFound", "レシピが見つかりません。削除済みか非公開の可能性があります"],
    ["network", "レシピを取得できませんでした。通信環境を確認してください"],
    ["invalidData", "レシピデータを読み取れませんでした"],
  ] as const)("fetchError(%s)は対応文言を表示する", (code, message) => {
    render(
      <ImportFromScriptoriumDialog
        state={{ phase: "fetchError", code }}
        onConfirm={vi.fn()}
        onDismiss={vi.fn()}
      />,
    );
    expect(screen.getByText(message)).toBeInTheDocument();
  });
});

describe("ImportFromScriptoriumDialog — ready（cover画像あり）", () => {
  test("タイトル・@handle・radio既定「画像あり」・サイズKB表示・confirmでonConfirm(true)", () => {
    const onConfirm = vi.fn();
    const cover = { dataUrl: "data:image/jpeg;base64,AAA", bytes: 204800 };

    render(
      <ImportFromScriptoriumDialog
        state={buildReady({ cover })}
        onConfirm={onConfirm}
        onDismiss={vi.fn()}
      />,
    );

    expect(screen.getByText("赤い装甲")).toBeInTheDocument();
    expect(screen.getByText("作者: @painter_taro")).toBeInTheDocument();

    const withImageRadio = screen.getByRole("radio", {
      name: /カバー画像あり（200 KB）/,
    });
    const withoutImageRadio = screen.getByRole("radio", { name: "画像なし" });
    expect(withImageRadio).toBeChecked();
    expect(withoutImageRadio).not.toBeChecked();

    fireEvent.click(screen.getByRole("button", { name: "インポート" }));
    expect(onConfirm).toHaveBeenCalledWith(true);
  });

  test("「画像なし」選択後はonConfirm(false)で呼ばれる", () => {
    const onConfirm = vi.fn();
    const cover = { dataUrl: "data:image/jpeg;base64,AAA", bytes: 1024 };

    render(
      <ImportFromScriptoriumDialog
        state={buildReady({ cover })}
        onConfirm={onConfirm}
        onDismiss={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByRole("radio", { name: "画像なし" }));
    fireEvent.click(screen.getByRole("button", { name: "インポート" }));
    expect(onConfirm).toHaveBeenCalledWith(false);
  });
});

describe("ImportFromScriptoriumDialog — ready（cover取得失敗・cover自体なし）", () => {
  test("coverUrlありcover=nullのときはcoverUnavailable注記を表示し、onConfirm(false)で呼ばれる", () => {
    const onConfirm = vi.fn();
    render(
      <ImportFromScriptoriumDialog
        state={buildReady({
          detail: makeDetail({ coverUrl: "/img/cover.jpg" }),
          cover: null,
        })}
        onConfirm={onConfirm}
        onDismiss={vi.fn()}
      />,
    );

    expect(
      screen.getByText(
        "カバー画像を取得できなかったため、画像なしでインポートします",
      ),
    ).toBeInTheDocument();
    expect(screen.queryByRole("radio")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "インポート" }));
    expect(onConfirm).toHaveBeenCalledWith(false);
  });

  test("coverUrl自体がnullのときは選択UIなし・coverUnavailable注記もなし", () => {
    render(
      <ImportFromScriptoriumDialog
        state={buildReady({
          detail: makeDetail({ coverUrl: null }),
          cover: null,
        })}
        onConfirm={vi.fn()}
        onDismiss={vi.fn()}
      />,
    );

    expect(screen.queryByRole("radio")).not.toBeInTheDocument();
    expect(
      screen.queryByText(
        "カバー画像を取得できなかったため、画像なしでインポートします",
      ),
    ).not.toBeInTheDocument();
  });
});

describe("ImportFromScriptoriumDialog — 重複確認", () => {
  test("duplicate非nullのときduplicateNotice（タイトル補間）を表示する", () => {
    render(
      <ImportFromScriptoriumDialog
        state={buildReady({ duplicate: makeDuplicate({ title: "旧レシピ" }) })}
        onConfirm={vi.fn()}
        onDismiss={vi.fn()}
      />,
    );

    expect(
      screen.getByText(
        "「旧レシピ」としてインポート済みです。続行すると新しい複製が作られます",
      ),
    ).toBeInTheDocument();
  });
});

describe("ImportFromScriptoriumDialog — importing", () => {
  test("importing中はキャンセル・インポートボタンがdisabledになる", () => {
    render(
      <ImportFromScriptoriumDialog
        state={buildReady({ phase: "importing" })}
        onConfirm={vi.fn()}
        onDismiss={vi.fn()}
      />,
    );

    expect(screen.getByRole("button", { name: "キャンセル" })).toBeDisabled();
    expect(
      screen.getByRole("button", { name: "インポート中…" }),
    ).toBeDisabled();
  });
});

describe("ImportFromScriptoriumDialog — 生キー露出防止", () => {
  test("importScriptorium.を含む文字列が画面に露出しない", () => {
    const { container } = render(
      <ImportFromScriptoriumDialog
        state={buildReady({
          cover: { dataUrl: "data:image/jpeg;base64,AAA", bytes: 1024 },
          duplicate: makeDuplicate(),
        })}
        onConfirm={vi.fn()}
        onDismiss={vi.fn()}
      />,
    );
    expect(container.textContent).not.toMatch(/importScriptorium\./);
  });
});
