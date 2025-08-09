"use client"

import type React from "react"
import { cn } from "../utils/cn"

type Props = {
  children: React.ReactNode
  onClick?: () => void
  type?: "button" | "submit"
  disabled?: boolean
  loading?: boolean
  className?: string
  variant?: "primary" | "ghost"
}

export default function PrimaryButton({
  children,
  onClick,
  type = "button",
  disabled,
  loading,
  className,
  variant = "primary",
}: Props) {
  const isDisabled = disabled || loading
  const base =
    "inline-flex items-center justify-center h-11 px-5 rounded-full text-sm font-medium transition shadow-sm w-full sm:w-auto focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-neutral-400"
  const styles =
    variant === "primary"
      ? "bg-neutral-900 text-white hover:bg-neutral-800 disabled:opacity-50 disabled:hover:bg-neutral-900"
      : "bg-transparent text-neutral-900 border border-neutral-300 hover:bg-neutral-50 disabled:opacity-50"

  return (
    <button
      type={type}
      onClick={onClick}
      disabled={isDisabled}
      aria-busy={loading ? "true" : "false"}
      className={cn(base, styles, className)}
    >
      {loading ? (
        <span className="inline-flex items-center gap-2">
          <span className="h-4 w-4 rounded-full border-2 border-neutral-300 border-t-neutral-900 animate-spin" />
          <span>Loading</span>
        </span>
      ) : (
        children
      )}
    </button>
  )
}
