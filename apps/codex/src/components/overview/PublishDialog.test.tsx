// components/overview/PublishDialog.test.tsx — Scriptorium投稿ダイアログのテスト
// （技術計画v1.3 §6-1・ST-21）
//
// window.turnstileをモックしrenderのcallbackを叩くことでtoken取得を模す
// （TurnstileWidget.test.tsxと同じ方式）。publish/composeCover/getPhotoBlobはdeps注入で
// スタブし、送信フロー・cover合成・エラー写像・入力バリデーション・完了画面のコピー/閉じるを検証する。

import "../../i18n";
import {
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  test,
  vi,
} from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import i18next from "../../i18n";
import ToastHost from "../common/ToastHost";
import PublishDialog, { type PublishDialogDeps } from "./PublishDialog";
import { PublishError } from "../../lib/publishToScriptorium";
import type { RecipeDoc } from "@coat-codex/recipe-core";

beforeAll(() => {
  void i18next.changeLanguage("ja");
});

vi.mock("../../db/photoStore", () => ({
  resolvePhotoUrl: vi.fn().mockResolvedValue("blob:mock-cover-url"),
}));

vi.mock("../../db/db", () => ({
  db: {
    photos: {
      get: vi.fn().mockResolvedValue(null),
    },
  },
}));

interface RenderCallOptions {
  sitekey: string;
  callback: (token: string) => void;
  "error-callback": () => void;
  "expired-callback": () => void;
  "timeout-callback": () => void;
}

function setupTurnstileMock() {
  const renderMock = vi.fn<
    (container: HTMLElement, options: RenderCallOptions) => string
  >(() => "widget-1");
  window.turnstile = {
    render: renderMock,
    remove: vi.fn(),
    reset: vi.fn(),
  };
  return renderMock;
}

/** window.turnstile.renderの最新呼び出しからcallback群を取り出す */
function getLatestTurnstileOptions(): RenderCallOptions {
  const renderMock = vi.mocked(window.turnstile!.render);
  const calls = renderMock.mock.calls;
  const [, options] = calls[calls.length - 1];
  return options;
}

/** テスト用の有効なRecipeDoc（overviewPhotoIdsを1枚含む） */
function makeRecipe(overrides: Partial<RecipeDoc> = {}): RecipeDoc {
  return {
    schemaVersion: 3,
    id: "rcp_1",
    title: "赤い装甲",
    createdAt: "2026-06-01T00:00:00.000Z",
    updatedAt: "2026-06-15T00:00:00.000Z",
    overviewPhotoIds: ["ph_1"],
    palette: [],
    tools: [],
    baseSteps: [],
    parts: [],
    photoCrops: {},
    source: null,
    ...overrides,
  };
}

function renderDialog(
  recipe: RecipeDoc | null,
  deps: PublishDialogDeps,
  onClose: () => void = vi.fn(),
) {
  return render(
    <ToastHost>
      <PublishDialog open recipe={recipe} onClose={onClose} deps={deps} />
    </ToastHost>,
  );
}

/** 有効な入力（handle・PW8文字以上）まで埋め、Turnstile tokenを取得させる */
async function fillValidFormAndGetToken() {
  fireEvent.change(screen.getByLabelText("ハンドル名"), {
    target: { value: "painter_taro" },
  });
  fireEvent.change(screen.getByLabelText("削除用パスワード"), {
    target: { value: "12345678" },
  });

  await waitFor(() => {
    expect(window.turnstile?.render).toHaveBeenCalled();
  });
  const options = getLatestTurnstileOptions();
  options.callback("tok_abc123");
}

afterEach(() => {
  delete (window as { turnstile?: unknown }).turnstile;
  vi.restoreAllMocks();
});

