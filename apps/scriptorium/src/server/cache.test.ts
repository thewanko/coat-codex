// @vitest-environment node
// src/server/cache.test.ts — Cache API ヘルパーの unit test（技術計画v1 §4.5/§4.7）

import { describe, expect, test, vi } from "vitest";
import { matchCache, putCache, type CacheLike } from "./cache";

describe("matchCache/putCache", () => {
  test("caches が存在しない環境（vitest node）では常に undefined・put は何もしない", async () => {
    expect(typeof caches).toBe("undefined");
    const request = new Request("https://example.com/api/recipes");
    const matched = await matchCache(request);
    expect(matched).toBeUndefined();

    const response = new Response("ok");
    await expect(putCache(request, response, 60)).resolves.toBeUndefined();
  });

  test("スタブ caches 注入時は match/put が呼ばれる", async () => {
    const stubCache: CacheLike = {
      match: vi.fn(async () => undefined),
      put: vi.fn(async () => undefined),
    };
    const request = new Request("https://example.com/api/recipes");
    const response = new Response("ok");

    await matchCache(request, stubCache);
    expect(stubCache.match).toHaveBeenCalledWith(request);

    await putCache(request, response, 60, stubCache);
    expect(stubCache.put).toHaveBeenCalledTimes(1);
    const putCall = (stubCache.put as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(putCall[0]).toBe(request);
    const cachedResponse = putCall[1] as Response;
    expect(cachedResponse.headers.get("Cache-Control")).toBe(
      "public, max-age=60, s-maxage=60",
    );
  });
});
