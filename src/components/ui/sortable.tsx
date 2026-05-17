import * as React from 'react'
import { Reorder, useDragControls } from 'framer-motion'
import { GripVertical } from 'lucide-react'

import { cn } from '@/lib/utils'
import { TableCell } from './table'

// Drag-to-reorder table body. Renders a <tbody> whose rows can be dragged
// vertically. Pair with <SortableRow>. Reorder state is owned by the caller
// (values + onReorder); persistence is the caller's job (onDragEnd on the row).
function SortableTableBody<T>({
  values,
  onReorder,
  className,
  children,
}: {
  values: T[]
  onReorder: (next: T[]) => void
  className?: string
  children: React.ReactNode
}) {
  return (
    <Reorder.Group
      as="tbody"
      axis="y"
      values={values}
      onReorder={onReorder}
      className={cn('select-none [&_tr:last-child]:border-0', className)}
    >
      {children}
    </Reorder.Group>
  )
}

// One sortable <tr>. Drag is gated to an explicit grip handle (first cell) so
// an accidental row click never moves anything — the caller decides when the
// table is in reorder mode. Pass the remaining <TableCell>s as children.
function SortableRow<T>({
  value,
  onDragEnd,
  className,
  children,
}: {
  value: T
  onDragEnd?: () => void
  className?: string
  children: React.ReactNode
}) {
  const controls = useDragControls()
  return (
    <Reorder.Item
      as="tr"
      value={value}
      dragListener={false}
      dragControls={controls}
      onDragEnd={onDragEnd}
      className={cn('border-b bg-card transition-colors select-none hover:bg-primary-soft/60', className)}
    >
      <TableCell className="text-center">
        <span
          onPointerDown={e => controls.start(e)}
          className="inline-flex size-8 cursor-grab touch-none items-center justify-center rounded-lg text-muted-foreground hover:bg-muted active:cursor-grabbing"
          title="ลากเพื่อจัดลำดับ"
        >
          <GripVertical className="size-4" />
        </span>
      </TableCell>
      {children}
    </Reorder.Item>
  )
}

export { SortableTableBody, SortableRow }
