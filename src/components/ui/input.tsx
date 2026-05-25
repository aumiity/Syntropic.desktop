import * as React from "react"
import { Search } from "lucide-react"

import { cn } from "@/lib/utils"

const Input = React.forwardRef<HTMLInputElement, React.ComponentProps<"input">>(
  ({ className, type, ...props }, ref) => {
    return (
      <input
        ref={ref}
        type={type}
        data-slot="input"
        className={cn(
          "h-10 w-full min-w-0",
          "rounded-lg bg-input",
          "px-2.5 py-1",
          "text-sm outline-none transition-all",
          "file:inline-flex file:h-6 file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-foreground",
          "placeholder:text-foreground-subtle",
          "focus:ring-[2px] focus:ring-ring focus:border-ring",
          "disabled:cursor-not-allowed disabled:opacity-50",
          "aria-invalid:border-destructive aria-invalid:ring-[2px] aria-invalid:ring-destructive/40",
          className
        )}
        {...props}
      />
    )
  }
)
Input.displayName = "Input"

const SearchInput = React.forwardRef<
  HTMLInputElement,
  React.ComponentProps<"input"> & { wrapperClassName?: string }
>(({ className, wrapperClassName, ...props }, ref) => {
  return (
    <div className={cn("relative w-96 shrink-0", wrapperClassName)}>
      <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground pointer-events-none" />
      <Input ref={ref} className={cn("pl-9", className)} {...props} />
    </div>
  )
})
SearchInput.displayName = "SearchInput"

export { Input, SearchInput }


