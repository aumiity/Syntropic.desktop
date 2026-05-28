"use client"

import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"
import { Tabs as TabsPrimitive } from "radix-ui"
import { motion } from "framer-motion"

import { cn } from "@/lib/utils"

function Tabs({
  className,
  orientation = "horizontal",
  ...props
}: React.ComponentProps<typeof TabsPrimitive.Root>) {
  return (
    <TabsPrimitive.Root
      data-slot="tabs"
      data-orientation={orientation}
      className={cn(
        "group/tabs flex gap-2 data-[orientation=horizontal]:flex-col",
        className
      )}
      {...props}
    />
  )
}

const tabsListVariants = cva(
  [
    "group/tabs-list inline-flex w-fit items-center justify-center",
    "rounded-lg p-[3px] text-muted-foreground",
    "group-data-horizontal/tabs:h-8",
    "group-data-vertical/tabs:h-fit group-data-vertical/tabs:flex-col",
    "data-[variant=line]:rounded-none",
    "data-[variant=pill]:rounded-none data-[variant=pill]:p-0 data-[variant=pill]:gap-1 data-[variant=pill]:group-data-horizontal/tabs:h-auto",
    "data-[variant=default]:inline-grid data-[variant=default]:grid-flow-col data-[variant=default]:auto-cols-fr data-[variant=default]:rounded-xl data-[variant=default]:p-1 data-[variant=default]:gap-1 data-[variant=default]:group-data-horizontal/tabs:h-auto",
    "data-[variant=segmented]:rounded-lg data-[variant=segmented]:p-1 data-[variant=segmented]:gap-1 data-[variant=segmented]:group-data-horizontal/tabs:h-auto",
  ].join(" "),
  {
    variants: {
      variant: {
        default: "bg-card shadow-card",
        line: "gap-1 bg-transparent w-full justify-start border-b border-border",
        pill: "bg-transparent",
        segmented: "bg-muted",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  }
)

type TabsListVariant = NonNullable<VariantProps<typeof tabsListVariants>["variant"]>

const TabsListCtx = React.createContext<{
  pillId: string
  showPill: boolean
  variant: TabsListVariant
}>({
  pillId: "",
  showPill: false,
  variant: "default",
})

const TabsList = React.forwardRef<
  React.ElementRef<typeof TabsPrimitive.List>,
  React.ComponentProps<typeof TabsPrimitive.List> &
    VariantProps<typeof tabsListVariants>
>(function TabsList(
  { className, variant = "default", children, ...props },
  ref
) {
  const pillId = React.useId()
  // `variant` is `TabsListVariant | null | undefined` via VariantProps; the
  // default kicks in for undefined but a caller could still pass null. Coerce
  // so the context type stays non-nullable.
  const safeVariant: TabsListVariant = variant ?? "default"
  const showPill: boolean = safeVariant === "default" || safeVariant === "pill" || safeVariant === "segmented"

  return (
    <TabsListCtx.Provider value={{ pillId, showPill, variant: safeVariant }}>
      <TabsPrimitive.List
        ref={ref}
        data-slot="tabs-list"
        data-variant={variant}
        className={cn(tabsListVariants({ variant }), "relative", className)}
        {...props}
      >
        {children}
      </TabsPrimitive.List>
    </TabsListCtx.Provider>
  )
})

function TabsTrigger({
  className,
  children,
  ...props
}: React.ComponentProps<typeof TabsPrimitive.Trigger>) {
  const { pillId, showPill, variant } = React.useContext(TabsListCtx)
  const ref = React.useRef<HTMLButtonElement>(null)
  const [isActive, setIsActive] = React.useState(false)

  React.useEffect(() => {
    const el = ref.current
    if (!el) return
    const update = () => setIsActive(el.getAttribute("data-state") === "active")
    update()
    const mo = new MutationObserver(update)
    mo.observe(el, { attributes: true, attributeFilter: ["data-state"] })
    return () => mo.disconnect()
  }, [])

  return (
    <TabsPrimitive.Trigger
      ref={ref}
      data-slot="tabs-trigger"
      className={cn(
        "relative inline-flex h-[calc(100%-1px)] flex-1 items-center justify-center",
        "gap-1.5 rounded-md border border-transparent",
        "px-1.5 py-0.5",
        "text-sm font-medium whitespace-nowrap",
        "text-foreground/60 dark:text-muted-foreground",
        "transition-colors",
        "group-data-vertical/tabs:w-full group-data-vertical/tabs:justify-start",
        "hover:text-foreground dark:hover:text-foreground",
        "focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-1 focus-visible:outline-ring",
        "disabled:pointer-events-none disabled:opacity-50",
        "has-data-[icon=inline-end]:pr-1 has-data-[icon=inline-start]:pl-1",
        // DEFAULT — equal-width grid, white text when active (pill bg via framer)
        "group-data-[variant=default]/tabs-list:rounded-lg group-data-[variant=default]/tabs-list:px-4 group-data-[variant=default]/tabs-list:py-3 group-data-[variant=default]/tabs-list:h-auto",
        "group-data-[variant=default]/tabs-list:data-[state=active]:text-primary-foreground",
        // PILL — white card inactive, white text when active (pill bg via framer)
        "group-data-[variant=pill]/tabs-list:rounded-lg group-data-[variant=pill]/tabs-list:px-4 group-data-[variant=pill]/tabs-list:py-1.5 group-data-[variant=pill]/tabs-list:h-auto",
        "group-data-[variant=pill]/tabs-list:bg-card group-data-[variant=pill]/tabs-list:border-transparent group-data-[variant=pill]/tabs-list:shadow-none",
        "group-data-[variant=pill]/tabs-list:data-[state=active]:text-primary-foreground",
        // LINE — transparent, primary text + underline (no sliding pill)
        "group-data-[variant=line]/tabs-list:data-[state=active]:bg-transparent group-data-[variant=line]/tabs-list:data-[state=active]:text-primary group-data-[variant=line]/tabs-list:data-[state=active]:shadow-none",
        // SEGMENTED — iOS-style: muted track, sliding card pill (via framer) on active,
        // text stays foreground (not primary-foreground).
        // flex-none overrides base flex-1 so triggers are content-width, not equal-fill.
        "group-data-[variant=segmented]/tabs-list:flex-none group-data-[variant=segmented]/tabs-list:rounded-md group-data-[variant=segmented]/tabs-list:px-3 group-data-[variant=segmented]/tabs-list:py-1.5 group-data-[variant=segmented]/tabs-list:h-auto",
        "group-data-[variant=segmented]/tabs-list:data-[state=active]:text-foreground",
        "after:absolute after:bg-primary after:opacity-0 after:transition-opacity after:z-10",
        "group-data-horizontal/tabs:after:inset-x-0 group-data-horizontal/tabs:after:bottom-[-3px] group-data-horizontal/tabs:after:h-[3px] group-data-horizontal/tabs:after:rounded-full",
        "group-data-vertical/tabs:after:inset-y-0 group-data-vertical/tabs:after:-right-1 group-data-vertical/tabs:after:w-[3px] group-data-vertical/tabs:after:rounded-full",
        "group-data-[variant=line]/tabs-list:data-[state=active]:after:opacity-100",
        "[&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
        className
      )}
      {...props}
    >
      {showPill && isActive && (
        <motion.div
          layoutId={pillId}
          aria-hidden
          className={cn(
            "absolute inset-0",
            variant === "segmented"
              ? "rounded-md bg-card shadow-md"
              : "rounded-lg bg-primary shadow-sm"
          )}
          transition={{ type: "spring", bounce: 0.18, duration: 0.45 }}
        />
      )}
      <span className="relative z-10 inline-flex items-center gap-1.5">
        {children}
      </span>
    </TabsPrimitive.Trigger>
  )
}

function TabsContent({
  className,
  ...props
}: React.ComponentProps<typeof TabsPrimitive.Content>) {
  return (
    <TabsPrimitive.Content
      data-slot="tabs-content"
      className={cn("flex-1 text-sm outline-none", className)}
      {...props}
    />
  )
}

export { Tabs, TabsList, TabsTrigger, TabsContent, tabsListVariants }
export type { TabsListVariant }
