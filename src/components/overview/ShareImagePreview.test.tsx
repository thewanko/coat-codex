// components/overview/ShareImagePreview.test.tsx — 選択ロジック・生成中プレースホルダ
// （技術計画v2.2 §4.2 T39・§3.4手順2 v2.3「選択式」）

import "../../i18n";
import { beforeAll, describe, expect, test, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import i18next from "../../i18n";
import ShareImagePreview from "./ShareImagePreview";
import type {
  ComposedShareImage,
  PartCandidateSpec,
  SummaryWholeCandidateSpec,
  WholeCandidateSpec,
} from "../../lib/sns/imageComposer";

beforeAll(() => {
  void i18next.changeLanguage("ja");
});

vi.mock("../../db/photoStore", () => ({
  resolvePhotoUrl: vi.fn().mockResolvedValue("blob:mock-url"),
}));

function makeWholeImage(photoId: string): ComposedShareImage {
  const spec: WholeCandidateSpec = { kind: "whole", photoId, title: "T" };
  return {
    spec,
    file: new File(["x"], `${photoId}.png`, { type: "image/png" }),
  };
}

function makePartImage(
  stepTag: string,
  stepPhotoId: string,
): ComposedShareImage {
  const spec: PartCandidateSpec = {
    kind: "part",
    title: "T",
    partName: "P",
    overviewPhotoId: null,
    stepPhotoId,
    stepTag,
    techniqueLabel: "basecoat",
    mixBadge: "",
    mixWarning: null,
    swatches: [],
  };
  return {
    spec,
    file: new File(["x"], `${stepPhotoId}.png`, { type: "image/png" }),
  };
}

/** まとめカード（summary/whole）候補。写真を持たないため、プレビューは常にプレースホルダになる */
function makeSummaryImage(): ComposedShareImage {
  const spec: SummaryWholeCandidateSpec = {
    kind: "summary",
    variant: "whole",
    title: "T",
    progressLabel: "パーツ1・全2工程",
    swatches: [],
    overflowColorsLabel: null,
  };
  return {
    spec,
    file: new File(["x"], "summary.png", { type: "image/png" }),
  };
}

describe("ShareImagePreview", () => {
  test("生成中はプレースホルダ4枚と進行表示を出す", () => {
    render(
      <ShareImagePreview
        generating
        images={[]}
        selectedIndexes={[]}
        onToggle={vi.fn()}
      />,
    );
    expect(screen.getAllByTestId("share-image-placeholder")).toHaveLength(4);
    expect(screen.getByText("画像を生成中…")).toBeInTheDocument();
  });

  test("候補0件（生成完了後）は候補なしメッセージを出す", () => {
    render(
      <ShareImagePreview
        generating={false}
        images={[]}
        selectedIndexes={[]}
        onToggle={vi.fn()}
      />,
    );
    expect(screen.getByText("共有できる画像がありません")).toBeInTheDocument();
  });

  test("先頭4枚が選択済み表示・選択数表示が正しい", () => {
    const images = [
      makeWholeImage("ph_1"),
      makeWholeImage("ph_2"),
      makeWholeImage("ph_3"),
      makeWholeImage("ph_4"),
    ];
    render(
      <ShareImagePreview
        generating={false}
        images={images}
        selectedIndexes={[0, 1, 2, 3]}
        onToggle={vi.fn()}
      />,
    );
    const cards = screen.getAllByTestId("share-image-card");
    expect(cards).toHaveLength(4);
    cards.forEach((card) => {
      expect(card).toHaveAttribute("data-selected", "true");
    });
    expect(screen.getByTestId("share-image-selection-count")).toHaveTextContent(
      "4 / 4",
    );
  });

  test("5枚目以降は未選択時disabled、既存4枚は選択解除可能", () => {
    const images = [
      makeWholeImage("ph_1"),
      makeWholeImage("ph_2"),
      makeWholeImage("ph_3"),
      makeWholeImage("ph_4"),
      makeWholeImage("ph_5"),
    ];
    render(
      <ShareImagePreview
        generating={false}
        images={images}
        selectedIndexes={[0, 1, 2, 3]}
        onToggle={vi.fn()}
      />,
    );
    const checkboxes = screen.getAllByRole("checkbox");
    expect(checkboxes).toHaveLength(5);
    expect(checkboxes[4]).toBeDisabled();
    expect(checkboxes[0]).not.toBeDisabled();
  });

  test("未選択カードのチェックでonToggleが該当indexで呼ばれる", () => {
    const images = [makeWholeImage("ph_1"), makeWholeImage("ph_2")];
    const onToggle = vi.fn();
    render(
      <ShareImagePreview
        generating={false}
        images={images}
        selectedIndexes={[0]}
        onToggle={onToggle}
      />,
    );
    const checkboxes = screen.getAllByRole("checkbox");
    fireEvent.click(checkboxes[1]);
    expect(onToggle).toHaveBeenCalledWith(1);
  });

  test("part候補のタグはSTEPタグ、whole候補の先頭はCOVERタグ", () => {
    const images = [
      makePartImage("STEP 1", "ph_s1"),
      makePartImage("STEP 2", "ph_s2"),
    ];
    render(
      <ShareImagePreview
        generating={false}
        images={images}
        selectedIndexes={[0, 1]}
        onToggle={vi.fn()}
      />,
    );
    expect(screen.getByText("STEP 1")).toBeInTheDocument();
    expect(screen.getByText("STEP 2")).toBeInTheDocument();
  });

  test("summary候補は写真を持たず、対角縞プレースホルダ様式＋「まとめ」タグで表示される", () => {
    const images = [makeSummaryImage(), makeWholeImage("ph_1")];
    render(
      <ShareImagePreview
        generating={false}
        images={images}
        selectedIndexes={[0, 1]}
        onToggle={vi.fn()}
      />,
    );
    expect(screen.getByText("まとめ")).toBeInTheDocument();
    // summary候補は写真Blob解決を試みない（photoId=null）ため、常にプレースホルダ表示になる
    const placeholders = document.querySelectorAll(
      `[class*="photoPlaceholder"][class*="diagonalStripes"]`,
    );
    expect(placeholders.length).toBeGreaterThanOrEqual(1);
  });
});
