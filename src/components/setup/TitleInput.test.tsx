// components/setup/TitleInput.test.tsx — TitleInputのテスト（技術計画v2.2 §4.2 T23・D-8）
//
// D-8「入力欄は編集中は空のまま維持し、blur時にtrim後空なら補完後の既定名を表示する」を
// 検証する。stateのtitle（onCommit経由で渡す値）自体は空文字のまま渡ることを確認する
// （既定名への置換は保存直前のuseRecipeStore側の責務であり、TitleInputは行わない）。

import "../../i18n";
import { beforeAll, describe, expect, test, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import i18next from "../../i18n";
import TitleInput from "./TitleInput";

beforeAll(() => {
  void i18next.changeLanguage("ja");
});

describe("TitleInput", () => {
  test("空のまま確定するとonCommitへ空文字を渡し、表示は既定名にフォールバックする", () => {
    const onCommit = vi.fn();
    render(<TitleInput value="" onCommit={onCommit} />);

    const input = screen.getByLabelText("タイトル") as HTMLInputElement;
    fireEvent.focus(input);
    expect(input.value).toBe("");

    fireEvent.blur(input);

    expect(input.value).toBe("無題のレシピ");
    // 空のまま確定した場合はonCommitを呼ばない（valueと変わっていないため）。
    expect(onCommit).not.toHaveBeenCalled();
  });

  test("入力してblurするとonCommitへユーザー入力そのまま（trimなし）を渡す", () => {
    const onCommit = vi.fn();
    render(<TitleInput value="" onCommit={onCommit} />);

    const input = screen.getByLabelText("タイトル") as HTMLInputElement;
    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: "銀の甲冑" } });
    fireEvent.blur(input);

    expect(onCommit).toHaveBeenCalledWith("銀の甲冑");
    expect(input.value).toBe("銀の甲冑");
  });

  test("フォーカス中は既定名フォールバックを表示せず生の空文字を保つ", () => {
    render(<TitleInput value="" onCommit={vi.fn()} />);

    const input = screen.getByLabelText("タイトル") as HTMLInputElement;
    // マウント直後（blur前）は既定名で表示される（value=""がそのまま渡っているため）。
    expect(input.value).toBe("無題のレシピ");

    fireEvent.focus(input);
    expect(input.value).toBe("");
  });

  test("既に既定名でない値がロードされている場合はそのまま表示する", () => {
    render(<TitleInput value="銀の甲冑" onCommit={vi.fn()} />);
    const input = screen.getByLabelText("タイトル") as HTMLInputElement;
    expect(input.value).toBe("銀の甲冑");
  });
});
