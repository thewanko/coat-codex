// components/overview/OverviewHeader.test.tsx — 代表写真ロード中Skeletonのテスト
// （技術計画v2.2 §4.2 T28・D-5）

import "../../i18n";
import { beforeAll, describe, expect, test, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import i18next from "../../i18n";
import OverviewHeader from "./OverviewHeader";

beforeAll(() => {
  void i18next.changeLanguage("ja");
});

vi.mock("../../db/photoStore", () => ({
  resolvePhotoUrl: vi.fn().mockResolvedValue("blob:mock-url"),
}));

describe("OverviewHeader", () => {
  test("代表写真ロード中はSkeleton(photo)を表示する", () => {
    render(
      <OverviewHeader
        representativePhotoId="pht_1"
        baseSteps={[]}
        onEditBaseSteps={vi.fn()}
      />,
    );

    expect(screen.getByRole("status")).toHaveAttribute("data-variant", "photo");
  });

  test("代表写真解決後は写真とBaseStepOverlayを表示する", async () => {
    render(
      <OverviewHeader
        representativePhotoId="pht_1"
        baseSteps={[]}
        onEditBaseSteps={vi.fn()}
      />,
    );

    await waitFor(() => {
      expect(screen.queryByRole("status")).not.toBeInTheDocument();
    });
    expect(
      screen.getByRole("button", { name: "＋ ベース工程を追加" }),
    ).toBeInTheDocument();
  });

  test("代表写真未設定でもBaseStepOverlayの帯は表示される", () => {
    render(
      <OverviewHeader
        representativePhotoId={null}
        baseSteps={[]}
        onEditBaseSteps={vi.fn()}
      />,
    );

    expect(
      screen.getByRole("button", { name: "＋ ベース工程を追加" }),
    ).toBeInTheDocument();
  });
});
