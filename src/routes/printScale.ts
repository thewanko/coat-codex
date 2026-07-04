// routes/printScale.ts — 印刷プレビューのモバイル自動スケール算出（技術計画v2.2 §3.3・§4.2 T36）
//
// PrintRecipeSheet(.sheet)は794px固定幅のため、ビューポート幅がそれ未満の画面表示時のみ
// transform: scaleで縮小表示する。倍率算出を純関数として分離し境界値を単体テストする。
// フック本体もこのファイルに置く（PrintViewPage.tsxをコンポーネントのみのexportに保ち、
// react-refresh/only-export-componentsを回避するため）。

import { useEffect, useState } from "react";
import type { RefObject } from "react";

/** 紙面の設計幅（PrintRecipeSheet.module.cssの.sheetと一致させる） */
export const SHEET_WIDTH_PX = 794;

/**
 * 利用可能幅から紙面の縮小倍率を算出する純関数。
 * - 利用可能幅が紙面幅以上なら1（等倍・縮小しない）
 * - 0以下や不正値（NaN等）は1にフォールバック（縮小させない = 安全側）
 */
export function computePrintScale(
  availableWidth: number,
  sheetWidth: number = SHEET_WIDTH_PX,
): number {
  if (!Number.isFinite(availableWidth) || availableWidth <= 0) {
    return 1;
  }
  if (!Number.isFinite(sheetWidth) || sheetWidth <= 0) {
    return 1;
  }
  return Math.min(1, availableWidth / sheetWidth);
}

/**
 * 紙面ラッパー幅からのスケール算出＋リサイズ追従を行うフック。
 * `ready` は紙面ラッパー要素が実際にマウントされたか（=読み込み完了後）を表す。
 * wrapperRefオブジェクト自体は再レンダーで変化しないため、ready切り替わり時に
 * effectを再実行させ、ロード完了後に初めてマウントされたラッパーを計測できるようにする。
 */
export function usePrintScale(
  wrapperRef: RefObject<HTMLDivElement | null>,
  ready: boolean,
): number {
  const [scale, setScale] = useState(1);

  useEffect(() => {
    if (!ready) {
      return;
    }
    const wrapper = wrapperRef.current;
    if (!wrapper) {
      return;
    }

    function recompute() {
      const availableWidth = wrapper?.clientWidth ?? window.innerWidth;
      setScale(computePrintScale(availableWidth));
    }

    recompute();

    if (typeof ResizeObserver !== "undefined") {
      const observer = new ResizeObserver(recompute);
      observer.observe(wrapper);
      return () => observer.disconnect();
    }

    window.addEventListener("resize", recompute);
    return () => window.removeEventListener("resize", recompute);
  }, [wrapperRef, ready]);

  return scale;
}
