// packages/recipe-ui/src/StepListView.tsx — 読み取り専用工程リスト
// （coat-scriptorium 技術計画v1 §5.2。PartReviewDialog.tsxのStepPhoto/StepRow/
// <ol className={styles.stepList}> を抽出。工程番号・技法名（TechniqueChip）・
// 塗料行（SwatchChip sm＋名前＋MixBadge）・ツール名・メモ・工程写真
// （usePhotoUrl経由。resolvePhotoUrl直呼びはしない）を表示する）

import {
  formatMixBadge,
  isMixTotalValid,
  type CropRect,
  type RecipeDoc,
  type Step,
} from "@coat-codex/recipe-core";
import { usePhotoUrl } from "./photoSourceContext";
import CroppedPhoto from "./CroppedPhoto";
import SwatchChip from "./SwatchChip";
import MixBadge from "./MixBadge";
import TechniqueChip from "./TechniqueChip";
import styles from "./StepListView.module.css";

type PaletteColor = RecipeDoc["palette"][number];
type Tool = RecipeDoc["tools"][number];

interface StepListViewProps {
  steps: Step[];
  palette: RecipeDoc["palette"];
  tools: RecipeDoc["tools"];
  photoCrops: Record<string, CropRect>;
  className?: string;
}

interface StepPhotoProps {
  photoId: string | null;
  crop: CropRect | null;
}

function StepPhoto({ photoId, crop }: StepPhotoProps) {
  const photoUrl = usePhotoUrl(photoId);

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
  const badgeText = formatMixBadge(step.paints, step.mix);
  const showTotalWarning = !isMixTotalValid(step.paints, step.mix);
  const stepTools = step.toolIds
    .map((toolId) => tools.find((tool) => tool.id === toolId))
    .filter((tool): tool is Tool => tool !== undefined);

  return (
    <li className={styles.stepRow} data-testid="step-list-row">
      <div className={styles.stepHeader}>
        <span className={styles.stepNumber}>{index + 1}</span>
        <TechniqueChip technique={step.technique} />
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
                  <MixBadge paints={step.paints} mix={step.mix} />
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

function StepListView({
  steps,
  palette,
  tools,
  photoCrops,
  className,
}: StepListViewProps) {
  return (
    <ol className={[styles.stepList, className].filter(Boolean).join(" ")}>
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

export default StepListView;
