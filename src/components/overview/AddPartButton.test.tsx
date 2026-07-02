// components/overview/AddPartButton.test.tsx — スキーマ適合パーツ生成のテスト
// （技術計画v2.2 §4.2 T28・INV-17）

import "../../i18n";
import { beforeAll, describe, expect, test, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import i18next from "../../i18n";
import type { RecipeDoc } from "../../models/recipe";
import AddPartButton from "./AddPartButton";

type RecipePart = RecipeDoc["parts"][number];

beforeAll(() => {
  void i18next.changeLanguage("ja");
});

describe("AddPartButton", () => {
  test("クリックでpartSchemaに適合する新規Partを生成しonAddへ渡す", () => {
    const onAdd = vi.fn();
    render(<AddPartButton onAdd={onAdd} />);

    fireEvent.click(screen.getByRole("button", { name: "＋ パーツを追加" }));

    expect(onAdd).toHaveBeenCalledTimes(1);
    const part = onAdd.mock.calls[0][0] as RecipePart;
    expect(part.id).toMatch(/^part_/);
    expect(part.id).not.toBe("base");
    expect(part.name).toBe("新しいパーツ");
    expect(part.steps).toEqual([]);
  });

  test("クリックのたびに一意なidを採番する", () => {
    const onAdd = vi.fn();
    render(<AddPartButton onAdd={onAdd} />);

    const button = screen.getByRole("button", { name: "＋ パーツを追加" });
    fireEvent.click(button);
    fireEvent.click(button);

    const first = onAdd.mock.calls[0][0] as RecipePart;
    const second = onAdd.mock.calls[1][0] as RecipePart;
    expect(first.id).not.toBe(second.id);
  });
});
