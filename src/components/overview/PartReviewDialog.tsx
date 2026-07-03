// components/overview/PartReviewDialog.tsx — パーツ工程レビュー（読み取り専用）
// （技術計画v2.3 §3.3 PartCard行・§3.4冒頭ブロック・§4.2 T28）
//
// PartCardの「工程レビュー」ボタンから開く読み取り専用ビュー。工程番号・技法名
// （resolveTechniqueLabel）・塗料行（SwatchChip sm＋名前＋formatMixBadgeバッジ）・
// ツール名・メモ・工程写真（resolvePhotoUrl解決。欠損時はプレースホルダ縞）を表示する。
// フッタに「このパーツを編集」（/recipe/:id/part/:partIdへLink）と共有ボタンを置くが、
// 共有結線はM6（T39/T40）で行うためここではdisabled＋title=partReview.shareComingSoonのみ
// （技術計画v2.3 §3.3 PartCard行「v2.3」注記）。
//
// 表示形態: モバイル(<768px)はフルスクリーンシート（下から・全高）、PC(≥768px)は中央モーダル
// （max-width 640px。デザイン仕様書§4「Dialog / Modal」）。Esc・backdropクリック・✕で閉じる。
// role="dialog" aria-modal="true"。Overview直下でレンダリングする前提のためpointer-eventsは
// 明示せず初期値（auto）に任せる（ExportActionBarのボトムシートと同じ注意点だが、fixed親の
// 下に置かれる構成ではないためoverride不要）。
//
// objectURLはこのダイアログのアンマウント時にrevokeしない（photoStore.tsの共有objectURL
// キャッシュ方針に従い、resolvePhotoUrlの解決のみ行う。§2.6）。

import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router";
import { resolvePhotoUrl } from "../../db/photoStore";
import { formatMixBadge, isMixTotalValid } from "../../lib/mixRatio";
import { resolveTechniqueLabel } from "../../lib/techniques";
import SwatchChip from "../common/SwatchChip";
import EmptyState from "../common/EmptyState";
import type { RecipeDoc, Step } from "../../models/recipe";
import styles from "./PartReviewDialog.module.css";

type PaletteColor = RecipeDoc["palette"][number];
type Tool = RecipeDoc["tools"][number];

interface PartReviewDialogProps {
  recipe: RecipeDoc;
  partId: string;
  open: boolean;
  onClose: () => void;
}

interface StepPhotoProps {
  photoId: string | null;
}

function StepPhoto({ photoId }: StepPhotoProps) {
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
        <img className={styles.stepPhotoImg} src={photoUrl} alt="" />
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
}

function StepRow({ step, index, palette, tools }: StepRowProps) {
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
        <StepPhoto photoId={step.photoId} />

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
  const part = recipe.parts.find((p) => p.id === partId) ?? null;

  useEffect(() => {
    if (!open) {
      return;
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        onClose();
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [open, onClose]);

  if (!open || part === null) {
    return null;
  }

  return (
    <div
      className={styles.backdrop}
      onClick={onClose}
      data-testid="part-review-backdrop"
    >
      <div
        className={styles.dialog}
        role="dialog"
        aria-modal="true"
        aria-labelledby="part-review-title"
        onClick={(event) => event.stopPropagation()}
      >
        <div className={styles.header}>
          <h2 id="part-review-title" className={styles.title}>
            {part.name}
          </h2>
          <button
            type="button"
            className={styles.closeButton}
            onClick={onClose}
            aria-label={t("editor.closePanel")}
          >
            ✕
          </button>
        </div>

        <div className={styles.body}>
          {part.steps.length === 0 ? (
            <EmptyState
              variant="steps"
              heading={t("partReview.noSteps")}
              description=""
            />
          ) : (
            <ol className={styles.stepList}>
              {part.steps.map((step, index) => (
                <StepRow
                  key={step.id}
                  step={step}
                  index={index}
                  palette={recipe.palette}
                  tools={recipe.tools}
                />
              ))}
            </ol>
          )}
        </div>

        <div className={styles.footer}>
          <Link
            to={`/recipe/${recipe.id}/part/${part.id}`}
            className={styles.editLink}
          >
            {t("partReview.edit")}
          </Link>
          <button
            type="button"
            className={styles.shareButton}
            disabled
            title={t("partReview.shareComingSoon")}
          >
            {t("partReview.share")}
          </button>
        </div>
      </div>
    </div>
  );
}

export default PartReviewDialog;
