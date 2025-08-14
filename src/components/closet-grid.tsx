"use client"

import { useEffect, useState } from "react"
import type { ClothingItem } from "../app"
import PrimaryButton from "./primary-button"
import { getSupabaseBrowser, getCurrentSession } from "../lib/supabase/browser-client"

export function ClosetGrid({ items, onSelect, onRemove }: {
  items: ClothingItem[]
  onSelect: (item: ClothingItem) => void
  onRemove: (item: ClothingItem) => void
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
  if (items.length === 0) {
    return null
  }
  return (
    <div className="space-y-2">
      <h2 className="text-sm font-medium text-neutral-700">Closet</h2>
      <div className="grid grid-cols-3 sm:grid-cols-4 gap-3">
        {items.map((item) => (
          <button
            key={item.id}
            onClick={() => onSelect(item)}
            className="group relative rounded-xl border overflow-hidden bg-white hover:shadow-sm transition"
            title={`${item.name}${item.notes ? ` — ${item.notes}` : ""}`}
          >
            <Thumb item={item} />
            <div className="absolute inset-x-0 bottom-0 px-2 py-1 bg-gradient-to-t from-black/50 to-transparent">
              <div className="text-[11px] font-medium text-white truncate text-left">{item.name}</div>
            </div>
            <div className="absolute top-1 right-1 opacity-100 transition">
              <span
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
              >
                {deletingItems.has(item.id) ? '⏳' : '×'}
              </span>
            </div>
          </button>
        ))}
      </div>
    </div>
  )
}

function Thumb({ item }: { item: ClothingItem }) {
  const size = "aspect-square w-full"
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
        const { data, error } = await sb.storage.from("item-photos").createSignedUrl(path, 300)
        if (!error && data?.signedUrl) setSrc(data.signedUrl)
      } catch {}
      return () => {
        if (revoked) URL.revokeObjectURL(revoked)
      }
    })()
  }, [item.photoUrl])

  if (src) {
    return <img src={src} alt={item.name} className={`${size} object-cover`} />
  }
  return <div className={`${size} bg-neutral-100 flex items-center justify-center text-neutral-400 text-xs`}>No photo</div>
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
  const [src, setSrc] = useState<string | null>(null)
  useEffect(() => {
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
        const { data } = await sb.storage.from("item-photos").createSignedUrl(path, 600)
        if (data?.signedUrl) setSrc(data.signedUrl)
      } catch {}
    })()
  }, [item.photoUrl])
  return src ? (
    <img src={src} alt={item.name} className="w-full rounded-xl border object-cover" />
  ) : (
    <div className="w-full h-48 rounded-xl border bg-neutral-100 flex items-center justify-center text-neutral-400 text-sm">No photo</div>
  )
}

