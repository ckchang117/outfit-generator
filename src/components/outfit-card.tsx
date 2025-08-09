"use client"
import PrimaryButton from "./primary-button"
import type { ClothingItem } from "../app"

export default function OutfitCard({
  items,
  rationale,
  onSave,
}: {
  items: ClothingItem[]
  rationale: string
  onSave: () => void
}) {
  return (
    <div className="border rounded-2xl p-3 space-y-3 hover:shadow-sm transition">
      <div className="flex gap-3 overflow-x-auto">
        {items.map((it) => (
          <div key={it.id} className="flex items-center gap-2 min-w-[12rem]">
            <Thumb item={it} />
            <div className="min-w-0">
              <div className="text-sm font-medium text-neutral-900 truncate">{it.name}</div>
              <div className="text-xs text-neutral-600 truncate">
                {it.category} • {it.color || "—"}
              </div>
            </div>
          </div>
        ))}
      </div>
      <p className="text-sm text-neutral-700">{rationale}</p>
      <div>
        <PrimaryButton onClick={onSave}>Save</PrimaryButton>
      </div>
    </div>
  )
}

function Thumb({ item }: { item: ClothingItem }) {
  const size = "h-16 w-16 md:h-20 md:w-20"
  if (item.photoUrl) {
    return (
      <img
        src={item.photoUrl || "/placeholder.svg"}
        alt={item.name}
        className={`${size} rounded-xl object-cover border`}
      />
    )
  }
  const initials = item.name
    .split(" ")
    .map((w) => w[0])
    .join("")
    .slice(0, 2)
    .toUpperCase()

  const bg = item.color?.toLowerCase().includes("white")
    ? "bg-white"
    : item.color?.toLowerCase().includes("black")
      ? "bg-neutral-900"
      : "bg-neutral-200"

  const text = item.color?.toLowerCase().includes("black") ? "text-white" : "text-neutral-700"

  return (
    <div className={`${size} rounded-xl border flex items-center justify-center ${bg}`}>
      <span className={`text-sm font-semibold ${text}`}>{initials || "?"}</span>
    </div>
  )
}
