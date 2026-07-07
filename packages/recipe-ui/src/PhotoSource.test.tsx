import { describe, expect, test, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { useState } from "react";
import { PhotoSourceProvider } from "./PhotoSource";
import { usePhotoUrl, type ResolvePhotoUrl } from "./photoSourceContext";

function Probe({ photoId }: { photoId: string | null | undefined }) {
  const url = usePhotoUrl(photoId);
  return <img alt="probe" src={url ?? undefined} data-url={url ?? "null"} />;
}

describe("PhotoSourceProvider / usePhotoUrl", () => {
  test("Provider経由でURLが解決されimgに反映される", async () => {
    const resolvePhotoUrl: ResolvePhotoUrl = async (photoId) =>
      `blob:${photoId}`;

    render(
      <PhotoSourceProvider resolvePhotoUrl={resolvePhotoUrl}>
        <Probe photoId="ph_1" />
      </PhotoSourceProvider>,
    );

    const img = await screen.findByAltText("probe");
    await waitFor(() => {
      expect(img.getAttribute("src")).toBe("blob:ph_1");
    });
  });

  test("Provider無しの場合は既定値（常にnullを返す関数）が使われnullのまま", async () => {
    render(<Probe photoId="ph_1" />);

    const img = await screen.findByAltText("probe");
    await waitFor(() => {
      expect(img.getAttribute("data-url")).toBe("null");
    });
  });

  test("photoId=nullの場合は解決を行わずnullを返す", async () => {
    const resolvePhotoUrl = vi.fn<ResolvePhotoUrl>(
      async (photoId) => `blob:${photoId}`,
    );

    render(
      <PhotoSourceProvider resolvePhotoUrl={resolvePhotoUrl}>
        <Probe photoId={null} />
      </PhotoSourceProvider>,
    );

    const img = await screen.findByAltText("probe");
    expect(img.getAttribute("data-url")).toBe("null");
    expect(resolvePhotoUrl).not.toHaveBeenCalled();
  });

  test("photoId切替時: 旧解決結果が新表示を上書きしない（cancelled検証）", async () => {
    // ph_slowは解決が遅延、ph_fastは即時解決。
    // ph_slow解決前にph_fastへ切り替えると、後から解決されるph_slowの結果は
    // 表示に反映されてはならない。
    let resolveSlow!: (value: string | null) => void;
    const slowPromise = new Promise<string | null>((resolve) => {
      resolveSlow = resolve;
    });

    const resolvePhotoUrl: ResolvePhotoUrl = async (photoId) => {
      if (photoId === "ph_slow") {
        return slowPromise;
      }
      return `blob:${photoId}`;
    };

    function Switcher() {
      const [photoId, setPhotoId] = useState("ph_slow");
      return (
        <div>
          <button onClick={() => setPhotoId("ph_fast")}>switch</button>
          <Probe photoId={photoId} />
        </div>
      );
    }

    const { getByText } = render(
      <PhotoSourceProvider resolvePhotoUrl={resolvePhotoUrl}>
        <Switcher />
      </PhotoSourceProvider>,
    );

    // ph_slowの解決が完了する前にph_fastへ切り替える
    getByText("switch").click();

    const img = await screen.findByAltText("probe");
    await waitFor(() => {
      expect(img.getAttribute("data-url")).toBe("blob:ph_fast");
    });

    // ph_slowの解決を完了させても、既にcancelledのため表示は上書きされない
    resolveSlow("blob:ph_slow");
    await new Promise((r) => setTimeout(r, 0));
    expect(img.getAttribute("data-url")).toBe("blob:ph_fast");
  });
});
