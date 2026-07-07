// components/overview/PartReviewDialog.tsx — パーツ工程レビュー（読み取り専用）
// （技術計画v2.3 §3.3 PartCard行・§3.4冒頭ブロック・§4.2 T28・T40）
//
// PartCardの「工程レビュー」ボタンから開く読み取り専用ビュー。工程本体の表示は
// @coat-codex/recipe-ui の StepListView（工程番号・技法名・塗料行・ツール名・メモ・
// 工程写真〔usePhotoUrl経由。欠損時はプレースホルダ縞〕）に委譲する（ST-11）。
// フッタに「このパーツを編集」（/recipe/:id/part/:partIdへLink）と共有ボタン（「SNSに共有」
// 1ボタン）を置く。押下でShareDialogをmode="part"で開く（X/Bluesky選択はShareDialog内部の
// タブに委ねる。2026-07-04 FB-A: 旧X用・Bluesky用2ボタン構成を統合）。
//
// 表示形態: モバイル(<768px)はフルスクリーンシート（下から・全高）、PC(≥768px)は中央モーダル
// （max-width 640px。デザイン仕様書§4「Dialog / Modal」）。Esc・backdropクリック・✕で閉じる。
// role="dialog" aria-modal="true"。Overview直下でレンダリングする前提のためpointer-eventsは
// 明示せず初期値（auto）に任せる（ExportActionBarのボトムシートと同じ注意点だが、fixed親の
// 下に置かれる構成ではないためoverride不要）。
//
// ShareDialogの重ね表示: PartReviewDialogは開いたまま、その上にShareDialogを重ねて表示する。
// ShareDialog.module.cssはz-index:300、PartReviewDialog.module.cssはz-index:60であり
// （M6のz-index修正により）ShareDialogのz値がPartReviewDialogより高いため最前面に表示される
// （ShareDialog.tsx/module.cssはT39確定物のためスコープ外＝z-index変更不可）。
//
// objectURLはこのダイアログのアンマウント時にrevokeしない（photoStore.tsの共有objectURL
// キャッシュ方針に従い、resolvePhotoUrlの解決のみ行う。§2.6。実際の解決は
// StepListView内のusePhotoUrl→App.tsxのPhotoSourceProviderが注入したresolvePhotoUrl経由）。
//
// 2026-07-03: BASEカード（RecipeOverviewPage側の合成part表示）の「工程レビュー」対応として
// partId: string | null を受け付ける（nullがbaseモード）。baseモードはrecipe.baseStepsを
// 表示し、見出しはoverview.baseCardName、編集リンク先は/recipe/:id/part/baseへ固定する。
// §3.4の決定によりベース工程単独のSNS共有は対象外（全体共有でカバー）のため、baseモードでは
// フッタの共有ボタン2つを描画しない（ShareDialogContextにbaseは存在しないため型的にも組めない）。

import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router";
import { StepListView } from "@coat-codex/recipe-ui";
import EmptyState from "../common/EmptyState";
import { useFocusTrap } from "../common/useFocusTrap";
import ShareDialog, { type ShareDialogContext } from "./ShareDialog";
import type { RecipeDoc } from "@coat-codex/recipe-core";
import styles from "./PartReviewDialog.module.css";

interface PartReviewDialogProps {
  recipe: RecipeDoc;
  /** レビュー対象パーツのid。nullの場合はベース工程（recipe.baseSteps）のbaseモード */
  partId: string | null;
  open: boolean;
  onClose: () => void;
}

function PartReviewDialog({
  recipe,
  partId,
  open,
  onClose,
}: PartReviewDialogProps) {
  const { t } = useTranslation();
  const isBaseMode = partId === null;
  const part = isBaseMode
    ? null
    : (recipe.parts.find((p) => p.id === partId) ?? null);
  const reviewTitle = isBaseMode ? t("overview.baseCardName") : part?.name;
  const reviewSteps = isBaseMode ? recipe.baseSteps : (part?.steps ?? []);
  const editHref = isBaseMode
    ? `/recipe/${recipe.id}/part/base`
    : `/recipe/${recipe.id}/part/${part?.id}`;
  const [shareOpen, setShareOpen] = useState(false);
  const dialogRef = useRef<HTMLDivElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);

  useFocusTrap({
    containerRef: dialogRef,
    open,
    onClose,
    initialFocusRef: closeButtonRef,
  });

  // ダイアログを閉じ直したら共有ダイアログの選択状態もリセットする
  useEffect(() => {
    if (!open) {
      setShareOpen(false);
    }
  }, [open]);

  if (!open || (!isBaseMode && part === null)) {
    return null;
  }

  const shareDialogContext: ShareDialogContext | null =
    !isBaseMode && part !== null && shareOpen
      ? { mode: "part", recipe, partId: part.id }
      : null;

  return (
    <>
      <div
        className={styles.backdrop}
        onClick={onClose}
        data-testid="part-review-backdrop"
      >
        <div
          ref={dialogRef}
          className={styles.dialog}
          role="dialog"
          aria-modal="true"
          aria-labelledby="part-review-title"
          onClick={(event) => event.stopPropagation()}
        >
          <div className={styles.header}>
            <h2 id="part-review-title" className={styles.title}>
              {reviewTitle}
            </h2>
            <button
              ref={closeButtonRef}
              type="button"
              className={styles.closeButton}
              onClick={onClose}
              aria-label={t("editor.closePanel")}
            >
              ✕
            </button>
          </div>

          <div className={styles.body}>
            {reviewSteps.length === 0 ? (
              <EmptyState
                variant="steps"
                heading={t("partReview.noSteps")}
                description=""
              />
            ) : (
              <StepListView
                steps={reviewSteps}
                palette={recipe.palette}
                tools={recipe.tools}
                photoCrops={recipe.photoCrops}
              />
            )}
          </div>

          <div className={styles.footer}>
            <Link to={editHref} className={styles.editLink} onClick={onClose}>
              {t("partReview.edit")}
            </Link>
            {!isBaseMode && (
              <span className={styles.shareButtonGroup}>
                <button
                  type="button"
                  className={styles.shareButton}
                  onClick={() => setShareOpen(true)}
                >
                  {t("partReview.shareSns")}
                </button>
              </span>
            )}
          </div>
        </div>
      </div>

      {shareDialogContext !== null && (
        <ShareDialog
          open
          onClose={() => setShareOpen(false)}
          context={shareDialogContext}
        />
      )}
    </>
  );
}

export default PartReviewDialog;
