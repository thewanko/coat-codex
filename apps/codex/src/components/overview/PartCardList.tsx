// components/overview/PartCardList.tsx — パーツ並び替え（技術計画v2.2 §3.2(2)・§4.2 T28）
//
// StepList.tsx（T26）のdnd-kit Sortableパターンを踏襲する。各PartCardをドラッグハンドル付き
// li要素で包み、モバイル・a11y用に上下移動ボタンを併設（先頭の↑・末尾の↓はopacity .45で
// 無効表示）。並び替えのkeyはPart.id（配列indexをkeyにしない）。
//
// パーツ0件時はEmptyState(partsバリアント。D-5)＋AddPartButtonのみを表示する。
//
// v2.7 T61: 外付けの`.controls`列（⋮⋮・↑↓・✕）を廃止し、PartCard自身へ内包した
// （デザイン仕様書§Card part行v2.7改訂）。useSortableのattributes+listenersは
// dragHandlePropsとしてPartCardへ渡す。

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
import type { CropRect, RecipeDoc } from "@coat-codex/recipe-core";
import PartCard from "./PartCard";
import AddPartButton from "./AddPartButton";
import EmptyState from "../common/EmptyState";
import styles from "./PartCardList.module.css";

export type RecipePart = RecipeDoc["parts"][number];

interface PartCardListProps {
  parts: RecipePart[];
  palette: RecipeDoc["palette"];
  /** photoId→クロップ矩形（未設定はエントリなし）。RecipeDoc.photoCropsをそのまま渡す */
  photoCrops?: Record<string, CropRect>;
  onOpen: (partId: string) => void;
  onReview: (partId: string) => void;
  onReorder: (nextParts: RecipePart[]) => void;
  onAdd: (part: RecipePart) => void;
  onRequestDelete: (partId: string) => void;
}

interface SortablePartCardProps {
  part: RecipePart;
  order: number;
  index: number;
  total: number;
  palette: RecipeDoc["palette"];
  photoCrops: Record<string, CropRect>;
  onOpen: (partId: string) => void;
  onReview: (partId: string) => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
  onRequestDelete: () => void;
}

function SortablePartCard({
  part,
  order,
  index,
  total,
  palette,
  photoCrops,
  onOpen,
  onReview,
  onMoveUp,
  onMoveDown,
  onRequestDelete,
}: SortablePartCardProps) {
  const { attributes, listeners, setNodeRef, transform, transition } =
    useSortable({ id: part.id });

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
      data-testid={`part-list-item-${index}`}
    >
      <div className={styles.cardWrap}>
        <PartCard
          part={part}
          order={order}
          palette={palette}
          photoCrops={photoCrops}
          onOpen={onOpen}
          onReview={onReview}
          dragHandleProps={{ ...attributes, ...listeners }}
          onMoveUp={onMoveUp}
          onMoveDown={onMoveDown}
          moveUpDisabled={isFirst}
          moveDownDisabled={isLast}
          onRequestDelete={onRequestDelete}
        />
      </div>
    </li>
  );
}

function PartCardList({
  parts,
  palette,
  photoCrops = {},
  onOpen,
  onReview,
  onReorder,
  onAdd,
  onRequestDelete,
}: PartCardListProps) {
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
    const oldIndex = parts.findIndex((part) => part.id === active.id);
    const newIndex = parts.findIndex((part) => part.id === over.id);
    if (oldIndex === -1 || newIndex === -1) {
      return;
    }
    onReorder(arrayMove(parts, oldIndex, newIndex));
  }

  function moveItem(index: number, direction: -1 | 1) {
    const target = index + direction;
    if (target < 0 || target >= parts.length) {
      return;
    }
    onReorder(arrayMove(parts, index, target));
  }

  if (parts.length === 0) {
    return (
      <div className={styles.root}>
        <EmptyState
          variant="parts"
          heading={t("overview.emptyPartsTitle")}
          description={t("overview.emptyPartsDescription")}
        >
          <AddPartButton onAdd={onAdd} />
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
          items={parts.map((part) => part.id)}
          strategy={verticalListSortingStrategy}
        >
          <ul className={styles.list}>
            {parts.map((part, index) => (
              <SortablePartCard
                key={part.id}
                part={part}
                order={index + 1}
                index={index}
                total={parts.length}
                palette={palette}
                photoCrops={photoCrops}
                onOpen={onOpen}
                onReview={onReview}
                onMoveUp={() => moveItem(index, -1)}
                onMoveDown={() => moveItem(index, 1)}
                onRequestDelete={() => onRequestDelete(part.id)}
              />
            ))}
          </ul>
        </SortableContext>
      </DndContext>
      <AddPartButton onAdd={onAdd} />
    </div>
  );
}

export default PartCardList;
