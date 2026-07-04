// components/common/legacyCopy.test.ts — document.execCommand("copy")旧方式コピー
// （2026-07-04 FB-H）
//
// jsdomはexecCommandを実装していないため、document.execCommandをvi.fnでスタブして
// 呼び出し配線・戻り値の伝播・後始末（一時textareaの追加/削除）を検証する。

import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { copyTextLegacy, copyTextareaLegacy } from "./legacyCopy";

describe("copyTextLegacy", () => {
  let execCommandMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    execCommandMock = vi.fn().mockReturnValue(true);
    document.execCommand =
      execCommandMock as unknown as Document["execCommand"];
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  test("画面外の一時textareaを生成しexecCommand('copy')を呼び、成功時はtrueを返す", () => {
    const result = copyTextLegacy("hello world");

    expect(result).toBe(true);
    expect(execCommandMock).toHaveBeenCalledWith("copy");
  });

  test("一時textareaはコピー処理後にDOMから除去される（後始末）", () => {
    copyTextLegacy("cleanup check");

    expect(document.querySelectorAll("textarea").length).toBe(0);
  });

  test("一時textareaにfont-size 16px以上を設定する（iOSズーム対策）", () => {
    let capturedFontSize = "";
    execCommandMock.mockImplementation(() => {
      const textarea = document.querySelector("textarea");
      capturedFontSize = textarea?.style.fontSize ?? "";
      return true;
    });

    copyTextLegacy("zoom guard");

    expect(capturedFontSize).toBe("16px");
  });

  test("execCommandがfalseを返した場合はfalseを返す", () => {
    execCommandMock.mockReturnValue(false);

    expect(copyTextLegacy("fails")).toBe(false);
  });

  test("execCommandが例外を投げた場合はfalseを返す（textareaの後始末は継続される）", () => {
    execCommandMock.mockImplementation(() => {
      throw new Error("not supported");
    });

    expect(copyTextLegacy("throws")).toBe(false);
    expect(document.querySelectorAll("textarea").length).toBe(0);
  });
});

describe("copyTextareaLegacy", () => {
  let execCommandMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    execCommandMock = vi.fn().mockReturnValue(true);
    document.execCommand =
      execCommandMock as unknown as Document["execCommand"];
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  test("渡されたtextarea要素を全選択しexecCommand('copy')を呼ぶ", () => {
    const textarea = document.createElement("textarea");
    textarea.value = "existing dialog content";
    document.body.appendChild(textarea);
    const setSelectionRangeSpy = vi.spyOn(textarea, "setSelectionRange");

    const result = copyTextareaLegacy(textarea);

    expect(result).toBe(true);
    expect(setSelectionRangeSpy).toHaveBeenCalledWith(
      0,
      "existing dialog content".length,
    );
    expect(execCommandMock).toHaveBeenCalledWith("copy");

    document.body.removeChild(textarea);
  });

  test("既存textareaは呼び出し後もDOMから除去されない（呼び出し元がライフサイクルを持つ）", () => {
    const textarea = document.createElement("textarea");
    textarea.value = "kept";
    document.body.appendChild(textarea);

    copyTextareaLegacy(textarea);

    expect(document.body.contains(textarea)).toBe(true);

    document.body.removeChild(textarea);
  });

  test("execCommandが例外を投げた場合はfalseを返す", () => {
    execCommandMock.mockImplementation(() => {
      throw new Error("not supported");
    });
    const textarea = document.createElement("textarea");
    textarea.value = "boom";
    document.body.appendChild(textarea);

    expect(copyTextareaLegacy(textarea)).toBe(false);

    document.body.removeChild(textarea);
  });
});