describe("PublishDialog — 送信フロー", () => {
  beforeEach(() => {
    setupTurnstileMock();
  });

  test("有効入力で送信するとdeps.publishが正しい引数で呼ばれ、成功で完了画面が出る", async () => {
    const publish = vi.fn().mockResolvedValue({
      id: "scr_1",
      url: "https://scriptorium.example/r/scr_1",
      status: "published",
    });

    renderDialog(makeRecipe(), { publish, siteKey: "site_abc" });

    await fillValidFormAndGetToken();

    const submitButton = screen.getByRole("button", { name: "公開する" });
    await waitFor(() => expect(submitButton).not.toBeDisabled());
    fireEvent.click(submitButton);

    await waitFor(() => {
      expect(publish).toHaveBeenCalledTimes(1);
    });

    const [input] = publish.mock.calls[0];
    expect(input.handle).toBe("painter_taro");
    expect(input.deletePassword).toBe("12345678");
    expect(input.turnstileToken).toBe("tok_abc123");
    expect(input.lang).toBe("ja");
    expect(input.doc.id).toBe("rcp_1");
    // カバー選択なし（getPhotoBlob未注入のためcomposeCoverは呼ばれない想定の別テストで検証）

    expect(await screen.findByText("公開しました")).toBeInTheDocument();
    expect(
      screen.getByText("https://scriptorium.example/r/scr_1"),
    ).toBeInTheDocument();
    expect(screen.getByText("12345678")).toBeInTheDocument();
    expect(
      screen.getByText(
        "この画面を閉じると再表示できません。必ずコピーして保管してください。",
      ),
    ).toBeInTheDocument();
  });

  test("cover選択あり: getPhotoBlob→composeCoverが呼ばれ、cover/thumbがpublishへ渡る", async () => {
    const sourceBlob = new Blob(["src"], { type: "image/png" });
    const coverBlob = new Blob(["cover"], { type: "image/webp" });
    const thumbBlob = new Blob(["thumb"], { type: "image/webp" });
    const getPhotoBlob = vi.fn().mockResolvedValue(sourceBlob);
    const composeCover = vi
      .fn()
      .mockResolvedValue({ cover: coverBlob, thumb: thumbBlob });
    const publish = vi.fn().mockResolvedValue({
      id: "scr_2",
      url: "https://scriptorium.example/r/scr_2",
      status: "published",
    });

    renderDialog(makeRecipe(), {
      publish,
      getPhotoBlob,
      composeCover,
      siteKey: "site_abc",
    });

    // 既定選択は先頭photoId（ph_1）
    await fillValidFormAndGetToken();
    const submitButton = screen.getByRole("button", { name: "公開する" });
    await waitFor(() => expect(submitButton).not.toBeDisabled());
    fireEvent.click(submitButton);

    await waitFor(() => {
      expect(getPhotoBlob).toHaveBeenCalledWith("ph_1");
    });
    await waitFor(() => {
      expect(composeCover).toHaveBeenCalledWith(sourceBlob, null);
    });
    await waitFor(() => {
      expect(publish).toHaveBeenCalledTimes(1);
    });
    const [input] = publish.mock.calls[0];
    expect(input.cover).toBe(coverBlob);
    expect(input.thumb).toBe(thumbBlob);
  });

  test("「カバーなし」選択時はcover/thumbを指定せずpublishを呼ぶ", async () => {
    const getPhotoBlob = vi.fn();
    const composeCover = vi.fn();
    const publish = vi.fn().mockResolvedValue({
      id: "scr_3",
      url: "https://scriptorium.example/r/scr_3",
      status: "published",
    });

    renderDialog(makeRecipe(), {
      publish,
      getPhotoBlob,
      composeCover,
      siteKey: "site_abc",
    });

    fireEvent.click(screen.getByRole("button", { name: "カバーなし" }));

    await fillValidFormAndGetToken();
    const submitButton = screen.getByRole("button", { name: "公開する" });
    await waitFor(() => expect(submitButton).not.toBeDisabled());
    fireEvent.click(submitButton);

    await waitFor(() => {
      expect(publish).toHaveBeenCalledTimes(1);
    });
    expect(getPhotoBlob).not.toHaveBeenCalled();
    expect(composeCover).not.toHaveBeenCalled();
    const [input] = publish.mock.calls[0];
    expect(input.cover).toBeUndefined();
    expect(input.thumb).toBeUndefined();
  });

  test("publishがPublishError(rateLimit)をthrowすると、対応するエラー文言が表示され完了画面にならない", async () => {
    const publish = vi
      .fn()
      .mockRejectedValue(new PublishError("rateLimit", "too many"));

    renderDialog(makeRecipe(), { publish, siteKey: "site_abc" });

    await fillValidFormAndGetToken();
    const submitButton = screen.getByRole("button", { name: "公開する" });
    await waitFor(() => expect(submitButton).not.toBeDisabled());
    fireEvent.click(submitButton);

    expect(
      await screen.findByText(
        "リクエストが多すぎます。しばらくしてから再度お試しください。",
      ),
    ).toBeInTheDocument();
    expect(screen.queryByText("公開しました")).not.toBeInTheDocument();
  });
});

