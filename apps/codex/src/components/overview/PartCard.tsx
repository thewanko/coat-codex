// components/overview/PartCard.tsx — パーツカード（技術計画v2.2 §3.3・§4.2 T28・デザイン仕様書§8-A）
//
// サムネ規約（v2.2 §8-A）: 「写真がある最後の工程の写真」＝steps配列を末尾から走査し、
// photoId非nullの最初のStepを採用（なければプレースホルダ、Skeleton(photo)は読込中のみ）。
// 混合バッジは「サムネと同一工程」のformatMixBadge出力を表示する。カンプ
// （docs/design/handoff/coat-codex 決定デザイン.dc.html #overview）を突き合わせた根拠:
// パーツI/IIはサムネ工程（最終工程＝写真がある最後の工程）がそのまま混合バッジの工程と
// 一致し、パーツIV（サムネあり・単色工程のためバッジなし=formatMixBadgeがpaints<=1で""を
// 返す仕様と整合）・パーツIII（サムネなし=バッジもなし）も同一工程説で矛盾なく説明できる
// ため、「サムネ工程のformatMixBadge出力」を採用する。
//
// 合計≠100の警告併記（§2.3・D-1）: formatMixBadge自体は比率省略のみで警告は含まないため、
// isMixTotalValidがfalseの対象工程には mix.badgeWarning（新規i18nキー）バッジを追加併記する。
//
// STEP nタグ（§8-A）はサムネ工程のindex（1-based）。タップで/recipe/:id/part/:partIdへ。
//
// v2.3: カードに「工程レビュー」ボタン（partReview.open）を追加。PartReviewDialogを起動する
// onReviewを呼ぶ。カード自体はタップ=編集直行（onOpen）を維持するため、カードのルート要素は
// button同士のネストを避けてdiv role="button"へ変更し、レビューボタンのクリックは
// stopPropagationでカードのonOpenと干渉しないようにする（技術計画v2.3 §3.3 PartCard行）。
//
// 2026-07-03: order propを省略可能にした（BASEカード=RecipeOverviewPage直下の合成part表示で
// 番号セルを出さないため。SortableContext外で使う場合に対応。他の意匠・ロジックは不変）。
//
// 2026-07-04: モバイル幅（<768px）3段組化（ユーザー実機フィードバック対応）。1段目=名前フル幅、
// 2段目=使用カラーの四角スウォッチ横並び（partSwatch.tsのresolveSwatchHexes参照）、3段目=工程数＋
// 工程レビューボタン。混合バッジ・警告バッジはモバイルではCSS非表示（DOM構造は共通のまま）。
// PC幅は現状レイアウトを変更しない。paletteは新規propで受け取る。スウォッチ解決ロジックは
// react-refresh/only-export-components対応のためpartSwatch.tsへ分離（exportSheetDrag.tsに倣う）。

import { useEffect, useState } from "react";
import type { KeyboardEvent, MouseEvent } from "react";
import { useTranslation } from "react-i18next";
import { resolvePhotoUrl } from "../../db/photoStore";
import { CroppedPhoto } from "@coat-codex/recipe-ui";
import Skeleton from "../common/Skeleton";
import {
  formatMixBadge,
  isMixTotalValid,
  type CropRect,
  type RecipeDoc,
  type Step,
} from "@coat-codex/recipe-core";
import { resolveSwatchHexes } from "./partSwatch";
import styles from "./PartCard.module.css";

export type RecipePart = RecipeDoc["parts"][number];

interface PartCardProps {
  part: RecipePart;
  order?: number;
  palette?: RecipeDoc["palette"];
  /** photoId→クロップ矩形（未設定はエントリなし）。RecipeDoc.photoCropsをそのまま渡す */
  photoCrops?: Record<string, CropRect>;
  onOpen: (partId: string) => void;
  onReview: (partId: string) => void;
}

interface ThumbStepInfo {
  step: Step;
  index: number;
}

/** 写真がある最後の工程を返す（§8-A: steps末尾から走査）。なければnull */
function findThumbStep(steps: Step[]): ThumbStepInfo | null {
  for (let i = steps.length - 1; i >= 0; i -= 1) {
    if (steps[i].photoId !== null) {
      return { step: steps[i], index: i };
    }
  }
  return null;
}

