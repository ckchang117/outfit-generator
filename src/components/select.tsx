"use client"

import type React from "react"
import { cn } from "../utils/cn"

type Option = { value: string; label: string }

type Props = {
  id: string
  label?: string
  value: string
  onChange: React.ChangeEventHandler<HTMLSelectElement>
  options: Option[]
  placeholder?: string
  error?: string
  className?: string
}

export default function Select({ id, label, value, onChange, options, placeholder, error, className }: Props) {
  return (
    <div className={cn("grid gap-1.5", className)}>
      {label ? (
        <label htmlFor={id} className="text-xs font-medium text-neutral-700">
          {label}
        </label>
      ) : null}
      <select
        id={id}
        value={value}
        onChange={onChange}
        className={cn(
          "w-full rounded-lg border bg-white px-3 py-2 text-sm text-neutral-900 shadow-sm focus:outline-none focus:ring-2 focus:ring-neutral-400 focus:border-neutral-400",
          error && "border-red-500 focus:ring-red-500",
        )}
      >
        {placeholder ? <option value="">{placeholder}</option> : null}
        {options.map((opt) => (
          <option key={opt.value} value={opt.value}>
            {opt.label}
          </option>
        ))}
      </select>
      {error ? <p className="text-xs text-red-600">{error}</p> : null}
    </div>
  )
}
