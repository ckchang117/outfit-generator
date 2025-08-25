import type { ClothingItem } from "../app"
import { useSignedUrl } from "../hooks/use-signed-url"
import { LazyImage } from "./lazy-image"

export default function ItemCard({
  item,
  friendlyDate,
}: {
  item: ClothingItem
  friendlyDate?: string
}) {
  return (
    <div className="flex items-center gap-3 p-3 border rounded-2xl hover:shadow-sm transition">
      <Thumb item={item} />
      <div className="min-w-0">
        <div className="text-sm font-medium text-neutral-900 truncate">{item.name}</div>
        {item.notes ? <div className="text-sm text-neutral-600 truncate">{item.notes}</div> : null}
        {friendlyDate ? <div className="text-xs text-neutral-500 mt-0.5">{friendlyDate}</div> : null}
      </div>
    </div>
  )
}

function Thumb({ item }: { item: ClothingItem }) {
  const size = "h-16 w-16 md:h-20 md:w-20"
  const src = useSignedUrl(item.photoUrl)

  const initials = item.name
    .split(" ")
    .map((w) => w[0])
    .join("")
    .slice(0, 2)
    .toUpperCase()

  const placeholder = (
    <div
      className={`${size} rounded-xl border flex items-center justify-center bg-neutral-200`}
      aria-label={`${item.name} placeholder`}
    >
      <span className="text-sm font-semibold text-neutral-700">{initials || "?"}</span>
    </div>
  )

  if (src) {
    return (
      <LazyImage
        src={src}
        alt={item.name}
        className={`${size} rounded-xl object-cover border`}
        placeholder={placeholder}
      />
    )
  }

  return placeholder
}