function PartCard({
  part,
  order,
  palette = [],
  photoCrops = {},
  onOpen,
  onReview,
}: PartCardProps) {
  const { t } = useTranslation();
  const [photoUrl, setPhotoUrl] = useState<string | null>(null);
  const [photoLoading, setPhotoLoading] = useState(false);

  const thumbInfo = findThumbStep(part.steps);
  const thumbPhotoId = thumbInfo?.step.photoId ?? null;
  const { hexes: swatchHexes, overflowCount: swatchOverflowCount } =
    resolveSwatchHexes(part.steps, palette);

  useEffect(() => {
    if (!thumbPhotoId) {
      setPhotoUrl(null);
      return;
    }
    let cancelled = false;
    setPhotoLoading(true);
    void resolvePhotoUrl(thumbPhotoId)
      .then((resolved) => {
        if (!cancelled) {
          setPhotoUrl(resolved);
        }
      })
      .finally(() => {
        if (!cancelled) {
          setPhotoLoading(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [thumbPhotoId]);

  const badgeText = thumbInfo
    ? formatMixBadge(thumbInfo.step.paints, thumbInfo.step.mix)
    : "";
  const showTotalWarning = thumbInfo
    ? !isMixTotalValid(thumbInfo.step.paints, thumbInfo.step.mix)
    : false;
  const totalPercent = thumbInfo?.step.mix
    ? thumbInfo.step.mix.reduce((sum, value) => sum + value, 0)
    : 0;

  function handleReviewClick(event: MouseEvent<HTMLButtonElement>) {
    event.stopPropagation();
    onReview(part.id);
  }

  function handleKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      onOpen(part.id);
    }
  }

  return (
    <div
      role="button"
      tabIndex={0}
      className={styles.card}
      onClick={() => onOpen(part.id)}
      onKeyDown={handleKeyDown}
      data-testid="part-card"
    >
      {order !== undefined && (
        <span className={styles.order} aria-hidden="true">
          {order}
        </span>
      )}

      {photoLoading ? (
        <Skeleton variant="photo" aria-label={t("photo.uploading")} />
      ) : (
        <span className={styles.thumb}>
          {thumbInfo && (
            <span className={styles.stepTag}>
              {t("photo.stepTag", { n: thumbInfo.index + 1 })}
            </span>
          )}
          {photoUrl ? (
            <CroppedPhoto
              className={styles.thumbImg}
              src={photoUrl}
              crop={thumbPhotoId ? (photoCrops[thumbPhotoId] ?? null) : null}
              alt=""
            />
          ) : (
            <span className={styles.thumbPlaceholder} aria-hidden="true" />
          )}
        </span>
      )}

      <span className={styles.body}>
        <span className={styles.name}>{part.name}</span>
        {swatchHexes.length > 0 && (
          <span className={styles.swatchRow} data-testid="part-swatch-row">
            {swatchHexes.map((hex, index) => (
              <span
                key={`${hex}-${index}`}
                className={styles.swatchChip}
                style={{ backgroundColor: hex }}
                aria-hidden="true"
              />
            ))}
            {swatchOverflowCount > 0 && (
              <span className={styles.swatchOverflow}>
                +{swatchOverflowCount}
              </span>
            )}
          </span>
        )}
        {(badgeText || showTotalWarning) && (
          <span className={styles.badgeRow}>
            {badgeText && <span className={styles.mixBadge}>{badgeText}</span>}
            {showTotalWarning && (
              <span className={styles.mixErrorBadge}>
                {t("mix.badgeWarning", { value: totalPercent })}
              </span>
            )}
          </span>
        )}
        <span className={styles.stepsCount}>
          {t("overview.partStepsCount", { count: part.steps.length })}
        </span>
      </span>

      <button
        type="button"
        className={styles.reviewButton}
        onClick={handleReviewClick}
        data-testid="part-review-open"
      >
        {t("partReview.open")}
      </button>

      <span className={styles.chevron} aria-hidden="true">
        ›
      </span>
    </div>
  );
}

export default PartCard;
