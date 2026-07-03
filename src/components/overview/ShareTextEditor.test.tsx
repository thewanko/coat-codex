// components/overview/ShareTextEditor.test.tsx — テキスト編集・カウンタ・トリムボタン
// （技術計画v2.2 §4.2 T39）

import "../../i18n";
import { beforeAll, describe, expect, test, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import i18next from "../../i18n";
import ShareTextEditor from "./ShareTextEditor";
import type { SnsTarget } from "../../lib/sns/types";

beforeAll(() => {
  void i18next.changeLanguage("ja");
});

function makeTarget(overrides: Partial<SnsTarget> = {}): SnsTarget {
  return {
    key: "x",
    label: "X",
    buildIntentUrl: (text) => `https://x.com/intent/post?text=${text}`,
    countText: (text) => ({
      count: text.length,
      limit: 10,
      over: text.length > 10,
    }),
    trimToLimit: (text) => text.slice(0, 10),
    ...overrides,
  };
}

describe("ShareTextEditor", () => {
  test("初期値を表示する", () => {
    const target = makeTarget();
    render(
      <ShareTextEditor target={target} value="hello" onChange={vi.fn()} />,
    );
    expect(screen.getByTestId("share-text-textarea")).toHaveValue("hello");
  });

  test("編集するとonChangeが呼ばれる", () => {
    const target = makeTarget();
    const onChange = vi.fn();
    render(
      <ShareTextEditor target={target} value="hello" onChange={onChange} />,
    );
    fireEvent.change(screen.getByTestId("share-text-textarea"), {
      target: { value: "hello world" },
    });
    expect(onChange).toHaveBeenCalledWith("hello world");
  });

  test("上限内はカウンタのみ表示、警告・トリムボタンは出ない", () => {
    const target = makeTarget();
    render(
      <ShareTextEditor target={target} value="short" onChange={vi.fn()} />,
    );
    expect(screen.getByTestId("share-text-counter")).toHaveTextContent(
      "5 / 10",
    );
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });

  test("上限超過で警告と自動トリムボタンが表示される", () => {
    const target = makeTarget();
    render(
      <ShareTextEditor
        target={target}
        value="this is way too long"
        onChange={vi.fn()}
      />,
    );
    expect(screen.getByRole("status")).toBeInTheDocument();
    expect(screen.getByText("自動トリム")).toBeInTheDocument();
  });

  test("自動トリムボタン押下でtrimToLimit適用済みの値がonChangeへ渡る", () => {
    const target = makeTarget();
    const onChange = vi.fn();
    render(
      <ShareTextEditor
        target={target}
        value="this is way too long"
        onChange={onChange}
      />,
    );
    fireEvent.click(screen.getByText("自動トリム"));
    expect(onChange).toHaveBeenCalledWith("this is wa");
  });
});
