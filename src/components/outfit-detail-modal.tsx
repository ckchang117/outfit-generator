"use client"

import { useEffect, useState } from "react"
import type { ClothingItem, Outfit } from "../app"
import PrimaryButton from "./primary-button"
import { getSupabaseBrowser } from "../lib/supabase/browser-client"
import { ImageModal } from "./image-modal"

export function OutfitDetailModal({
  outfit,
  items,
  onClose,
  onRemove,
}: {
  outfit: Outfit | null
  items: ClothingItem[]
  onClose: () => void
  onRemove?: (outfit: Outfit) => void
}) {
  const [isRemoving, setIsRemoving] = useState(false)
  const [selectedImageItem, setSelectedImageItem] = useState<ClothingItem | null>(null)
  const [selectedPhotoIndex, setSelectedPhotoIndex] = useState(0)

  useEffect(() => {
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose()
    }
    if (outfit) {
      document.addEventListener("keydown", handleEsc)
      return () => document.removeEventListener("keydown", handleEsc)
    }
  }, [outfit, onClose])

  if (!outfit) return null

  const outfitItems = outfit.itemIds
    .map(id => items.find(item => item.id === id))
    .filter(Boolean) as ClothingItem[]

  const handleRemove = async () => {
    if (!onRemove || isRemoving) return
    setIsRemoving(true)
    try {
      await onRemove(outfit)
      onClose()
    } finally {
      setIsRemoving(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
        <div className="p-6">
          {/* Header */}
          <div className="flex justify-between items-start mb-6">
            <div>
              <h2 className="text-xl font-semibold text-neutral-900 mb-2">
                {outfit.title || outfit.request || "Outfit"}
              </h2>
              <div className="text-xs text-neutral-500">
                {new Date(outfit.createdAt).toLocaleDateString(undefined, {
                  weekday: 'long',
                  month: 'short',
                  day: 'numeric',
                  hour: 'numeric',
                  minute: '2-digit'
                })}
              </div>
            </div>
            <button
              onClick={onClose}
              className="text-neutral-400 hover:text-neutral-600 text-2xl leading-none"
            >
              ×
            </button>
          </div>

          {/* Outfit Items */}
          <div className="space-y-4 mb-6">
            <h3 className="text-lg font-medium text-neutral-900">Items ({outfitItems.length})</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {outfitItems.map((item) => (
                <OutfitItemCard 
                  key={item.id} 
                  item={item} 
                  onClick={() => {
                    setSelectedImageItem(item)
                    setSelectedPhotoIndex(0)
                  }}
                />
              ))}
            </div>
          </div>

          {/* Rationale */}
          {outfit.rationale && (
            <div className="space-y-2 mb-6">
              <h3 className="text-lg font-medium text-neutral-900">Styling Notes</h3>
              <p className="text-sm text-neutral-700 leading-relaxed">
                {outfit.rationale}
              </p>
            </div>
          )}

          {/* Actions */}
          <div className="flex gap-3 pt-4 border-t">
            <PrimaryButton variant="ghost" onClick={onClose} className="flex-1">
              Close
            </PrimaryButton>
            {onRemove && (
              <PrimaryButton
                variant="ghost"
                onClick={handleRemove}
                disabled={isRemoving}
                className="text-red-600 hover:text-red-700 border-red-200 hover:border-red-300"
              >
                {isRemoving ? "Removing..." : "Delete Outfit"}
              </PrimaryButton>
            )}
          </div>
        </div>
      </div>

      {/* Image Modal */}
      <ImageModal
        item={selectedImageItem}
        photoIndex={selectedPhotoIndex}
        onClose={() => {
          setSelectedImageItem(null)
          setSelectedPhotoIndex(0)
        }}
        onPrevious={selectedImageItem && selectedImageItem.photoUrls && selectedImageItem.photoUrls.length > 1 ? () => {
          setSelectedPhotoIndex(prev => prev > 0 ? prev - 1 : 0)
        } : undefined}
        onNext={selectedImageItem && selectedImageItem.photoUrls && selectedImageItem.photoUrls.length > 1 ? () => {
          setSelectedPhotoIndex(prev => 
            selectedImageItem.photoUrls && prev < selectedImageItem.photoUrls.length - 1 ? prev + 1 : prev
          )
        } : undefined}
      />
    </div>
  )
}

function OutfitItemCard({ item, onClick }: { item: ClothingItem; onClick?: () => void }) {
  const [src, setSrc] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    let canceled = false
    setIsLoading(true)
    
    ;(async () => {
      const path = item.photoUrl
      if (!path) {
        setIsLoading(false)
        return
      }
      
      const sb = getSupabaseBrowser()
      if (!sb) {
        setIsLoading(false)
        return
      }
      
      try {
        if (/^https?:\/\//i.test(path)) {
          if (!canceled) {
            setSrc(path)
            setIsLoading(false)
          }
          return
        }
        
        const { data, error } = await sb.storage.from("item-photos").createSignedUrl(path, 3600)
        if (!error && data?.signedUrl && !canceled) {
          setSrc(data.signedUrl)
        }
      } catch (error) {
        console.warn("Failed to load image:", error)
      } finally {
        if (!canceled) setIsLoading(false)
      }
    })()
    
    return () => {
      canceled = true
    }
  }, [item.photoUrl])

  return (
    <div className="border rounded-xl p-3 space-y-3">
      <div className="aspect-square rounded-lg overflow-hidden bg-neutral-100">
        {isLoading ? (
          <div className="w-full h-full flex items-center justify-center">
            <div className="w-6 h-6 border-2 border-neutral-300 border-t-neutral-600 rounded-full animate-spin"></div>
          </div>
        ) : src ? (
          <img
            src={src}
            alt={item.name}
            className="w-full h-full object-cover cursor-pointer hover:opacity-90 transition-opacity"
            onClick={onClick}
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center">
            <div className="text-center">
              <div className="text-2xl mb-2">👕</div>
              <div className="text-xs text-neutral-500">No image</div>
            </div>
          </div>
        )}
      </div>
      
      <div>
        <h4 className="font-medium text-neutral-900 text-sm mb-1">{item.name}</h4>
        {item.notes && (
          <p className="text-xs text-neutral-600 line-clamp-2">{item.notes}</p>
        )}
        {item.category && (
          <div className="text-xs text-neutral-500 mt-1 capitalize">
            {item.category}
            {item.subcategory && ` • ${item.subcategory}`}
          </div>
        )}
      </div>
    </div>
  )
}