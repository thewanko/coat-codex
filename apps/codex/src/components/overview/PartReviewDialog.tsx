// components/overview/PartReviewDialog.tsx — パーツ工程レビュー（読み取り専用）
// （技術計画v2.3 §3.3 PartCard行・§3.4冒頭ブロック・§4.2 T28・T40）
//
// PartCardの「工程レビュー」ボタンから開く読み取り専用ビュー。工程番号・技法名
// （resolveTechniqueLabel）・塗料行（SwatchChip sm＋名前＋formatMixBadgeバッジ）・
// ツール名・メモ・工程写真（resolvePhotoUrl解決。欠損時はプレースホルダ縞）を表示する。
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
// キャッシュ方針に従い、resolvePhotoUrlの解決のみ行う。§2.6）。
//
// 2026-07-03: BASEカード（RecipeOverviewPage側の合成part表示）の「工程レビュー」対応として
// partId: string | null を受け付ける（nullがbaseモード）。baseモードはrecipe.baseStepsを
// 表示し、見出しはoverview.baseCardName、編集リンク先は/recipe/:id/part/baseへ固定する。
// §3.4の決定によりベース工程単独のSNS共有は対象外（全体共有でカバー）のため、baseモードでは
// フッタの共有ボタン2つを描画しない（ShareDialogContextにbaseは存在しないため型的にも組めない）。

import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router";
import { resolvePhotoUrl } from "../../db/photoStore";
import CroppedPhoto from "../common/CroppedPhoto";
import SwatchChip from "../common/SwatchChip";
import EmptyState from "../common/EmptyState";
import { useFocusTrap } from "../common/useFocusTrap";
import ShareDialog, { type ShareDialogContext } from "./ShareDialog";
import {
  formatMixBadge,
  isMixTotalValid,
  resolveTechniqueLabel,
  type CropRect,
  type RecipeDoc,
  type Step,
} from "@coat-codex/recipe-core";
import styles from "./PartReviewDialog.module.css";

type PaletteColor = RecipeDoc["palette"][number];
type Tool = RecipeDoc["tools"][number];

interface PartReviewDialogProps {
  recipe: RecipeDoc;
  /** レビュー対象パーツのid。nullの場合はベース工程（recipe.baseSteps）のbaseモード */
  partId: string | null;
  open: boolean;
  onClose: () => void;
}

interface StepPhotoProps {
  photoId: string | null;
  crop: CropRect | null;
}

function StepPhoto({ photoId, crop }: StepPhotoProps) {
  const [photoUrl, setPhotoUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!photoId) {
      setPhotoUrl(null);
      return;
    }
    let cancelled = false;
    void resolvePhotoUrl(photoId).then((url) => {
      if (!cancelled) {
        setPhotoUrl(url);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [photoId]);

  if (!photoId) {
    return null;
  }

  return (
    <span className={styles.stepPhoto}>
      {photoUrl ? (
        <CroppedPhoto
          className={styles.stepPhotoImg}
          src={photoUrl}
          crop={crop}
          alt=""
        />
      ) : (
        <span className={styles.stepPhotoPlaceholder} aria-hidden="true" />
      )}
    </span>
  );
}

interface StepRowProps {
  step: Step;
  index: number;
  palette: PaletteColor[];
  tools: Tool[];
  photoCrops: Record<string, CropRect>;
}

function StepRow({ step, index, palette, tools, photoCrops }: StepRowProps) {
  const { t } = useTranslation();
  const techniqueLabel = resolveTechniqueLabel(step.technique, t);
  const badgeText = formatMixBadge(step.paints, step.mix);
  const showTotalWarning = !isMixTotalValid(step.paints, step.mix);
  const totalPercent = step.mix
    ? step.mix.reduce((sum, value) => sum + value, 0)
    : 0;
  const stepTools = step.toolIds
    .map((toolId) => tools.find((tool) => tool.id === toolId))
    .filter((tool): tool is Tool => tool !== undefined);

  return (
    <li className={styles.stepRow} data-testid="part-review-step">
      <div className={styles.stepHeader}>
        <span className={styles.stepNumber}>{index + 1}</span>
        {techniqueLabel && (
          <span className={styles.techniqueChip}>{techniqueLabel}</span>
        )}
      </div>

      <div className={styles.stepBody}>
        <StepPhoto
          photoId={step.photoId}
          crop={step.photoId ? (photoCrops[step.photoId] ?? null) : null}
        />

        <div className={styles.stepDetails}>
          {step.paints.length > 0 && (
            <div className={styles.paintRow}>
              {step.paints.map((paint) => {
                const color = palette.find((c) => c.id === paint.colorId);
                return (
                  <span key={paint.colorId} className={styles.paintChip}>
                    <SwatchChip
                      variant={color?.chipPhotoId ? "photo" : "hex"}
                      size="sm"
                      hex={color?.hex ?? undefined}
                      photoId={color?.chipPhotoId ?? undefined}
                      name={color?.name}
                    />
                    <span className={styles.paintName}>
                      {color?.name ?? ""}
                    </span>
                  </span>
                );
              })}
              {(badgeText || showTotalWarning) && (
                <span className={styles.badgeRow}>
                  {badgeText && (
                    <span className={styles.mixBadge}>{badgeText}</span>
                  )}
                  {showTotalWarning && (
                    <span className={styles.mixErrorBadge}>
                      {t("mix.badgeWarning", { value: totalPercent })}
                    </span>
                  )}
                </span>
              )}
            </div>
          )}

          {stepTools.length > 0 && (
            <div className={styles.toolRow}>
              {stepTools.map((tool) => (
                <span key={tool.id} className={styles.toolChip}>
                  {tool.name}
                </span>
              ))}
            </div>
          )}

          {step.memo && <p className={styles.memo}>{step.memo}</p>}
        </div>
      </div>
    </li>
  );
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
              <ol className={styles.stepList}>
                {reviewSteps.map((step, index) => (
                  <StepRow
                    key={step.id}
                    step={step}
                    index={index}
                    palette={recipe.palette}
                    tools={recipe.tools}
                    photoCrops={recipe.photoCrops}
                  />
                ))}
              </ol>
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
