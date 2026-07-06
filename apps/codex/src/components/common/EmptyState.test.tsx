import { describe, expect, test } from "vitest";
import { render, screen } from "@testing-library/react";
import EmptyState from "./EmptyState";

describe("EmptyState", () => {
  test("renders heading, description and CTA for each variant", () => {
    render(
      <EmptyState
        variant="home"
        heading="最初の秘伝書を作る"
        description="データはこの端末のブラウザにのみ保存されます"
      >
        <button type="button">作成</button>
      </EmptyState>,
    );

    expect(
      screen.getByRole("heading", { name: "最初の秘伝書を作る" }),
    ).toBeInTheDocument();
    expect(
      screen.getByText("データはこの端末のブラウザにのみ保存されます"),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "作成" })).toBeInTheDocument();
  });

  test.each(["home", "parts", "steps"] as const)(
    "renders variant=%s without CTA",
    (variant) => {
      render(
        <EmptyState variant={variant} heading="見出し" description="説明" />,
      );
      expect(
        screen.getByRole("heading", { name: "見出し" }),
      ).toBeInTheDocument();
    },
  );
});
