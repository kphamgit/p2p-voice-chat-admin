import React, { useEffect, useImperativeHandle, useState } from 'react';

import {
  type ColumnDef,
  type Row,
  flexRender,
  getCoreRowModel,
  useReactTable,
} from '@tanstack/react-table';

// needed for table body level scope DnD setup
import {
  DndContext,
  KeyboardSensor,
  MouseSensor,
  TouchSensor,
  closestCenter,
  type DragEndEvent,
  type UniqueIdentifier,
  useSensor,
  useSensors,
} from '@dnd-kit/core';
import { restrictToVerticalAxis } from '@dnd-kit/modifiers';
import {
  arrayMove,
  SortableContext,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';

// needed for row & cell level scope DnD setup
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';

// Ported from phuyenenglish.net. Unlike the original, this table makes no API
// calls itself: edit / delete / renumber are delegated to the parent through
// callbacks, so it works with any backend.

export interface genericItemType {
  itemId: string;
  item_number: number;
}

export interface GenericSortableTableHandleProps<T> {
  add_row: (new_row: T) => void;
  update_row: (row: Partial<T> & { itemId: string }) => void;
  get_last_item_number: () => number;
  renumber_items: () => void;
}

/*
generic type T can be any row type with an itemId and item_number, e.g. a level or unit row.
*/
interface GenericTableProps<T extends genericItemType> {
  main_heading?: string;
  input_data: T[];
  columns: ColumnDef<T>[];
  on_edit?: (row: T) => void; // show an Edit button that hands the row to the parent
  on_delete?: (row: T) => Promise<void> | void; // show a Delete button; the row is removed locally once this resolves
  on_renumber?: (rows: T[]) => Promise<void> | void; // called with the rows renumbered 1..n in their current (dragged) order
  show_renumber_button?: boolean; // show the built-in "Renumber Items" button (default true)
  ref?: React.Ref<GenericSortableTableHandleProps<T>>;
}

// Drag handle for a row; put it in a column cell: cell: ({ row }) => <RowDragHandleCell rowId={row.id} />
export const RowDragHandleCell = ({ rowId }: { rowId: string }) => {
  const { attributes, listeners } = useSortable({ id: rowId });
  return (
    <button {...attributes} {...listeners} className="cursor-grab">
      🟰
    </button>
  );
};

interface DraggableRowProps<T extends { itemId: string }> {
  row: Row<T>;
}

const DraggableRow = <T extends { itemId: string }>({ row }: DraggableRowProps<T>) => {
  const { transform, transition, setNodeRef, isDragging } = useSortable({
    id: row.original.itemId,
  });

  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform), // Let dnd-kit handle the transform
    transition: transition,
    opacity: isDragging ? 0.8 : 1,
    zIndex: isDragging ? 1 : 0,
    position: 'relative',
  };

  return (
    <tr ref={setNodeRef} style={style}>
      {row.getVisibleCells().map((cell) => (
        <td key={cell.id} className={cellClass}>
          {flexRender(cell.column.columnDef.cell, cell.getContext())}
        </td>
      ))}
    </tr>
  );
};

function GenericSortableTable<T extends genericItemType>({
  main_heading,
  input_data,
  columns,
  on_edit,
  on_delete,
  on_renumber,
  show_renumber_button = true,
  ref,
}: GenericTableProps<T>) {
  const [data, setData] = useState<T[]>([]);

  useEffect(() => {
    setData(input_data);
  }, [input_data]);

  useImperativeHandle(ref, () => ({
    get_last_item_number() {
      // get the highest item_number in data
      return data.reduce((max, row) => (row.item_number > max ? row.item_number : max), 0);
    },
    add_row(new_row: T) {
      // set new_row item_number to last item_number + 1
      setData((prev) => [...prev, { ...new_row, item_number: prev.length + 1 }]);
    },
    update_row(row) {
      setData((prev) => prev.map((r) => (r.itemId === row.itemId ? { ...r, ...row } : r)));
    },
    renumber_items() {
      reset_item_numbers();
    },
  }));

  const dataIds = React.useMemo<UniqueIdentifier[]>(() => data.map((row) => row.itemId), [data]);

  const delete_row = async (row: T) => {
    try {
      await on_delete?.(row);
      setData((prev) => prev.filter((item) => item.itemId !== row.itemId));
    } catch (error) {
      console.error('Error deleting row:', error);
    }
  };

  const actionColumns: ColumnDef<T>[] = [];
  if (on_edit) {
    actionColumns.push({
      id: 'edit_generic',
      header: 'Edit',
      cell: (info) => (
        <button className={`${actionButtonClass} bg-blue-600`} onClick={() => on_edit(info.row.original)}>
          Edit
        </button>
      ),
    });
  }
  if (on_delete) {
    actionColumns.push({
      id: 'delete_generic',
      header: 'Delete',
      cell: (info) => (
        <button className={`${actionButtonClass} bg-red-600`} onClick={() => delete_row(info.row.original)}>
          Delete
        </button>
      ),
    });
  }

  const table = useReactTable({
    data,
    columns: [...columns, ...actionColumns],
    getCoreRowModel: getCoreRowModel(),
    getRowId: (row) => row.itemId,
  });

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (active && over && active.id !== over.id) {
      setData((data) => {
        const oldIndex = dataIds.indexOf(active.id);
        const newIndex = dataIds.indexOf(over.id);
        return arrayMove(data, oldIndex, newIndex);
      });
    }
  };

  const sensors = useSensors(
    useSensor(MouseSensor, {}),
    useSensor(TouchSensor, {}),
    useSensor(KeyboardSensor, {}),
  );

  // Number the rows 1..n in their current order and hand the result to the parent to persist.
  const reset_item_numbers = () => {
    const renumbered = data.map((row, index) => ({ ...row, item_number: index + 1 }));
    setData(renumbered);
    Promise.resolve(on_renumber?.(renumbered)).catch((error) => {
      console.error('Error renumbering items:', error);
    });
  };

  return (
    <>
      {main_heading && <h2 className="text-center text-2xl">{main_heading}</h2>}
      {show_renumber_button && (
        <div className="py-3">
          <button className="rounded-lg bg-amber-500 px-3 py-2 font-bold text-white hover:opacity-90" onClick={reset_item_numbers}>
            Renumber Items
          </button>
        </div>
      )}
      <DndContext
        collisionDetection={closestCenter}
        modifiers={[restrictToVerticalAxis]}
        onDragEnd={handleDragEnd}
        sensors={sensors}
      >
        <table className="border-collapse">
          <thead>
            {table.getHeaderGroups().map((headerGroup) => (
              <tr key={headerGroup.id}>
                {headerGroup.headers.map((header) => (
                  <th key={header.id} colSpan={header.colSpan} className={`${cellClass} text-left`}>
                    {header.isPlaceholder ? null : flexRender(header.column.columnDef.header, header.getContext())}
                  </th>
                ))}
              </tr>
            ))}
          </thead>
          <tbody>
            <SortableContext items={dataIds} strategy={verticalListSortingStrategy}>
              {table.getRowModel().rows.map((row) => (
                <DraggableRow key={row.id} row={row} />
              ))}
            </SortableContext>
          </tbody>
        </table>
      </DndContext>
    </>
  );
}
export default GenericSortableTable;

const cellClass = 'border-b border-[var(--border)] px-2 py-1';

const actionButtonClass = 'my-1 rounded px-2 font-bold text-white hover:opacity-90';
