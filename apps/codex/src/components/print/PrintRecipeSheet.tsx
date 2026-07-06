// components/print/PrintRecipeSheet.tsx — A4印刷紙面（技術計画v2.2 §4.2 T36）
// ビジュアルの正: デザイン仕様書§6・dc.html セクション06 PRINT（行880-1040）
//
// 全工程・スウォッチ・混合バッジ（合計≠100は警告表記を継承 — §2.3）・写真
// （resolvePhotoUrlで解決=V-2）を1枚のA4紙面として描画する。工程行の右には
// 64×48の工程写真セルを常に確保し、写真なし工程は空欄のまま行高を一定に保つ
// （v2.2: デザイン決定稿§8-A）。パーツ節・工程行には break-inside: avoid を適用。

import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { resolvePhotoUrl } from "../../db/photoStore";
import CroppedPhoto from "../common/CroppedPhoto";
import SwatchChip from "../common/SwatchChip";
import {
  formatMixBadge,
  isMixTotalValid,
  resolveTechniqueLabel,
  type CropRect,
  type RecipeDoc,
  type Step,
} from "@coat-codex/recipe-core";
import styles from "./PrintRecipeSheet.module.css";

type PaletteColor = RecipeDoc["palette"][number];
type Tool = RecipeDoc["tools"][number];

interface PrintRecipeSheetProps {
  recipe: RecipeDoc;
}

const ROMAN_NUMERALS = [
  "I",
  "II",
  "III",
  "IV",
  "V",
  "VI",
  "VII",
  "VIII",
  "IX",
  "X",
  "XI",
  "XII",
  "XIII",
  "XIV",
  "XV",
] as const;

/** 1始まりのパーツ順序をローマ数字表記へ（15超は算用数字にフォールバック） */
function toRoman(order: number): string {
  return ROMAN_NUMERALS[order - 1] ?? String(order);
}

