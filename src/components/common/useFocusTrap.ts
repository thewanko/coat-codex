// components/common/useFocusTrap.ts — 全ダイアログ共通フォーカストラップ（T46）
//
// M6レビュー横断指摘: ConfirmDialog／ImportErrorDialog／ExportPhotoChoiceDialog／
// PartReviewDialog／ShareDialogの5ダイアログにフォーカストラップがない。
// 各ダイアログが個別に持っていた「Escapeで閉じる」「開いた時に特定ボタンへ.focus()」
// のuseEffectをこのフックへ統合し、Tab循環・復帰フォーカスを追加する。
//
// - Tab循環: containerRef内のフォーカス可能要素間でTab／Shift+Tabが循環する
//   （最後の要素でTab→先頭へ、先頭の要素でShift+Tab→末尾へ）。disabled・不可視
//   （display:none等でoffsetWidth/Height/getClientRectsが取れない）要素は対象外。
// - Escape close: Escape押下でonCloseを呼ぶ（各ダイアログの既存ハンドラを置き換える）。
// - 初期フォーカス: open時にcontainerRef内へフォーカスを移す。
//   initialFocusRefが指定されていればその要素、なければ先頭のフォーカス可能要素。
// - 復帰フォーカス: 閉じた時（open: true→false）だけでなく、コンポーネントが
//   条件付きマウント（`{open && <Dialog />}`）でアンマウントされた場合も、
//   open前にフォーカスされていた要素へフォーカスを戻す。要素がDOMから消えていれば
//   no-op。
//
// keydownリスナーはwindowに付ける（既存5ダイアログのテストがすべて
// `fireEvent.keyDown(window, { key: "Escape" })`を使う慣行に合わせる）。

import { useEffect } from "react";
import type { RefObject } from "react";

const FOCUSABLE_SELECTOR = [
  "a[href]",
  "button:not([disabled])",
  "input:not([disabled])",
  "select:not([disabled])",
  "textarea:not([disabled])",
  "[tabindex]:not([tabindex='-1'])",
].join(",");

/**
 * 要素が実際にフォーカス可能か（不可視でない）を判定する。
 * jsdomはレイアウトを計算しないため`getClientRects()`は環境に関わらず信頼できない
 * （ExportActionBar.test.tsx等の既存の注記を参照）。そのため、明示的な非表示指定
 * （hidden属性・inline style="display:none"の要素自身または祖先）のみを除外対象とする。
 */
function isVisible(element: HTMLElement): boolean {
  let current: HTMLElement | null = element;
  while (current) {
    if (
      current.hidden ||
      current.style.display === "none" ||
      current.style.visibility === "hidden"
    ) {
      return false;
    }
    current = current.parentElement;
  }
  return true;
}

function getFocusableElements(container: HTMLElement): HTMLElement[] {
  return Array.from(
    container.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR),
  ).filter(isVisible);
}

interface UseFocusTrapOptions {
  /** ダイアログのroot要素（role="dialog"の要素）へのref */
  containerRef: RefObject<HTMLElement | null>;
  open: boolean;
  onClose: () => void;
  /** 初期フォーカス先。未指定時は先頭のフォーカス可能要素 */
  initialFocusRef?: RefObject<HTMLElement | null>;
}

/**
 * ダイアログ共通のフォーカストラップ（Tab循環・Escape close・初期/復帰フォーカス）。
 * containerRef.currentがnullの間（openになった直後、まだDOMにマウントされていない等）は
 * 何もしない。
 */
export function useFocusTrap({
  containerRef,
  open,
  onClose,
  initialFocusRef,
}: UseFocusTrapOptions): void {
  // 復帰フォーカスのcapture/restoreは独立したeffectとし、deps を [open] のみにする。
  // openのeffectのクロージャでcaptureし、そのeffectのcleanupで復帰することで、
  // 「open: true→falseになる」場合と「コンポーネントがアンマウントされる」場合の
  // 両方（PartReviewDialog／ShareDialogのような条件付きマウント`{open && <Dialog />}`を含む）
  // をカバーする。keydown／初期フォーカスのeffect（deps に onClose 等を含み、onClose が
  // 親でインラインarrowのため毎レンダー新identityになりがち）と分離しないと、onClose変化の
  // たびにcaptureが再実行され、ダイアログ内要素を復帰先として誤captureしてしまう。
  useEffect(() => {
    if (!open) {
      return;
    }
    const previouslyFocused =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;
    return () => {
      if (previouslyFocused && document.contains(previouslyFocused)) {
        previouslyFocused.focus();
      }
    };
  }, [open]);

  useEffect(() => {
    if (!open) {
      return;
    }

    // container未接続時（open直後、まだDOMにマウントされていない等）で、かつinitialFocusRefも
    // 未指定の場合はdocument.body全体を探索するフォールバックを行わない。無関係な要素へ
    // フォーカスが飛ぶ副作用を避け、その場合は初期フォーカス移動をスキップする
    // （M8 T46レビューRound1 #7）。
    const container = containerRef.current;
    const target =
      initialFocusRef?.current ??
      (container ? getFocusableElements(container)[0] : undefined);
    target?.focus();

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        onClose();
        return;
      }

      if (event.key !== "Tab") {
        return;
      }

      const currentContainer = containerRef.current;
      if (!currentContainer) {
        return;
      }

      const focusable = getFocusableElements(currentContainer);
      if (focusable.length === 0) {
        return;
      }

      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      const active = document.activeElement;

      if (event.shiftKey) {
        if (active === first || !currentContainer.contains(active)) {
          event.preventDefault();
          last.focus();
        }
      } else {
        if (active === last || !currentContainer.contains(active)) {
          event.preventDefault();
          first.focus();
        }
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [open, onClose, containerRef, initialFocusRef]);
}
