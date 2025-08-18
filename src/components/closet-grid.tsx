"use client"

import { useEffect, useState } from "react"
import type { ClothingItem } from "../app"
import PrimaryButton from "./primary-button"
import { getSupabaseBrowser, getCurrentSession } from "../lib/supabase/browser-client"

export function ClosetGrid({ items, onSelect, onRemove, onEdit }: {
  items: ClothingItem[]
  onSelect: (item: ClothingItem) => void
  onRemove: (item: ClothingItem) => void
  onEdit?: (item: ClothingItem) => void
}) {
  const [deletingItems, setDeletingItems] = useState<Set<string>>(new Set())
  
  const handleRemove = async (item: ClothingItem) => {
    if (deletingItems.has(item.id)) return // Prevent multiple clicks
    
    console.log('[Delete] Grid × click', { id: item.id })
    setDeletingItems(prev => new Set([...prev, item.id]))
    
    try {
      await onRemove(item)
    } finally {
      // Clear the deleting state regardless of success/failure
      setDeletingItems(prev => {
        const newSet = new Set(prev)
        newSet.delete(item.id)
        return newSet
      })
    }
  }

  // Group items by category
  const categorizedItems = items.reduce((acc, item) => {
    const category = item.category || 'other'
    if (!acc[category]) {
      acc[category] = []
    }
    acc[category].push(item)
    return acc
  }, {} as Record<string, ClothingItem[]>)

  // Define category display names and order
  const categoryOrder = [
    { key: 'top', name: 'Tops' },
    { key: 'bottom', name: 'Bottoms' },
    { key: 'outerwear', name: 'Outerwear' },
    { key: 'dress', name: 'Dresses' },
    { key: 'shoes', name: 'Shoes' },
    { key: 'accessory', name: 'Accessories' },
    { key: 'bag', name: 'Bags' },
    { key: 'jewelry', name: 'Jewelry' },
    { key: 'underwear', name: 'Underwear' },
    { key: 'swimwear', name: 'Swimwear' },
    { key: 'activewear', name: 'Activewear' },
    { key: 'sleepwear', name: 'Sleepwear' },
    { key: 'other', name: 'Other' }
  ]

  // Only show categories that have items
  const categoriesWithItems = categoryOrder.filter(cat => categorizedItems[cat.key]?.length > 0)

  if (items.length === 0) {
    return null
  }

  return (
    <div className="space-y-6">
      <h2 className="text-sm font-medium text-neutral-700">Closet</h2>
      {categoriesWithItems.map(({ key, name }) => (
        <div key={key} className="space-y-2">
          <h3 className="text-xs font-medium text-neutral-600 uppercase tracking-wide">
            {name} ({categorizedItems[key].length})
          </h3>
          <div className="grid grid-cols-3 sm:grid-cols-4 gap-3">
            {categorizedItems[key].map((item) => (
              <div
                key={item.id}
                className="group relative rounded-xl border overflow-hidden bg-white hover:shadow-sm transition cursor-pointer"
                title={`${item.name}${item.notes ? ` — ${item.notes}` : ""}`}
                onClick={() => onSelect(item)}
              >
                <Thumb item={item} />
                <div className="absolute inset-x-0 bottom-0 px-2 py-1 bg-gradient-to-t from-black/50 to-transparent">
                  <div className="text-[11px] font-medium text-white truncate text-left">{item.name}</div>
                </div>
                {item.photoUrls && item.photoUrls.length > 1 && (
                  <div className="absolute top-1 left-1 bg-black/60 text-white text-xs px-1.5 py-0.5 rounded">
                    {item.photoUrls.length} photos
                  </div>
                )}
                <div className="absolute top-1 right-1 flex gap-1 opacity-100 transition">
                  {onEdit && (
                    <button
                      onClick={(e) => { 
                        e.stopPropagation()
                        onEdit(item)
                      }}
                      className="inline-flex items-center justify-center h-6 w-6 rounded-full border text-blue-600 border-blue-200 bg-white/90 hover:bg-white cursor-pointer"
                      aria-label="Edit"
                    >
                      ✏️
                    </button>
                  )}
                  <button
                    onClick={(e) => { 
                      e.stopPropagation()
                      handleRemove(item)
                    }}
                    className={`inline-flex items-center justify-center h-6 w-6 rounded-full border text-red-600 border-red-200 ${
                      deletingItems.has(item.id) 
                        ? 'bg-red-100 cursor-not-allowed opacity-50' 
                        : 'bg-white/90 hover:bg-white cursor-pointer'
                    }`}
                    aria-label="Remove"
                    disabled={deletingItems.has(item.id)}
                  >
                    {deletingItems.has(item.id) ? '⏳' : '×'}
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}

function Thumb({ item }: { item: ClothingItem }) {
  const size = "aspect-square w-full"
  const [currentIndex, setCurrentIndex] = useState(0)
  const [signedUrls, setSignedUrls] = useState<string[]>([])
  const [loading, setLoading] = useState(true)

  const photoUrls = item.photoUrls || (item.photoUrl ? [item.photoUrl] : [])
  const hasMultiplePhotos = photoUrls.length > 1

  useEffect(() => {
    const loadSignedUrls = async () => {
      if (photoUrls.length === 0) {
        setLoading(false)
        return
      }

      const sb = getSupabaseBrowser()
      if (!sb) {
        setLoading(false)
        return
      }

      try {
        const urls: string[] = []
        for (const path of photoUrls) {
          if (/^https?:\/\//i.test(path)) {
            urls.push(path)
          } else {
            const { data, error } = await sb.storage.from("item-photos").createSignedUrl(path, 300)
            if (!error && data?.signedUrl) {
              urls.push(data.signedUrl)
            }
          }
        }
        setSignedUrls(urls)
      } catch (error) {
        console.warn("Failed to load photo URLs:", error)
      } finally {
        setLoading(false)
      }
    }

    loadSignedUrls()
  }, [photoUrls])

  const nextPhoto = (e: React.MouseEvent) => {
    e.stopPropagation()
    setCurrentIndex((prev) => (prev + 1) % signedUrls.length)
  }

  const prevPhoto = (e: React.MouseEvent) => {
    e.stopPropagation()
    setCurrentIndex((prev) => (prev - 1 + signedUrls.length) % signedUrls.length)
  }

  if (loading) {
    return <div className={`${size} bg-neutral-100 flex items-center justify-center text-neutral-400 text-xs`}>Loading...</div>
  }

  if (signedUrls.length === 0) {
    return <div className={`${size} bg-neutral-100 flex items-center justify-center text-neutral-400 text-xs`}>No photo</div>
  }

  return (
    <div className="relative w-full aspect-square">
      <img 
        src={signedUrls[currentIndex]} 
        alt={item.name} 
        className={`${size} object-cover`} 
      />
      
      {hasMultiplePhotos && (
        <>
          {/* Previous Button */}
          <button
            onClick={prevPhoto}
            className="absolute left-1 top-1/2 -translate-y-1/2 bg-black/60 text-white rounded-full w-6 h-6 flex items-center justify-center text-xs opacity-0 group-hover:opacity-100 transition-opacity"
            aria-label="Previous photo"
          >
            ‹
          </button>
          
          {/* Next Button */}
          <button
            onClick={nextPhoto}
            className="absolute right-1 top-1/2 -translate-y-1/2 bg-black/60 text-white rounded-full w-6 h-6 flex items-center justify-center text-xs opacity-0 group-hover:opacity-100 transition-opacity"
            aria-label="Next photo"
          >
            ›
          </button>

          {/* Photo indicator dots */}
          <div className="absolute bottom-1 left-1/2 -translate-x-1/2 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
            {signedUrls.map((_, index) => (
              <div
                key={index}
                className={`w-1.5 h-1.5 rounded-full ${
                  index === currentIndex ? 'bg-white' : 'bg-white/50'
                }`}
              />
            ))}
          </div>
        </>
      )}
    </div>
  )
}

export function ClosetItemModal({ item, onClose, onRemove }: {
  item: ClothingItem | null
  onClose: () => void
  onRemove: (item: ClothingItem) => void
}) {
  if (!item) return null
  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <div className="relative bg-white w-full sm:w-[440px] max-h-[90dvh] rounded-t-2xl sm:rounded-2xl shadow-lg overflow-auto">
        <div className="p-4 border-b flex items-center justify-between">
          <div className="text-base font-semibold truncate pr-3">{item.name}</div>
          <div className="inline-flex items-center gap-2">
            <PrimaryButton variant="ghost" onClick={() => onRemove(item)}>Remove</PrimaryButton>
            <PrimaryButton variant="ghost" onClick={onClose}>Close</PrimaryButton>
          </div>
        </div>
        <div className="p-4 space-y-3">
          <LargeThumb item={item} />
          {item.notes ? <div className="text-sm text-neutral-700 whitespace-pre-wrap">{item.notes}</div> : null}
        </div>
      </div>
    </div>
  )
}

function LargeThumb({ item }: { item: ClothingItem }) {
  const [currentIndex, setCurrentIndex] = useState(0)
  const [signedUrls, setSignedUrls] = useState<string[]>([])
  const [loading, setLoading] = useState(true)

  const photoUrls = item.photoUrls || (item.photoUrl ? [item.photoUrl] : [])
  const hasMultiplePhotos = photoUrls.length > 1

  useEffect(() => {
    const loadSignedUrls = async () => {
      if (photoUrls.length === 0) {
        setLoading(false)
        return
      }

      const sb = getSupabaseBrowser()
      if (!sb) {
        setLoading(false)
        return
      }

      try {
        const urls: string[] = []
        for (const path of photoUrls) {
          if (/^https?:\/\//i.test(path)) {
            urls.push(path)
          } else {
            const { data } = await sb.storage.from("item-photos").createSignedUrl(path, 600)
            if (data?.signedUrl) {
              urls.push(data.signedUrl)
            }
          }
        }
        setSignedUrls(urls)
      } catch (error) {
        console.warn("Failed to load photo URLs:", error)
      } finally {
        setLoading(false)
      }
    }

    loadSignedUrls()
  }, [photoUrls])

  const nextPhoto = () => {
    setCurrentIndex((prev) => (prev + 1) % signedUrls.length)
  }

  const prevPhoto = () => {
    setCurrentIndex((prev) => (prev - 1 + signedUrls.length) % signedUrls.length)
  }

  if (loading) {
    return (
      <div className="w-full h-48 rounded-xl border bg-neutral-100 flex items-center justify-center text-neutral-400 text-sm">
        Loading...
      </div>
    )
  }

  if (signedUrls.length === 0) {
    return (
      <div className="w-full h-48 rounded-xl border bg-neutral-100 flex items-center justify-center text-neutral-400 text-sm">
        No photo
      </div>
    )
  }

  return (
    <div className="relative group">
      <img 
        src={signedUrls[currentIndex]} 
        alt={item.name} 
        className="w-full rounded-xl border object-cover" 
      />
      
      {hasMultiplePhotos && (
        <>
          {/* Previous Button */}
          <button
            onClick={prevPhoto}
            className="absolute left-2 top-1/2 -translate-y-1/2 bg-black/60 text-white rounded-full w-8 h-8 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
            aria-label="Previous photo"
          >
            ‹
          </button>
          
          {/* Next Button */}
          <button
            onClick={nextPhoto}
            className="absolute right-2 top-1/2 -translate-y-1/2 bg-black/60 text-white rounded-full w-8 h-8 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
            aria-label="Next photo"
          >
            ›
          </button>

          {/* Photo indicator dots */}
          <div className="absolute bottom-2 left-1/2 -translate-x-1/2 flex gap-1.5 opacity-0 group-hover:opacity-100 transition-opacity">
            {signedUrls.map((_, index) => (
              <button
                key={index}
                onClick={() => setCurrentIndex(index)}
                className={`w-2 h-2 rounded-full transition-colors ${
                  index === currentIndex ? 'bg-white' : 'bg-white/50 hover:bg-white/75'
                }`}
                aria-label={`Go to photo ${index + 1}`}
              />
            ))}
          </div>

          {/* Photo counter */}
          <div className="absolute top-2 right-2 bg-black/60 text-white text-xs px-2 py-1 rounded opacity-0 group-hover:opacity-100 transition-opacity">
            {currentIndex + 1} / {signedUrls.length}
          </div>
        </>
      )}
    </div>
  )
}

