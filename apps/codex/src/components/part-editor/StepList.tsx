// components/part-editor/StepList.tsx — 工程並び替え（技術計画v2.2 §4.2 T26・§3.2(2)代替保証）
//
// 各StepCardをdnd-kit Sortable化する。DndSpike.tsx（M0スパイク）の実証済みパターン
// （PointerSensor+KeyboardSensor+closestCenter+arrayMove）を踏襲する。カード全体を
// ドラッグ可能にするとStepCard内のフォーム操作（select/input等）と干渉するため、
// ドラッグハンドル（span要素）に限定してlistenersを付与する（{...listeners}をハンドルのみへ）。
// モバイル・a11y用に上下移動ボタンを併設（デザイン仕様§122）。先頭の↑・末尾の↓は
// opacity .45で無効表示（disabled）にする。並び替えのkeyはStep.id（配列indexをkeyにしない）。
//
// 0件時はEmptyState(stepsバリアント。D-5)＋AddStepButtonのみを表示する。

import { useTranslation } from "react-i18next";
import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  arrayMove,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import type { CropRect, PaletteColor, Step } from "@coat-codex/recipe-core";
import StepCard from "./StepCard";
import EmptyState from "../common/EmptyState";
import AddStepButton from "./AddStepButton";
import styles from "./StepList.module.css";

interface StepListProps {
  steps: Step[];
  recipeId: string;
  palette: PaletteColor[];
  onChange: (index: number, next: Step) => void;
  onAddColor: (color: PaletteColor) => void;
  onDelete: (index: number) => void;
  onReorder: (nextSteps: Step[]) => void;
  onAdd: (step: Step) => void;
  /** 指定時のみStepPhotoTileのクロップ導線を有効化する */
  photoCrops?: Record<string, CropRect>;
  onCropChange?: (photoId: string, crop: CropRect | null) => void;
}

interface SortableStepCardProps {
  step: Step;
  index: number;
  total: number;
  recipeId: string;
  palette: PaletteColor[];
  onChange: (next: Step) => void;
  onAddColor: (color: PaletteColor) => void;
  onDelete: () => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
  crop?: CropRect | null;
  onCropChange?: (photoId: string, crop: CropRect | null) => void;
}

function SortableStepCard({
  step,
  index,
  total,
  recipeId,
  palette,
  onChange,
  onAddColor,
  onDelete,
  onMoveUp,
  onMoveDown,
  crop,
  onCropChange,
}: SortableStepCardProps) {
  const { t } = useTranslation();
  const { attributes, listeners, setNodeRef, transform, transition } =
    useSortable({ id: step.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition: transition ?? undefined,
  };

  const isFirst = index === 0;
  const isLast = index === total - 1;

  return (
    <li
      ref={setNodeRef}
      style={style}
      className={styles.item}
      data-testid={`step-list-item-${index}`}
    >
      <div className={styles.controls}>
        <span
          className={styles.dragHandle}
          aria-label={t("editor.dragHandle")}
          {...attributes}
          {...listeners}
        >
          ⋮⋮
        </span>
        <button
          type="button"
          className={styles.moveButton}
          aria-label={t("editor.moveStepUp")}
          disabled={isFirst}
          onClick={onMoveUp}
        >
          ↑
        </button>
        <button
          type="button"
          className={styles.moveButton}
          aria-label={t("editor.moveStepDown")}
          disabled={isLast}
          onClick={onMoveDown}
        >
          ↓
        </button>
      </div>
      <div className={styles.cardWrap}>
        <StepCard
          step={step}
          index={index}
          recipeId={recipeId}
          palette={palette}
          onChange={onChange}
          onAddColor={onAddColor}
          onDelete={onDelete}
          crop={crop}
          onCropChange={onCropChange}
        />
      </div>
    </li>
  );
}

function StepList({
  steps,
  recipeId,
  palette,
  onChange,
  onAddColor,
  onDelete,
  onReorder,
  onAdd,
  photoCrops,
  onCropChange,
}: StepListProps) {
  const { t } = useTranslation();

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  );

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) {
      return;
    }
    const oldIndex = steps.findIndex((step) => step.id === active.id);
    const newIndex = steps.findIndex((step) => step.id === over.id);
    if (oldIndex === -1 || newIndex === -1) {
      return;
    }
    onReorder(arrayMove(steps, oldIndex, newIndex));
  }

  function moveStep(index: number, direction: -1 | 1) {
    const target = index + direction;
    if (target < 0 || target >= steps.length) {
      return;
    }
    onReorder(arrayMove(steps, index, target));
  }

  if (steps.length === 0) {
    return (
      <div className={styles.root}>
        <EmptyState
          variant="steps"
          heading={t("editor.emptyStepsTitle")}
          description={t("editor.emptyStepsDescription")}
        >
          <AddStepButton onAdd={onAdd} />
        </EmptyState>
      </div>
    );
  }

  return (
    <div className={styles.root}>
      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragEnd={handleDragEnd}
      >
        <SortableContext
          items={steps.map((step) => step.id)}
          strategy={verticalListSortingStrategy}
        >
          <ul className={styles.list}>
            {steps.map((step, index) => (
              <SortableStepCard
                key={step.id}
                step={step}
                index={index}
                total={steps.length}
                recipeId={recipeId}
                palette={palette}
                onChange={(next) => onChange(index, next)}
                onAddColor={onAddColor}
                onDelete={() => onDelete(index)}
                onMoveUp={() => moveStep(index, -1)}
                onMoveDown={() => moveStep(index, 1)}
                crop={
                  step.photoId ? (photoCrops?.[step.photoId] ?? null) : null
                }
                onCropChange={onCropChange}
              />
            ))}
          </ul>
        </SortableContext>
      </DndContext>
      <AddStepButton onAdd={onAdd} />
    </div>
  );
}

export default StepList;
