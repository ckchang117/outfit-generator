"use client"

import { useEffect } from "react"
import { cn } from "../utils/cn"

export default function Toast({
  open,
  message,
  onOpenChange,
  action,
  onAction,
}: {
  open: boolean
  message: string
  onOpenChange: (open: boolean) => void
  action?: string
  onAction?: () => void
}) {
  useEffect(() => {
    if (!open) return
    const duration = action ? 5000 : 2400 // Longer duration if there's an action
    const t = setTimeout(() => onOpenChange(false), duration)
    return () => clearTimeout(t)
  }, [open, action, onOpenChange])

  return (
    <div
      aria-live="polite"
      aria-atomic="true"
      className="pointer-events-none fixed inset-x-0 bottom-4 z-50 flex justify-center"
    >
      <div className={cn("transition-opacity", open ? "opacity-100" : "opacity-0")}>
        <div className="pointer-events-auto rounded-full border bg-white px-4 py-2 text-sm shadow-lg flex items-center gap-3">
          <span>{message}</span>
          {action && onAction && (
            <button
              onClick={() => {
                onAction()
                onOpenChange(false)
              }}
              className="font-medium text-neutral-900 hover:text-neutral-700 underline"
            >
              {action}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
