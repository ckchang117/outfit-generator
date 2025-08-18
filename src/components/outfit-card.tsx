"use client"

import PrimaryButton from "./primary-button"
import type { ClothingItem } from "../app"
import { useEffect, useState } from "react"
import { getSupabaseBrowser } from "../lib/supabase/browser-client"
import { ImageModal } from "./image-modal"

export default function OutfitCard({
  items,
  rationale,
  onSave,
  isSaved = false,
  isSaving = false,
}: {
  items: ClothingItem[]
  rationale: string
  onSave: () => void
  isSaved?: boolean
  isSaving?: boolean
}) {
  const [selectedItem, setSelectedItem] = useState<ClothingItem | null>(null)
  const [selectedPhotoIndex, setSelectedPhotoIndex] = useState(0)
  return (
    <div className="border rounded-2xl p-3 space-y-3 hover:shadow-sm transition">
      <div className="flex gap-3 overflow-x-auto">
        {items.map((it) => (
          <div 
            key={it.id} 
            className="flex items-center gap-2 min-w-[12rem] cursor-pointer hover:opacity-80 transition-opacity rounded-lg p-1 hover:bg-neutral-50"
            onClick={() => {
              setSelectedItem(it)
              setSelectedPhotoIndex(0)
            }}
          >
            <Thumb item={it} />
            <div className="min-w-0">
              <div className="text-sm font-medium text-neutral-900 truncate">{it.name}</div>
              {it.notes ? <div className="text-xs text-neutral-600 truncate">{it.notes}</div> : null}
            </div>
          </div>
        ))}
      </div>
      <p className="text-sm text-neutral-700">{rationale}</p>
      <div>
        <PrimaryButton 
          onClick={onSave}
          disabled={isSaved || isSaving}
          variant={isSaved ? "ghost" : "primary"}
          className={isSaved ? "text-neutral-500 border-neutral-200" : ""}
        >
          {isSaving ? "Saving..." : isSaved ? "Saved" : "Save"}
        </PrimaryButton>
      </div>

      {/* Image Modal */}
      <ImageModal
        item={selectedItem}
        photoIndex={selectedPhotoIndex}
        onClose={() => {
          setSelectedItem(null)
          setSelectedPhotoIndex(0)
        }}
        onNext={() => {
          if (selectedItem?.photoUrls) {
            const totalPhotos = selectedItem.photoUrls.length || (selectedItem.photoUrl ? 1 : 0)
            setSelectedPhotoIndex(prev => (prev + 1) % totalPhotos)
          }
        }}
        onPrevious={() => {
          if (selectedItem?.photoUrls) {
            const totalPhotos = selectedItem.photoUrls.length || (selectedItem.photoUrl ? 1 : 0)
            setSelectedPhotoIndex(prev => (prev - 1 + totalPhotos) % totalPhotos)
          }
        }}
      />
    </div>
  )
}

function Thumb({ item }: { item: ClothingItem }) {
  const size = "h-16 w-16 md:h-20 md:w-20"
  const [src, setSrc] = useState<string | null>(null)

  useEffect(() => {
    let canceled = false
    ;(async () => {
      const path = item.photoUrl
      if (!path) return
      const sb = getSupabaseBrowser()
      if (!sb) return
      try {
        if (/^https?:\/\//i.test(path)) {
          if (!canceled) setSrc(path)
          return
        }
        const { data, error } = await sb.storage.from("item-photos").createSignedUrl(path, 300)
        if (!error && data?.signedUrl && !canceled) setSrc(data.signedUrl)
      } catch {}
    })()
    return () => {
      canceled = true
    }
  }, [item.photoUrl])

  if (src) {
    return (
      <img
        src={src}
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

  return (
    <div className={`${size} rounded-xl border flex items-center justify-center bg-neutral-200`}>
      <span className="text-sm font-semibold text-neutral-700">{initials || "?"}</span>
    </div>
  )
}
