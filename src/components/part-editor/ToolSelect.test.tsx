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
    ...overrides,
  };
}

describe("ToolSelect", () => {
  test("tools空のときeditor.toolEmptyの案内を表示する", () => {
    useRecipeStore.setState({ doc: makeDoc({ tools: [] }) });
    render(<ToolSelect value={[]} onChange={vi.fn()} />);
    expect(
      screen.getByText("Setup画面でツールを登録すると選択できます"),
    ).toBeInTheDocument();
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

  test("doc未ロード（null）のときはtools0件扱いでeditor.toolEmptyを表示する", () => {
    useRecipeStore.setState({ doc: null });
    render(<ToolSelect value={[]} onChange={vi.fn()} />);
    expect(
      screen.getByText("Setup画面でツールを登録すると選択できます"),
    ).toBeInTheDocument();
  });
});
