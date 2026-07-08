// src/server/moderation/screenImage.test.ts — NSFW スクリーニングフックのテスト（S6 ST-29）

import { describe, expect, it, vi } from "vitest";
import {
  createScreenImage,
  SCREEN_IMAGE_MODEL,
  type AiRunner,
} from "./screenImage";

function makeBytes(): Uint8Array {
  return new Uint8Array([1, 2, 3]);
}

describe("createScreenImage", () => {
  it("UNSAFE 応答なら flag を返す", async () => {
    const run = vi.fn<AiRunner["run"]>().mockResolvedValue({
      response: "UNSAFE",
    });
    const screenImage = createScreenImage({ run });
    const result = await screenImage(makeBytes());
    expect(result.verdict).toBe("flag");
  });

  it("SAFE 応答なら pass を返す", async () => {
    const run = vi.fn<AiRunner["run"]>().mockResolvedValue({
      response: "SAFE",
    });
    const screenImage = createScreenImage({ run });
    const result = await screenImage(makeBytes());
    expect(result.verdict).toBe("pass");
  });

  it("run が reject したら unavailable を返す（fail-open）", async () => {
    const run = vi
      .fn<AiRunner["run"]>()
      .mockRejectedValue(new Error("ai unavailable"));
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    const screenImage = createScreenImage({ run });
    const result = await screenImage(makeBytes());
    expect(result.verdict).toBe("unavailable");
    expect(warnSpy).toHaveBeenCalled();
    warnSpy.mockRestore();
  });

  it("response が非文字列なら unavailable を返す", async () => {
    const run = vi.fn<AiRunner["run"]>().mockResolvedValue({
      response: 123,
    });
    const screenImage = createScreenImage({ run });
    const result = await screenImage(makeBytes());
    expect(result.verdict).toBe("unavailable");
  });

  it("文中に SAFE を含む応答は pass と判定する", async () => {
    const run = vi.fn<AiRunner["run"]>().mockResolvedValue({
      response: "This image is SAFE.",
    });
    const screenImage = createScreenImage({ run });
    const result = await screenImage(makeBytes());
    expect(result.verdict).toBe("pass");
  });

  it("文中に UNSAFE を含む応答は flag と判定する", async () => {
    const run = vi.fn<AiRunner["run"]>().mockResolvedValue({
      response: "UNSAFE content detected",
    });
    const screenImage = createScreenImage({ run });
    const result = await screenImage(makeBytes());
    expect(result.verdict).toBe("flag");
  });

  it("大文字小文字混在でも正しく判定する（UNSAFE優先）", async () => {
    const run = vi.fn<AiRunner["run"]>().mockResolvedValue({
      response: "unsafe",
    });
    const screenImage = createScreenImage({ run });
    const result = await screenImage(makeBytes());
    expect(result.verdict).toBe("flag");
  });

  it("大文字小文字混在の safe 応答は pass と判定する", async () => {
    const run = vi.fn<AiRunner["run"]>().mockResolvedValue({
      response: "safe",
    });
    const screenImage = createScreenImage({ run });
    const result = await screenImage(makeBytes());
    expect(result.verdict).toBe("pass");
  });

  it("SAFE/UNSAFE どちらも含まない応答は unavailable を返す", async () => {
    const run = vi.fn<AiRunner["run"]>().mockResolvedValue({
      response: "I cannot determine.",
    });
    const screenImage = createScreenImage({ run });
    const result = await screenImage(makeBytes());
    expect(result.verdict).toBe("unavailable");
  });

  it("run へ渡す model・input 形を検証する（image配列化・max_tokens）", async () => {
    const run = vi.fn<AiRunner["run"]>().mockResolvedValue({
      response: "SAFE",
    });
    const screenImage = createScreenImage({ run });
    const bytes = new Uint8Array([10, 20, 30]);
    await screenImage(bytes);

    expect(run).toHaveBeenCalledTimes(1);
    const [calledModel, calledInput] = run.mock.calls[0];
    expect(calledModel).toBe(SCREEN_IMAGE_MODEL);
    expect(calledInput.image).toEqual([10, 20, 30]);
    expect(calledInput.max_tokens).toBe(16);
    expect(typeof calledInput.prompt).toBe("string");
  });

  it("カスタム model を渡した場合はそちらを run へ渡す", async () => {
    const run = vi.fn<AiRunner["run"]>().mockResolvedValue({
      response: "SAFE",
    });
    const screenImage = createScreenImage({ run }, "@cf/custom/model");
    await screenImage(makeBytes());

    expect(run.mock.calls[0][0]).toBe("@cf/custom/model");
  });

  it("マクロタスク遅延で解決するスタブでも正しく判定する", async () => {
    const run = vi.fn<AiRunner["run"]>().mockImplementation(
      () =>
        new Promise((resolve) => {
          setTimeout(() => resolve({ response: "UNSAFE" }), 0);
        }),
    );
    const screenImage = createScreenImage({ run });
    const result = await screenImage(makeBytes());
    expect(result.verdict).toBe("flag");
  });
});
