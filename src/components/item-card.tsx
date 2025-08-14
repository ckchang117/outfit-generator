import type { ClothingItem } from "../app"
import { getSupabaseBrowser } from "../lib/supabase/browser-client"
import { useEffect, useState } from "react"

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
        {item.notes ? <div className="text-xs text-neutral-600 truncate">{item.notes}</div> : null}
        {friendlyDate ? <div className="text-[11px] text-neutral-500 mt-0.5">{friendlyDate}</div> : null}
      </div>
    </div>
  )
}

function Thumb({ item }: { item: ClothingItem }) {
  const size = "h-16 w-16 md:h-20 md:w-20"
  const [src, setSrc] = useState<string | null>(null)

  useEffect(() => {
    let revoked: string | null = null
    ;(async () => {
      const path = item.photoUrl
      if (!path) return
      const sb = getSupabaseBrowser()
      if (!sb) return
      try {
        if (/^https?:\/\//i.test(path)) {
          setSrc(path)
          return
        }
        const { data, error } = await sb.storage.from("item-photos").createSignedUrl(path, 60)
        if (!error && data?.signedUrl) setSrc(data.signedUrl)
        if (error) console.warn("createSignedUrl error:", error)
      } catch {
        // ignore
      }
      return () => {
        if (revoked) URL.revokeObjectURL(revoked)
      }
    })()
  }, [item.photoUrl])

  if (src) {
    return <img src={src} alt={item.name} className={`${size} rounded-xl object-cover border`} />
  }
  const initials = item.name
    .split(" ")
    .map((w) => w[0])
    .join("")
    .slice(0, 2)
    .toUpperCase()

  return (
    <div
      className={`${size} rounded-xl border flex items-center justify-center bg-neutral-200`}
      aria-label={`${item.name} placeholder`}
    >
      <span className="text-sm font-semibold text-neutral-700">{initials || "?"}</span>
    </div>
  )
}