function useResolvedPhotoUrl(photoId: string | null): string | null {
  const [url, setUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!photoId) {
      setUrl(null);
      return;
    }
    let cancelled = false;
    void resolvePhotoUrl(photoId).then((resolved) => {
      if (!cancelled) {
        setUrl(resolved);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [photoId]);

  return url;
}

interface CoverPhotoProps {
  photoId: string | null;
  crop: CropRect | null;
}

function CoverPhoto({ photoId, crop }: CoverPhotoProps) {
  const { t } = useTranslation();
  const url = useResolvedPhotoUrl(photoId);

  return (
    <div className={styles.coverBlock}>
      <div className={styles.coverPhoto}>
        {url && (
          <CroppedPhoto
            className={styles.coverPhotoImg}
            src={url}
            crop={crop}
            alt={t("print.coverPhotoAlt")}
          />
        )}
      </div>
      <div className={styles.coverCaption}>{t("print.figCaption")}</div>
    </div>
  );
}

interface StepPhotoCellProps {
  photoId: string | null;
  stepIndex: number;
  crop: CropRect | null;
}

function StepPhotoCell({ photoId, stepIndex, crop }: StepPhotoCellProps) {
  const { t } = useTranslation();
  const url = useResolvedPhotoUrl(photoId);

  if (!photoId) {
    return (
      <span
        className={styles.stepPhotoEmpty}
        data-testid="print-step-photo-empty"
      >
        {t("print.photoNone")}
      </span>
    );
  }

  return (
    <span className={styles.stepPhotoCell} data-testid="print-step-photo">
      {url && (
        <CroppedPhoto
          className={styles.stepPhotoImg}
          src={url}
          crop={crop}
          alt={t("print.stepPhotoAlt", { index: stepIndex })}
        />
      )}
    </span>
  );
}

interface PaintFragmentProps {
  paint: Step["paints"][number];
  palette: PaletteColor[];
  percent: number | null;
  slotLabel?: string;
}

function PaintFragment({
  paint,
  palette,
  percent,
  slotLabel,
}: PaintFragmentProps) {
  const color = palette.find((c) => c.id === paint.colorId);

  return (
    <span className={styles.paintFragment}>
      {slotLabel && <span className={styles.slotLabel}>{slotLabel}</span>}
      <SwatchChip
        variant={color?.chipPhotoId ? "photo" : "hex"}
        size="sm"
        hex={color?.hex ?? undefined}
        photoId={color?.chipPhotoId ?? undefined}
        name={color?.name}
      />
      <span className={styles.paintName}>{color?.name ?? ""}</span>
      <span className={styles.paintMeta}>
        {color?.hex ?? ""}
        {percent !== null ? ` ・ ${percent}%` : ""}
      </span>
    </span>
  );
}

const SLOT_LABELS = ["A", "B", "C", "D", "E"] as const;

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
  const isMixed = step.paints.length >= 2;

  return (
    <li
      className={`${styles.stepRow} print-avoid-break`}
      data-testid="print-step-row"
    >
      <span className={styles.stepNumber}>{index + 1}</span>
      <span className={styles.stepBody}>
        <span className={styles.stepLine}>
          {techniqueLabel && (
            <span className={styles.techniqueName}>{techniqueLabel}</span>
          )}
          {step.paints.map((paint, paintIndex) => (
            <PaintFragment
              key={paint.colorId}
              paint={paint}
              palette={palette}
              percent={step.mix ? (step.mix[paintIndex] ?? null) : null}
              slotLabel={isMixed ? SLOT_LABELS[paintIndex] : undefined}
            />
          ))}
          {badgeText && (
            <span className={`${styles.mixBadge} print-color-exact`}>
              {badgeText}
            </span>
          )}
          {showTotalWarning && (
            <span
              className={`${styles.mixErrorBadge} print-color-exact`}
              data-testid="print-mix-warning"
            >
              {t("mix.badgeWarning", { value: totalPercent })}
            </span>
          )}
          {stepTools.length > 0 && (
            <span className={styles.toolName}>
              {stepTools.map((tool) => tool.name).join(" / ")}
            </span>
          )}
        </span>
        {step.memo && <span className={styles.memo}>{step.memo}</span>}
      </span>
      <StepPhotoCell
        photoId={step.photoId}
        stepIndex={index + 1}
        crop={step.photoId ? (photoCrops[step.photoId] ?? null) : null}
      />
    </li>
  );
}

interface StepListProps {
  steps: Step[];
  palette: PaletteColor[];
  tools: Tool[];
  photoCrops: Record<string, CropRect>;
}

function StepList({ steps, palette, tools, photoCrops }: StepListProps) {
  return (
    <ol className={styles.stepList}>
      {steps.map((step, index) => (
        <StepRow
          key={step.id}
          step={step}
          index={index}
          palette={palette}
          tools={tools}
          photoCrops={photoCrops}
        />
      ))}
    </ol>
  );
}

interface SectionHeadingProps {
  overline: string;
  gloss?: string;
  meta?: string;
}

function SectionHeading({ overline, gloss, meta }: SectionHeadingProps) {
  return (
    <div className={styles.sectionHeading}>
      <span className={styles.sectionOverline}>{overline}</span>
      {gloss && <span className={styles.sectionGloss}>{gloss}</span>}
      {meta && <span className={styles.sectionMeta}>{meta}</span>}
      <span className={styles.sectionRule} aria-hidden="true" />
    </div>
  );
}

function PrintRecipeSheet({ recipe }: PrintRecipeSheetProps) {
  const { t } = useTranslation();
  const totalStepCount =
    recipe.baseSteps.length +
    recipe.parts.reduce((sum, part) => sum + part.steps.length, 0);
  const dateLabel = recipe.updatedAt.slice(0, 10);

  return (
    <div className={styles.sheet} data-testid="print-recipe-sheet">
      <div className={styles.headerRuleTop} aria-hidden="true" />
      <div className={styles.header}>
        <span className={styles.headerBrand}>
          <span
            className={`${styles.monogram} print-color-exact`}
            aria-hidden="true"
          >
            <span className={styles.monogramInner}>cc</span>
          </span>
          <span className={styles.headerBrandText}>{t("print.brandName")}</span>
        </span>
        <span className={styles.headerMeta}>{dateLabel}</span>
      </div>
      <div className={styles.headerRuleBottom} aria-hidden="true" />

      <div className={styles.titleBlock}>
        <h1 className={styles.title}>{recipe.title}</h1>
        <span className={styles.titleMeta}>
          {t("print.totalMeta", {
            steps: totalStepCount,
            parts: recipe.parts.length,
          })}
        </span>
      </div>

      <div className={styles.coverAndPalette}>
        <CoverPhoto
          photoId={recipe.overviewPhotoIds[0] ?? null}
          crop={
            recipe.overviewPhotoIds[0]
              ? (recipe.photoCrops[recipe.overviewPhotoIds[0]] ?? null)
              : null
          }
        />

        <div className={styles.paletteBlock}>
          <SectionHeading
            overline={t("print.paletteHeading")}
            gloss={t("print.paletteHeadingJp")}
          />
          <div className={styles.paletteList}>
            {recipe.palette.map((color) => (
              <div key={color.id} className={styles.paletteRow}>
                <SwatchChip
                  variant={color.chipPhotoId ? "photo" : "hex"}
                  size="sm"
                  hex={color.hex ?? undefined}
                  photoId={color.chipPhotoId ?? undefined}
                />
                <span className={styles.paletteName}>{color.name}</span>
                <span className={styles.paletteBrand}>{color.brand ?? ""}</span>
                <span className={styles.paletteLeader} aria-hidden="true" />
                <span className={styles.paletteHex}>{color.hex ?? ""}</span>
              </div>
            ))}
          </div>
          {recipe.tools.length > 0 && (
            <div className={styles.toolsLine}>
              <span className={styles.toolsHeading}>
                {t("print.toolsHeading")}
              </span>
              {recipe.tools.map((tool) => tool.name).join(" ・ ")}
            </div>
          )}
        </div>
      </div>

      {recipe.baseSteps.length > 0 && (
        <section className={`${styles.partSection} print-avoid-break`}>
          <SectionHeading
            overline={t("print.baseHeading")}
            gloss={t("print.baseHeadingJp")}
          />
          <StepList
            steps={recipe.baseSteps}
            palette={recipe.palette}
            tools={recipe.tools}
            photoCrops={recipe.photoCrops}
          />
        </section>
      )}

      {recipe.parts.map((part, partIndex) => (
        <section
          key={part.id}
          className={`${styles.partSection} print-avoid-break`}
          data-testid="print-part-section"
        >
          <SectionHeading
            overline={t("print.partHeading", {
              roman: toRoman(partIndex + 1),
            })}
            gloss={part.name}
            meta={t("print.stepsMeta", { count: part.steps.length })}
          />
          <StepList
            steps={part.steps}
            palette={recipe.palette}
            tools={recipe.tools}
            photoCrops={recipe.photoCrops}
          />
        </section>
      ))}

      <div className={styles.footer}>
        <div className={styles.footerRule} aria-hidden="true" />
        <span className={styles.footerText}>
          {t("print.footerLine", { title: recipe.title })}
        </span>
      </div>
    </div>
  );
}

export default PrintRecipeSheet;
