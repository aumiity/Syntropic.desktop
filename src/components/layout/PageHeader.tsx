interface PageHeaderProps {
  title: string
  right?: React.ReactNode
}

export function PageHeader({ title, right }: PageHeaderProps) {
  // Right cluster is absolute-positioned so its height never affects the
  // header's box — any `right` content (e.g. h-10 action buttons in
  // EditProduct) stays visually anchored at the title's baseline without
  // growing the container past min-h-10 and shifting the title / the next
  // row (Tabs / stat cards) down on some pages but not others.
  return (
    <div className="relative flex items-end shrink-0 px-1 mt-4 pb-2 min-h-10">
      <h1 className="text-3xl font-bold leading-none tracking-tight">{title}</h1>
      {right && (
        <div className="absolute right-1 bottom-2 flex items-center gap-3">
          {right}
        </div>
      )}
    </div>
  )
}
