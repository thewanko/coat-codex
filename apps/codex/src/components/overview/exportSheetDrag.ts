// components/overview/exportSheetDrag.ts — ボトムシートのドラッグ閉じるしきい値判定
//
// ExportActionBar.tsxのExportSheetから利用する純関数。react-refresh/only-export-components
// (コンポーネントファイルは非コンポーネントをexportしない) 対応のため独立ファイルに分離。

const DRAG_CLOSE_PX = 80;
const DRAG_CLOSE_RATIO = 0.3;

// 下方向ドラッグ量dyが80px超、またはシート高sheetHeightの30%超なら閉じる。
// 上方向（dy<=0）は常にfalse。
export function shouldCloseFromDrag(dy: number, sheetHeight: number): boolean {
  if (dy <= 0) {
    return false;
  }
  return dy > DRAG_CLOSE_PX || dy > sheetHeight * DRAG_CLOSE_RATIO;
}
