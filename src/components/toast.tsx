"use client"

import { useEffect } from "react"
import { cn } from "../utils/cn"

export default function Toast({
  open,
  message,
  onOpenChange,
}: {
  open: boolean
  message: string
  onOpenChange: (open: boolean) => void
}) {
  useEffect(() => {
    if (!open) return
    const t = setTimeout(() => onOpenChange(false), 2400)
    return () => clearTimeout(t)
  }, [open, onOpenChange])

  return (
    <div
      aria-live="polite"
      aria-atomic="true"
      className="pointer-events-none fixed inset-x-0 bottom-4 z-50 flex justify-center"
    >
      <div className={cn("transition-opacity", open ? "opacity-100" : "opacity-0")}>
        <div className="pointer-events-auto rounded-full border bg-white px-4 py-2 text-sm shadow-lg">{message}</div>
      </div>
    </div>
  )
}
