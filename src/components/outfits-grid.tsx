"use client"

import { useEffect, useState } from "react"
import type { ClothingItem, Outfit } from "../app"
import PrimaryButton from "./primary-button"
import { getSupabaseBrowser } from "../lib/supabase/browser-client"

export function OutfitsGrid({ 
  outfits, 
  items,
  onSelect, 
  onRemove 
}: {
  outfits: Outfit[]
  items: ClothingItem[]
  onSelect: (outfit: Outfit) => void
  onRemove: (outfit: Outfit) => void
}) {
  const [deletingOutfits, setDeletingOutfits] = useState<Set<string>>(new Set())
  
  const handleRemove = async (outfit: Outfit) => {
    if (deletingOutfits.has(outfit.id)) return // Prevent multiple clicks
    
    console.log('[Delete] Outfit × click', { id: outfit.id })
    setDeletingOutfits(prev => new Set([...prev, outfit.id]))
    
    try {
      await onRemove(outfit)
    } finally {
      // Clear the deleting state regardless of success/failure
      setDeletingOutfits(prev => {
        const newSet = new Set(prev)
        newSet.delete(outfit.id)
        return newSet
      })
    }
  }

  // Group outfits by date
  const groupedOutfits = outfits.reduce((acc, outfit) => {
    const date = new Date(outfit.createdAt).toDateString()
    if (!acc[date]) {
      acc[date] = []
    }
    acc[date].push(outfit)
    return acc
  }, {} as Record<string, Outfit[]>)

  const sortedDates = Object.keys(groupedOutfits).sort((a, b) => 
    new Date(b).getTime() - new Date(a).getTime()
  )

  if (outfits.length === 0) {
    return (
      <div className="flex items-center gap-3 p-6 border rounded-2xl bg-neutral-50">
        <div className="h-12 w-12 rounded-xl border flex items-center justify-center text-xl" aria-hidden>
          {"👔"}
        </div>
        <div className="text-neutral-600">
          <div>No saved outfits yet.</div>
          <div className="text-sm mt-1">Generate and save your first outfit to see it here!</div>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {sortedDates.map((date) => (
        <div key={date} className="space-y-3">
          <h3 className="text-sm font-medium text-neutral-700">
            {new Date(date).toLocaleDateString(undefined, { 
              weekday: 'long', 
              month: 'short', 
              day: 'numeric' 
            })}
          </h3>
          <div className="grid grid-cols-1 gap-3">
            {groupedOutfits[date].map((outfit) => {
              const outfitItems = outfit.itemIds
                .map(id => items.find(item => item.id === id))
                .filter(Boolean) as ClothingItem[]
              
              return (
                <OutfitGridCard
                  key={outfit.id}
                  outfit={outfit}
                  items={outfitItems}
                  onSelect={() => onSelect(outfit)}
                  onRemove={() => handleRemove(outfit)}
                  isDeleting={deletingOutfits.has(outfit.id)}
                />
              )
            })}
          </div>
        </div>
      ))}
    </div>
  )
}

function OutfitGridCard({
  outfit,
  items,
  onSelect,
  onRemove,
  isDeleting,
}: {
  outfit: Outfit
  items: ClothingItem[]
  onSelect: () => void
  onRemove: () => void
  isDeleting: boolean
}) {
  return (
    <div 
      className="border rounded-2xl p-3 space-y-3 hover:shadow-sm transition cursor-pointer"
      onClick={onSelect}
    >
      <div className="flex justify-between items-start">
        <div className="min-w-0 flex-1">
          <div className="text-sm font-medium text-neutral-900 mb-1">
            {outfit.title || outfit.request || "Outfit"}
          </div>
        </div>
        <div className="ml-3">
          <button
            onClick={(e) => {
              e.stopPropagation() // Prevent triggering card click
              onRemove()
            }}
            disabled={isDeleting}
            className="text-xs text-red-600 hover:text-red-700 transition disabled:opacity-50"
          >
            {isDeleting ? "..." : "×"}
          </button>
        </div>
      </div>
      
      <div className="flex gap-2 overflow-x-auto">
        {items.slice(0, 4).map((item) => (
          <OutfitItemThumb key={item.id} item={item} />
        ))}
        {items.length > 4 && (
          <div className="h-12 w-12 rounded-xl border flex items-center justify-center bg-neutral-100 text-xs text-neutral-600 shrink-0">
            +{items.length - 4}
          </div>
        )}
      </div>
      
      <p className="text-xs text-neutral-600 line-clamp-2">{outfit.rationale}</p>
    </div>
  )
}

function OutfitItemThumb({ item }: { item: ClothingItem }) {
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
        className="h-12 w-12 rounded-xl object-cover border shrink-0"
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
    <div className="h-12 w-12 rounded-xl border flex items-center justify-center bg-neutral-200 shrink-0">
      <span className="text-xs font-semibold text-neutral-700">{initials || "?"}</span>
    </div>
  )
}