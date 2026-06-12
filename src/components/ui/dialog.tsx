import * as React from "react"
import { Dialog as DialogPrimitive } from "radix-ui"

import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { XIcon } from "lucide-react"

function Dialog({
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Root>) {
  return <DialogPrimitive.Root data-slot="dialog" {...props} />
}

function DialogTrigger({
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Trigger>) {
  return <DialogPrimitive.Trigger data-slot="dialog-trigger" {...props} />
}

function DialogPortal({
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Portal>) {
  return <DialogPrimitive.Portal data-slot="dialog-portal" {...props} />
}

function DialogClose({
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Close>) {
  return <DialogPrimitive.Close data-slot="dialog-close" {...props} />
}

const DialogOverlay = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Overlay>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Overlay>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Overlay
    ref={ref}
    data-slot="dialog-overlay"
    className={cn(
      "fixed inset-0 isolate z-50 bg-black/10",
      "duration-100 supports-backdrop-filter:backdrop-blur-xs",
      "data-open:animate-in data-open:fade-in-0",
      "data-closed:animate-out data-closed:fade-out-0",
      className
    )}
    {...props}
  />
))
DialogOverlay.displayName = "DialogOverlay"

const dialogSizeMap = {
  sm: "sm:max-w-sm",
  md: "sm:max-w-md",
  lg: "sm:max-w-lg",
  xl: "sm:max-w-xl",
  "2xl": "sm:max-w-2xl",
  "3xl": "sm:max-w-3xl",
  "4xl": "sm:max-w-4xl",
  full: "sm:max-w-5xl",
} as const

type DialogSize = keyof typeof dialogSizeMap

const DialogContent = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Content> & {
    showCloseButton?: boolean
    size?: DialogSize
    onClose?: () => void
    /** Adds horizontal divider strips below DialogHeader and above DialogFooter.
        Use for dialogs that contain input fields so the form area reads as a
        distinct zone separate from title/actions. Skip for alert/confirm/success
        dialogs where the message body and footer flow naturally. */
    divided?: boolean
  }
>(({ className, children, showCloseButton = true, size, onClose, divided, ...props }, ref) => (
  <DialogPortal>
    <DialogOverlay />
    {/* Flex-centering wrapper instead of `top-1/2 left-1/2 -translate-1/2` on
        the content: a transform-centered box lands on a half-pixel whenever its
        width/height is odd, which strips sub-pixel anti-aliasing from any
        composited descendant (notably `position: sticky` table headers) and
        makes their text look blurry. Flex centering snaps to whole pixels, so
        sticky headers stay crisp. The wrapper is click-through
        (`pointer-events-none`) so the overlay beneath still receives clicks;
        the content re-enables pointer events on itself. */}
    <div className="fixed inset-0 z-50 flex items-center justify-center pointer-events-none">
    <DialogPrimitive.Content
      ref={ref}
      aria-describedby={undefined}
      data-slot="dialog-content"
      data-divided={divided ? "" : undefined}
      // Project-wide rule: modals NEVER close on outside-click. Esc still closes.
      // See memory/feedback_modal_behavior.md. Do not override these handlers.
      onPointerDownOutside={(e) => e.preventDefault()}
      onInteractOutside={(e) => e.preventDefault()}
      className={cn(
        // select-text: Chromium on Windows withholds text selection inside a
        // focus-trapped aria-modal by default (macOS allows it). Opt every modal
        // back into selectable text from this one shared primitive.
        "relative grid w-full max-w-[calc(100%-2rem)] pointer-events-auto select-text",
        "gap-4 rounded-xl bg-popover p-4 text-sm text-popover-foreground",
        "duration-100 outline-none",
        "sm:max-w-sm",
        "data-open:animate-in data-open:fade-in-0 data-open:zoom-in-95",
        "data-closed:animate-out data-closed:fade-out-0 data-closed:zoom-out-95",
        size && dialogSizeMap[size],
        // Divider strips for form dialogs. Targets DialogHeader / DialogFooter
        // children by data-slot so callers don't need to pass classes through.
        // pb-3 / pt-3 give the line a 12px breathing margin; the parent gap-4
        // (16px) provides the body-side spacing.
        divided && [
          "[&>[data-slot=dialog-header]]:border-b",
          "[&>[data-slot=dialog-header]]:border-border",
          "[&>[data-slot=dialog-header]]:pb-3",
          "[&>[data-slot=dialog-footer]]:border-t",
          "[&>[data-slot=dialog-footer]]:border-border",
          "[&>[data-slot=dialog-footer]]:pt-3",
        ],
        className
      )}
      {...props}
    >
      {children}
      {showCloseButton && (
        <DialogPrimitive.Close data-slot="dialog-close" asChild onClick={onClose}>
          <Button variant="elevated" className="h-8 w-8 absolute top-4 right-4" size="icon-sm">
            <XIcon />
            <span className="sr-only">Close</span>
          </Button>
        </DialogPrimitive.Close>
      )}
    </DialogPrimitive.Content>
    </div>
  </DialogPortal>
))
DialogContent.displayName = "DialogContent"


function DialogHeader({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="dialog-header"
      className={cn("flex flex-col gap-2 px-2", className)}
      {...props}
    />
  )
}

function DialogTitle({
  className,
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Title>) {
  return (
    <DialogPrimitive.Title
      data-slot="dialog-title"
      className={cn(
        "min-h-8 flex items-center",
        "font-heading text-xl leading-none font-bold",
        className
      )}
      {...props}
    />
  )
}

function DialogBody({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="dialog-body"
      className={cn("px-2 rounded-xl min-w-0", className)}
      {...props}
    />
  )
}

function DialogFooter({
  className,
  showCloseButton = false,
  children,
  ...props
}: React.ComponentProps<"div"> & {
  showCloseButton?: boolean
}) {
  return (
    <div
      data-slot="dialog-footer"
      className={cn(
        "flex flex-col-reverse gap-2 px-2",
        "sm:flex-row sm:justify-end",
        className
      )}
      {...props}
    >
      {children}
      {showCloseButton && (
        <DialogPrimitive.Close asChild>
          <Button variant="outline">Close</Button>
        </DialogPrimitive.Close>
      )}
    </div>
  )
}


function DialogDescription({
  className,
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Description>) {
  return (
    <DialogPrimitive.Description
      data-slot="dialog-description"
      className={cn(
        "text-sm text-muted-foreground",
        "*:[a]:underline *:[a]:underline-offset-3 *:[a]:hover:text-foreground",
        className
      )}
      {...props}
    />
  )
}

export {
  Dialog,
  DialogBody,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogOverlay,
  DialogPortal,
  DialogTitle,
  DialogTrigger,
}
