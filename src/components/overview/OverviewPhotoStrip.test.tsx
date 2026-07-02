// components/overview/OverviewPhotoStrip.test.tsx — 2枚目以降サムネ表示条件のテスト
// （技術計画v2.2 §3.3・§4.2 T28）

import "../../i18n";
import { beforeAll, describe, expect, test, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import i18next from "../../i18n";
import OverviewPhotoStrip from "./OverviewPhotoStrip";

beforeAll(() => {
  void i18next.changeLanguage("ja");
});

vi.mock("../../db/photoStore", () => ({
  resolvePhotoUrl: vi.fn().mockResolvedValue("blob:mock-url"),
}));

describe("OverviewPhotoStrip — 表示条件", () => {
  test("写真0枚なら非表示", () => {
    const { container } = render(<OverviewPhotoStrip photoIds={[]} />);
    expect(container).toBeEmptyDOMElement();
  });

  test("写真1枚（代表写真のみ）なら非表示", () => {
    const { container } = render(<OverviewPhotoStrip photoIds={["pht_1"]} />);
    expect(container).toBeEmptyDOMElement();
  });

  test("写真2枚以上なら2枚目以降のみをサムネ表示する", async () => {
    render(<OverviewPhotoStrip photoIds={["pht_1", "pht_2", "pht_3"]} />);

    const strip = await waitFor(() =>
      screen.getByTestId("overview-photo-strip"),
    );
    expect(strip.querySelectorAll("img")).toHaveLength(2);
    expect(screen.getByText("全3枚")).toBeInTheDocument();
  });
});
