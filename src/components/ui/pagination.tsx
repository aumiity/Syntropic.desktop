import {
  ChevronLeftIcon,
  ChevronRightIcon,
  ChevronsLeftIcon,
  ChevronsRightIcon,
} from "lucide-react"

import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"

export type PageSize = number | "all"

interface PaginationProps {
  page: number
  totalPages: number
  onPageChange: (page: number) => void
  className?: string
  pageSize?: PageSize
  onPageSizeChange?: (size: PageSize) => void
  pageSizeOptions?: PageSize[]
}

const DEFAULT_PAGE_SIZES: PageSize[] = [50, 100, 250, 500, "all"]

function pageSizeLabel(v: PageSize) {
  return v === "all" ? "ทั้งหมด" : String(v)
}

function getPageList(page: number, totalPages: number): (number | "ellipsis")[] {
  if (totalPages <= 7) {
    return Array.from({ length: totalPages }, (_, i) => i + 1)
  }
  const set = new Set<number>([1, totalPages, page, page - 1, page + 1])
  const sorted = [...set].filter(p => p >= 1 && p <= totalPages).sort((a, b) => a - b)
  const result: (number | "ellipsis")[] = []
  for (let i = 0; i < sorted.length; i++) {
    const cur = sorted[i]
    const prev = sorted[i - 1]
    if (prev !== undefined && cur - prev > 1) result.push("ellipsis")
    result.push(cur)
  }
  return result
}

function Pagination({
  page,
  totalPages,
  onPageChange,
  className,
  pageSize,
  onPageSizeChange,
  pageSizeOptions = DEFAULT_PAGE_SIZES,
}: PaginationProps) {
  const hasSizeSelector = pageSize !== undefined && onPageSizeChange !== undefined
  const showNav = totalPages > 1
  if (!hasSizeSelector && !showNav) return null

  const pages = showNav ? getPageList(page, totalPages) : []
  const atFirst = page <= 1
  const atLast = page >= totalPages

  const sizeSelector = hasSizeSelector ? (
    <div className="flex items-center gap-2 text-sm text-muted-foreground">
      <span>แสดง</span>
      <Select
        value={String(pageSize)}
        onValueChange={(v) => onPageSizeChange!(v === "all" ? "all" : Number(v))}
      >
        <SelectTrigger className="h-9 min-w-20">
          <SelectValue>{pageSizeLabel(pageSize!)}</SelectValue>
        </SelectTrigger>
        <SelectContent className="min-w-28">
          {pageSizeOptions.map(opt => (
            <SelectItem key={String(opt)} value={String(opt)}>
              {pageSizeLabel(opt)}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <span>รายการ</span>
    </div>
  ) : null

  const nav = showNav ? (
    <div className="flex items-center gap-1">
      <Button
        size="icon-sm"
        variant="outline"
        disabled={atFirst}
        onClick={() => onPageChange(1)}
        aria-label="หน้าแรก"
      >
        <ChevronsLeftIcon />
      </Button>
      <Button
        size="icon-sm"
        variant="outline"
        disabled={atFirst}
        onClick={() => onPageChange(page - 1)}
        aria-label="หน้าก่อนหน้า"
      >
        <ChevronLeftIcon />
      </Button>
      {pages.map((p, i) =>
        p === "ellipsis" ? (
          <span
            key={`ellipsis-${i}`}
            className="inline-flex size-6 items-center justify-center text-muted-foreground"
            aria-hidden
          >
            …
          </span>
        ) : (
          <Button
            key={p}
            size="icon-sm"
            variant={p === page ? "default" : "outline"}
            onClick={() => onPageChange(p)}
            aria-current={p === page ? "page" : undefined}
            aria-label={`หน้า ${p}`}
            className="text-xs"
          >
            {p}
          </Button>
        )
      )}
      <Button
        size="icon-sm"
        variant="outline"
        disabled={atLast}
        onClick={() => onPageChange(page + 1)}
        aria-label="หน้าถัดไป"
      >
        <ChevronRightIcon />
      </Button>
      <Button
        size="icon-sm"
        variant="outline"
        disabled={atLast}
        onClick={() => onPageChange(totalPages)}
        aria-label="หน้าสุดท้าย"
      >
        <ChevronsRightIcon />
      </Button>
    </div>
  ) : null

  return (
    <nav
      role="navigation"
      aria-label="pagination"
      data-slot="pagination"
      className={cn(
        "flex items-center text-sm w-full",
        hasSizeSelector ? "justify-between gap-2" : "justify-end gap-1",
        className,
      )}
    >
      {sizeSelector ?? <span />}
      {nav}
    </nav>
  )
}

export { Pagination }