describe("PublishDialog — 入力バリデーション", () => {
  beforeEach(() => {
    setupTurnstileMock();
  });

  test("handle空・PW7文字は送信ボタンが無効", async () => {
    renderDialog(makeRecipe(), { siteKey: "site_abc" });

    await waitFor(() => {
      expect(window.turnstile?.render).toHaveBeenCalled();
    });
    const options = getLatestTurnstileOptions();
    options.callback("tok_abc123");

    // handleが空のまま
    fireEvent.change(screen.getByLabelText("削除用パスワード"), {
      target: { value: "1234567" },
    });

    expect(screen.getByRole("button", { name: "公開する" })).toBeDisabled();

    fireEvent.change(screen.getByLabelText("ハンドル名"), {
      target: { value: "taro" },
    });
    // PWがまだ7文字
    expect(screen.getByRole("button", { name: "公開する" })).toBeDisabled();
  });

  test("siteKeyが空文字の場合、Turnstile未設定注記が出て送信ボタンは無効", () => {
    renderDialog(makeRecipe(), { siteKey: "" });

    expect(
      screen.getByText("Turnstileが未設定のため、投稿できません。"),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "公開する" })).toBeDisabled();
  });
});

describe("PublishDialog — 完了画面のコピー・閉じる", () => {
  beforeEach(() => {
    setupTurnstileMock();
  });

  test("URL/PWのコピーボタンでnavigator.clipboard.writeTextが呼ばれ、閉じるボタンでonCloseが呼ばれる", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator, { clipboard: { writeText } });

    const publish = vi.fn().mockResolvedValue({
      id: "scr_4",
      url: "https://scriptorium.example/r/scr_4",
      status: "published",
    });
    const onClose = vi.fn();

    renderDialog(makeRecipe(), { publish, siteKey: "site_abc" }, onClose);

    await fillValidFormAndGetToken();
    const submitButton = screen.getByRole("button", { name: "公開する" });
    await waitFor(() => expect(submitButton).not.toBeDisabled());
    fireEvent.click(submitButton);

    await screen.findByText("公開しました");

    const copyButtons = screen.getAllByRole("button", { name: "コピー" });
    fireEvent.click(copyButtons[0]);
    await waitFor(() => {
      expect(writeText).toHaveBeenCalledWith(
        "https://scriptorium.example/r/scr_4",
      );
    });

    // 「閉じる」というaccessible nameは✕ボタン（aria-label="閉じる"）と完了画面の
    // 閉じるボタンの両方に一致するため、完了画面側（末尾）を明示的に選ぶ。
    const closeButtons = screen.getAllByRole("button", { name: "閉じる" });
    fireEvent.click(closeButtons[closeButtons.length - 1]);
    expect(onClose).toHaveBeenCalled();
  });
});
