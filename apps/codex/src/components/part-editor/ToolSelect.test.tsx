import "../../i18n";
import { afterEach, beforeAll, describe, expect, test, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import i18next from "../../i18n";
import type { RecipeDoc } from "../../models/recipe";
import {
  useRecipeStore,
  __resetRecipeStoreForTest,
} from "../../stores/useRecipeStore";
import ToolSelect from "./ToolSelect";

beforeAll(() => {
  void i18next.changeLanguage("ja");
});

afterEach(() => {
  __resetRecipeStoreForTest();
});

function makeDoc(overrides: Partial<RecipeDoc> = {}): RecipeDoc {
  return {
    schemaVersion: 1,
    id: "rcp_1",
    title: "テストレシピ",
    createdAt: "2026-07-01T00:00:00.000Z",
    updatedAt: "2026-07-01T00:00:00.000Z",
    overviewPhotoIds: [],
    palette: [],
    tools: [],
    baseSteps: [],
    parts: [],
    photoCrops: {},
    ...overrides,
  };
}

describe("ToolSelect", () => {
  test("tools空のときでも追加フォーム（名前入力＋追加ボタン）を直接表示する", () => {
    useRecipeStore.setState({ doc: makeDoc({ tools: [] }) });
    render(<ToolSelect value={[]} onChange={vi.fn()} />);
    expect(
      screen.getByPlaceholderText("ツール名（例: 筆、エアブラシ）"),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "追加" })).toBeInTheDocument();
    expect(
      screen.queryByText("Setup画面でツールを登録すると選択できます"),
    ).not.toBeInTheDocument();
  });

  test("useRecipeStoreのtoolsを候補として表示する", () => {
    useRecipeStore.setState({
      doc: makeDoc({
        tools: [
          { id: "tool_1", name: "丸筆", note: null },
          { id: "tool_2", name: "スポンジ", note: null },
        ],
      }),
    });
    render(<ToolSelect value={[]} onChange={vi.fn()} />);
    expect(screen.getByLabelText("丸筆")).toBeInTheDocument();
    expect(screen.getByLabelText("スポンジ")).toBeInTheDocument();
  });

  test("valueに含まれるtoolIdはチェック済みで表示される", () => {
    useRecipeStore.setState({
      doc: makeDoc({
        tools: [{ id: "tool_1", name: "丸筆", note: null }],
      }),
    });
    render(<ToolSelect value={["tool_1"]} onChange={vi.fn()} />);
    expect(screen.getByLabelText("丸筆")).toBeChecked();
  });

  test("未選択項目をチェックするとvalueへ追加される", () => {
    const onChange = vi.fn();
    useRecipeStore.setState({
      doc: makeDoc({
        tools: [
          { id: "tool_1", name: "丸筆", note: null },
          { id: "tool_2", name: "スポンジ", note: null },
        ],
      }),
    });
    render(<ToolSelect value={["tool_1"]} onChange={onChange} />);
    fireEvent.click(screen.getByLabelText("スポンジ"));
    expect(onChange).toHaveBeenCalledWith(["tool_1", "tool_2"]);
  });

  test("選択済み項目のチェックを外すとvalueから除外される（重複不可の裏返し）", () => {
    const onChange = vi.fn();
    useRecipeStore.setState({
      doc: makeDoc({
        tools: [
          { id: "tool_1", name: "丸筆", note: null },
          { id: "tool_2", name: "スポンジ", note: null },
        ],
      }),
    });
    render(<ToolSelect value={["tool_1", "tool_2"]} onChange={onChange} />);
    fireEvent.click(screen.getByLabelText("丸筆"));
    expect(onChange).toHaveBeenCalledWith(["tool_2"]);
  });

  test("doc未ロード（null）のときはtools0件扱いで追加フォームを直接表示する", () => {
    useRecipeStore.setState({ doc: null });
    render(<ToolSelect value={[]} onChange={vi.fn()} />);
    expect(
      screen.getByPlaceholderText("ツール名（例: 筆、エアブラシ）"),
    ).toBeInTheDocument();
  });

  test("新規名を入力して追加すると、storeのtoolsへ登録されonChangeへ新toolIdが渡される", () => {
    const onChange = vi.fn();
    useRecipeStore.setState({ doc: makeDoc({ tools: [] }) });
    render(<ToolSelect value={[]} onChange={onChange} />);

    fireEvent.change(
      screen.getByPlaceholderText("ツール名（例: 筆、エアブラシ）"),
      {
        target: { value: "刷毛" },
      },
    );
    fireEvent.click(screen.getByRole("button", { name: "追加" }));

    const storeTools = useRecipeStore.getState().doc?.tools ?? [];
    expect(storeTools).toHaveLength(1);
    expect(storeTools[0].name).toBe("刷毛");
    expect(storeTools[0].id).toMatch(/^tool_/);
    expect(onChange).toHaveBeenCalledWith([storeTools[0].id]);
  });

  test("同名（大小文字違い）を入力すると既存ツールIDが再利用され新規登録されない", () => {
    const onChange = vi.fn();
    useRecipeStore.setState({
      doc: makeDoc({
        tools: [{ id: "tool_1", name: "Airbrush", note: null }],
      }),
    });
    render(<ToolSelect value={[]} onChange={onChange} />);

    fireEvent.change(
      screen.getByPlaceholderText("ツール名（例: 筆、エアブラシ）"),
      {
        target: { value: "  airbrush  " },
      },
    );
    fireEvent.click(screen.getByRole("button", { name: "追加" }));

    const storeTools = useRecipeStore.getState().doc?.tools ?? [];
    expect(storeTools).toHaveLength(1);
    expect(onChange).toHaveBeenCalledWith(["tool_1"]);
  });

  test("空入力（トリム後空文字）で追加を押しても何も起きない", () => {
    const onChange = vi.fn();
    useRecipeStore.setState({ doc: makeDoc({ tools: [] }) });
    render(<ToolSelect value={[]} onChange={onChange} />);

    fireEvent.change(
      screen.getByPlaceholderText("ツール名（例: 筆、エアブラシ）"),
      {
        target: { value: "   " },
      },
    );
    fireEvent.click(screen.getByRole("button", { name: "追加" }));

    expect(onChange).not.toHaveBeenCalled();
    expect(useRecipeStore.getState().doc?.tools ?? []).toHaveLength(0);
  });

  test("追加してもbaseSteps/parts等、変更のないdocプロパティの参照は維持される（M4必須事項②）", () => {
    const baseSteps = makeDoc().baseSteps;
    const parts = makeDoc().parts;
    const palette = makeDoc().palette;
    useRecipeStore.setState({
      doc: makeDoc({ tools: [], baseSteps, parts, palette }),
    });
    render(<ToolSelect value={[]} onChange={vi.fn()} />);

    fireEvent.change(
      screen.getByPlaceholderText("ツール名（例: 筆、エアブラシ）"),
      {
        target: { value: "刷毛" },
      },
    );
    fireEvent.click(screen.getByRole("button", { name: "追加" }));

    const nextDoc = useRecipeStore.getState().doc;
    expect(nextDoc?.baseSteps).toBe(baseSteps);
    expect(nextDoc?.parts).toBe(parts);
    expect(nextDoc?.palette).toBe(palette);
  });
});
