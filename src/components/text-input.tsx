"use client"

import type React from "react"
import { cn } from "../utils/cn"

type Props = {
  id: string
  label?: string
  placeholder?: string
  value: string
  onChange: React.ChangeEventHandler<HTMLInputElement | HTMLTextAreaElement>
  helperText?: string
  error?: string
  type?: React.HTMLInputTypeAttribute
  multiline?: boolean
  rows?: number
  className?: string
}

export default function TextInput({
  id,
  label,
  placeholder,
  value,
  onChange,
  helperText,
  error,
  type = "text",
  multiline = false,
  rows = 3,
  className,
}: Props) {
  const shared =
    "w-full rounded-lg border bg-white px-3 py-2 text-sm text-neutral-900 placeholder-neutral-400 shadow-sm focus:outline-none focus:ring-2 focus:ring-neutral-400 focus:border-neutral-400"
  return (
    <div className={cn("grid gap-1.5", className)}>
      {label ? (
        <label htmlFor={id} className="text-sm font-medium text-neutral-700">
          {label}
        </label>
      ) : null}
      {multiline ? (
        <textarea
          id={id}
          rows={rows}
          placeholder={placeholder}
          value={value}
          onChange={onChange}
          className={cn(shared, error && "border-red-500 focus:ring-red-500")}
        />
      ) : (
        <input
          id={id}
          type={type}
          placeholder={placeholder}
          value={value}
          onChange={onChange}
          className={cn(shared, error && "border-red-500 focus:ring-red-500")}
        />
      )}
      {error ? (
        <p className="text-xs text-red-600">{error}</p>
      ) : helperText ? (
        <p className="text-xs text-neutral-500">{helperText}</p>
      ) : null}
    </div>
  )
}
