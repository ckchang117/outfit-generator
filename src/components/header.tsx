import type React from "react"

export default function Header({
  title,
  subtitle,
  right,
}: {
  title: string
  subtitle?: string
  right?: React.ReactNode
}) {
  return (
    <div className="flex items-center justify-between py-4">
      <div className="min-w-0">
        <h1 className="text-xl font-semibold tracking-tight text-neutral-900">{title}</h1>
        {subtitle ? <p className="text-xs text-neutral-500 mt-0.5">{subtitle}</p> : null}
      </div>
      {right ? <div className="ml-4">{right}</div> : null}
    </div>
  )
}
