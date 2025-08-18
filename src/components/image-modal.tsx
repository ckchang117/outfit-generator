"use client"

import { useEffect, useState } from "react"
import type { ClothingItem } from "../app"
import { getSupabaseBrowser } from "../lib/supabase/browser-client"

export function ImageModal({
  item,
  photoIndex = 0,
  onClose,
  onPrevious,
  onNext,
}: {
  item: ClothingItem | null
  photoIndex?: number
  onClose: () => void
  onPrevious?: () => void
  onNext?: () => void
}) {
  const [src, setSrc] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState(false)

  // Get all photo URLs for the item
  const photoUrls = item?.photoUrls || (item?.photoUrl ? [item.photoUrl] : [])
  const currentPhotoUrl = photoUrls[photoIndex]
  const hasMultiplePhotos = photoUrls.length > 1

  useEffect(() => {
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose()
      if (e.key === "ArrowLeft" && onPrevious) onPrevious()
      if (e.key === "ArrowRight" && onNext) onNext()
    }
    
    if (item) {
      document.addEventListener("keydown", handleEsc)
      // Prevent body scroll when modal is open
      document.body.style.overflow = "hidden"
      return () => {
        document.removeEventListener("keydown", handleEsc)
        document.body.style.overflow = "unset"
      }
    }
  }, [item, onClose, onPrevious, onNext])

  useEffect(() => {
    if (!currentPhotoUrl) {
      setIsLoading(false)
      return
    }

    let canceled = false
    setIsLoading(true)
    setError(false)
    setSrc(null)

    ;(async () => {
      try {
        // If it's already a full URL, use it directly
        if (/^https?:\/\//i.test(currentPhotoUrl)) {
          if (!canceled) {
            setSrc(currentPhotoUrl)
            setIsLoading(false)
          }
          return
        }

        // Get high-resolution signed URL from Supabase
        const sb = getSupabaseBrowser()
        if (!sb) {
          setError(true)
          setIsLoading(false)
          return
        }

        const { data, error } = await sb.storage
          .from("item-photos")
          .createSignedUrl(currentPhotoUrl, 3600) // 1 hour expiry for full-res images

        if (!error && data?.signedUrl && !canceled) {
          setSrc(data.signedUrl)
        } else if (!canceled) {
          setError(true)
        }
      } catch (err) {
        if (!canceled) {
          setError(true)
        }
      } finally {
        if (!canceled) {
          setIsLoading(false)
        }
      }
    })()

    return () => {
      canceled = true
    }
  }, [currentPhotoUrl])

  if (!item) return null

  return (
    <div 
      className="fixed inset-0 bg-black/90 flex items-center justify-center z-[60] p-4"
      onClick={onClose}
    >
      <div 
        className="relative max-w-[95vw] max-h-[95vh] w-full h-full flex items-center justify-center"
        onClick={(e) => e.stopPropagation()} // Prevent closing when clicking on content
      >
        {/* Close button */}
        <button
          onClick={onClose}
          className="absolute top-4 right-4 text-white/80 hover:text-white text-3xl leading-none z-10 bg-black/20 rounded-full w-10 h-10 flex items-center justify-center backdrop-blur-sm"
        >
          ×
        </button>

        {/* Image navigation - Previous */}
        {hasMultiplePhotos && onPrevious && photoIndex > 0 && (
          <button
            onClick={onPrevious}
            className="absolute left-4 top-1/2 -translate-y-1/2 text-white/80 hover:text-white text-2xl z-10 bg-black/20 rounded-full w-12 h-12 flex items-center justify-center backdrop-blur-sm"
          >
            ←
          </button>
        )}

        {/* Image navigation - Next */}
        {hasMultiplePhotos && onNext && photoIndex < photoUrls.length - 1 && (
          <button
            onClick={onNext}
            className="absolute right-4 top-1/2 -translate-y-1/2 text-white/80 hover:text-white text-2xl z-10 bg-black/20 rounded-full w-12 h-12 flex items-center justify-center backdrop-blur-sm"
          >
            →
          </button>
        )}

        {/* Image container */}
        <div className="relative w-full h-full flex items-center justify-center">
          {isLoading && (
            <div className="flex flex-col items-center text-white/80">
              <div className="w-8 h-8 border-2 border-white/30 border-t-white/80 rounded-full animate-spin mb-4"></div>
              <div className="text-sm">Loading image...</div>
            </div>
          )}

          {error && !isLoading && (
            <div className="flex flex-col items-center text-white/80">
              <div className="text-6xl mb-4">📷</div>
              <div className="text-lg font-medium mb-2">Unable to load image</div>
              <div className="text-sm text-white/60">The image could not be displayed</div>
            </div>
          )}

          {src && !isLoading && !error && (
            <img
              src={src}
              alt={item.name}
              className="max-w-full max-h-full object-contain rounded-lg shadow-2xl"
              onError={() => setError(true)}
            />
          )}
        </div>

        {/* Image info bar */}
        <div className="absolute bottom-4 left-4 right-4 bg-black/20 backdrop-blur-sm rounded-lg p-3 text-white">
          <div className="flex justify-between items-center">
            <div>
              <h3 className="font-medium text-lg">{item.name}</h3>
              {item.category && (
                <p className="text-sm text-white/80 capitalize">
                  {item.category}
                  {item.subcategory && ` • ${item.subcategory}`}
                </p>
              )}
            </div>
            {hasMultiplePhotos && (
              <div className="text-sm text-white/80">
                {photoIndex + 1} of {photoUrls.length}
              </div>
            )}
          </div>
          {item.notes && (
            <p className="text-sm text-white/90 mt-2 line-clamp-2">{item.notes}</p>
          )}
        </div>

        {/* Photo dots indicator for multiple photos */}
        {hasMultiplePhotos && (
          <div className="absolute bottom-20 left-1/2 -translate-x-1/2 flex gap-2">
            {photoUrls.map((_, index) => (
              <div
                key={index}
                className={`w-2 h-2 rounded-full transition-colors ${
                  index === photoIndex ? "bg-white" : "bg-white/40"
                }`}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}