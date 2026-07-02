import { useState } from "react";
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

const INITIAL_ITEMS = ["Item A", "Item B", "Item C", "Item D", "Item E"];

function SortableItem({ id }: { id: string }) {
  const { attributes, listeners, setNodeRef, transform, transition } =
    useSortable({ id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition: transition ?? undefined,
    padding: "0.5rem 0.75rem",
    marginBottom: "0.25rem",
    border: "1px solid #ccc",
    background: "#fff",
    cursor: "grab",
  };

  return (
    <li
      ref={setNodeRef}
      style={style}
      data-testid="dnd-item"
      {...attributes}
      {...listeners}
    >
      {id}
    </li>
  );
}

function DndSpike() {
  const [items, setItems] = useState(INITIAL_ITEMS);

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
    setItems((current) => {
      const oldIndex = current.indexOf(String(active.id));
      const newIndex = current.indexOf(String(over.id));
      return arrayMove(current, oldIndex, newIndex);
    });
  }

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragEnd={handleDragEnd}
    >
      <SortableContext items={items} strategy={verticalListSortingStrategy}>
        <ul data-testid="dnd-list" style={{ listStyle: "none", padding: 0 }}>
          {items.map((id) => (
            <SortableItem key={id} id={id} />
          ))}
        </ul>
      </SortableContext>
    </DndContext>
  );
}

export default DndSpike;
