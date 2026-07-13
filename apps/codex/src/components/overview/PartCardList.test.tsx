// components/overview/PartCardList.test.tsx — パーツ並び替え・0件EmptyStateのテスト
// （技術計画v2.2 §3.2(2)・§4.2 T28）
//
// jsdomでは実D&Dは再現しないため（実機検証は出口のスパイクで行う）、上下移動ボタンによる
// onReorderのfrom/to正当性・端ボタンの無効化・0件EmptyState・AddPartButtonでの
// スキーマ適合Part生成に実質的なテストを集中させる。PartCardは重い依存
// （resolvePhotoUrl等）を持つためモックする。

import "../../i18n";
import { beforeAll, describe, expect, test, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import i18next from "../../i18n";
import type { RecipeDoc } from "@coat-codex/recipe-core";
import PartCardList from "./PartCardList";

type RecipePart = RecipeDoc["parts"][number];

beforeAll(() => {
  void i18next.changeLanguage("ja");
});

vi.mock("./PartCard", () => ({
  default: ({ part }: { part: RecipePart }) => (
    <div data-testid={`part-card-stub-${part.id}`}>{part.name}</div>
  ),
}));

function makePart(id: string, name = id): RecipePart {
  return { id, name, steps: [] };
}

function renderList(
  parts: RecipePart[],
  overrides: Partial<{
    onReorder: (next: RecipePart[]) => void;
    onAdd: (part: RecipePart) => void;
    onRequestDelete: (partId: string) => void;
  }> = {},
) {
  const onOpen = vi.fn();
  const onReview = vi.fn();
  const onReorder = vi.fn(overrides.onReorder);
  const onAdd = vi.fn(overrides.onAdd);
  const onRequestDelete = vi.fn(overrides.onRequestDelete);

  render(
    <PartCardList
      parts={parts}
      palette={[]}
      onOpen={onOpen}
      onReview={onReview}
      onReorder={onReorder}
      onAdd={onAdd}
      onRequestDelete={onRequestDelete}
    />,
  );

  return { onOpen, onReview, onReorder, onAdd, onRequestDelete };
}

describe("PartCardList — 上下移動ボタン", () => {
  test("中間のパーツを↓で1つ後ろへ移動する（from/toが正しい）", () => {
    const parts = [makePart("part_a"), makePart("part_b"), makePart("part_c")];
    const { onReorder } = renderList(parts);

    const downButtons = screen.getAllByRole("button", {
      name: "パーツを下へ移動",
    });
    fireEvent.click(downButtons[0]);

    expect(onReorder).toHaveBeenCalledTimes(1);
    expect(onReorder).toHaveBeenCalledWith([parts[1], parts[0], parts[2]]);
  });

  test("中間のパーツを↑で1つ前へ移動する（from/toが正しい）", () => {
    const parts = [makePart("part_a"), makePart("part_b"), makePart("part_c")];
    const { onReorder } = renderList(parts);

    const upButtons = screen.getAllByRole("button", {
      name: "パーツを上へ移動",
    });
    fireEvent.click(upButtons[1]);

    expect(onReorder).toHaveBeenCalledTimes(1);
    expect(onReorder).toHaveBeenCalledWith([parts[1], parts[0], parts[2]]);
  });

  test("先頭の↑ボタンはdisabledで、クリックしてもonReorderは呼ばれない", () => {
    const parts = [makePart("part_a"), makePart("part_b")];
    const { onReorder } = renderList(parts);

    const upButtons = screen.getAllByRole("button", {
      name: "パーツを上へ移動",
    });
    expect(upButtons[0]).toBeDisabled();
    fireEvent.click(upButtons[0]);
    expect(onReorder).not.toHaveBeenCalled();
  });

  test("末尾の↓ボタンはdisabledで、クリックしてもonReorderは呼ばれない", () => {
    const parts = [makePart("part_a"), makePart("part_b")];
    const { onReorder } = renderList(parts);

    const downButtons = screen.getAllByRole("button", {
      name: "パーツを下へ移動",
    });
    expect(downButtons[1]).toBeDisabled();
    fireEvent.click(downButtons[1]);
    expect(onReorder).not.toHaveBeenCalled();
  });
});

describe("PartCardList — 参照同一性（onReorder後の要素参照）", () => {
  test("並び替え後もPart要素自体の参照は保たれる（arrayMoveは要素を再生成しない）", () => {
    const parts = [makePart("part_a"), makePart("part_b")];
    let received: RecipePart[] | null = null;
    renderList(parts, {
      onReorder: (next) => {
        received = next;
      },
    });

    fireEvent.click(
      screen.getAllByRole("button", { name: "パーツを下へ移動" })[0],
    );

    expect(received).not.toBeNull();
    expect((received as unknown as RecipePart[])[0]).toBe(parts[1]);
    expect((received as unknown as RecipePart[])[1]).toBe(parts[0]);
  });
});

describe("PartCardList — 0件時EmptyState", () => {
  test("パーツ0件時はEmptyState(parts)とAddPartButtonのみを表示する", () => {
    renderList([]);

    expect(
      screen.getByRole("heading", { name: "パーツがまだありません" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "＋ パーツを追加" }),
    ).toBeInTheDocument();
    expect(screen.queryByTestId(/part-card-stub/)).not.toBeInTheDocument();
  });

  test("0件時にAddPartButtonを押すとonAddが呼ばれ、スキーマ適合パーツが渡される", () => {
    const { onAdd } = renderList([]);

    fireEvent.click(screen.getByRole("button", { name: "＋ パーツを追加" }));

    expect(onAdd).toHaveBeenCalledTimes(1);
    const added = onAdd.mock.calls[0][0] as RecipePart;
    expect(added.id).toMatch(/^part_/);
    expect(added.id).not.toBe("base");
    expect(added.name).toBe("新しいパーツ");
    expect(added.steps).toEqual([]);
  });
});

describe("PartCardList — AddPartButton（1件以上時）", () => {
  test("末尾に表示され、クリックでonAddが呼ばれる", () => {
    const { onAdd } = renderList([makePart("part_a")]);

    fireEvent.click(screen.getByRole("button", { name: "＋ パーツを追加" }));
    expect(onAdd).toHaveBeenCalledTimes(1);
  });
});

describe("PartCardList — 削除ボタン", () => {
  test("各パーツに削除ボタンが描画され、クリックで対象partIdのonRequestDeleteが呼ばれる", () => {
    const parts = [makePart("part_a", "腕"), makePart("part_b", "胴体")];
    const { onRequestDelete } = renderList(parts);

    const deleteButtons = screen.getAllByRole("button", {
      name: /を削除$/,
    });
    expect(deleteButtons).toHaveLength(2);

    fireEvent.click(screen.getByRole("button", { name: "胴体を削除" }));

    expect(onRequestDelete).toHaveBeenCalledTimes(1);
    expect(onRequestDelete).toHaveBeenCalledWith("part_b");
  });
});
