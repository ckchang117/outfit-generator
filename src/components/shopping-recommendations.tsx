"use client"

import type React from "react"
import { useState, useEffect } from "react"
import type { ClothingItem } from "../app"
import { ImageModal } from "./image-modal"
import { getSupabaseBrowser, getCurrentSession } from "../lib/supabase/browser-client"

interface ShoppingRecommendation {
  item_type: string
  specifications: string
  rationale: string
  search_query: string
  budget_range: string
  priority: string
  outfit_impact: number
  pair_with_ids?: string[]
}

interface Props {
  recommendations: ShoppingRecommendation[]
  items?: ClothingItem[]
  className?: string
}

export default function ShoppingRecommendations({ recommendations, items = [], className = "" }: Props) {
  const [selectedItem, setSelectedItem] = useState<ClothingItem | null>(null)
  const [selectedPhotoIndex, setSelectedPhotoIndex] = useState(0)
  
  if (!recommendations || recommendations.length === 0) {
    return null
  }

  const getPriorityColor = (priority: string) => {
    switch (priority.toLowerCase()) {
      case 'essential':
        return 'bg-red-100 text-red-800 border-red-200'
      case 'recommended':
        return 'bg-yellow-100 text-yellow-800 border-yellow-200'
      case 'nice-to-have':
        return 'bg-green-100 text-green-800 border-green-200'
      default:
        return 'bg-gray-100 text-gray-800 border-gray-200'
    }
  }


  // Sort recommendations by priority (essential first, then recommended, then nice-to-have)
  // Secondary sort by outfit impact for same priority items
  const getPriorityOrder = (priority: string) => {
    switch (priority.toLowerCase()) {
      case 'essential': return 1
      case 'recommended': return 2
      case 'nice-to-have': return 3
      default: return 4
    }
  }

  const sortedRecommendations = [...recommendations].sort((a, b) => {
    const priorityDiff = getPriorityOrder(a.priority) - getPriorityOrder(b.priority)
    if (priorityDiff !== 0) return priorityDiff
    
    // Secondary sort by outfit impact (higher impact first)
    return b.outfit_impact - a.outfit_impact
  })

  return (
    <div className={`space-y-4 ${className}`}>
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold text-neutral-900">
          Shopping Intelligence
        </h3>
        <span className="text-sm text-neutral-500">
          {recommendations.length} recommendation{recommendations.length !== 1 ? 's' : ''}
        </span>
      </div>
      
      <div className="space-y-3">
        {sortedRecommendations.map((rec, index) => (
          <div 
            key={index}
            className="border rounded-xl p-4 bg-white shadow-sm hover:shadow-md transition-shadow duration-200"
          >
            <div className="flex items-start justify-between mb-2">
              <div className="flex-1">
                <h4 className="font-medium text-neutral-900 mb-1">
                  {rec.item_type}
                </h4>
                <p className="text-sm text-neutral-600 mb-2">
                  {rec.specifications}
                </p>
              </div>
              <div className="flex flex-col items-end gap-2 ml-4">
                <span className={`px-2 py-1 rounded-full text-xs font-medium border ${getPriorityColor(rec.priority)}`}>
                  {rec.priority}
                </span>
              </div>
            </div>
            
            <p className="text-sm text-neutral-700 mb-3">
              {rec.rationale}
            </p>
            
            <div className="flex items-center justify-between pt-2 border-t border-neutral-100">
              <div className="flex items-center gap-4">
                <span className="text-xs text-neutral-500">
                  Budget: {rec.budget_range}
                </span>
              </div>
              <button
                onClick={() => {
                  const searchUrl = `https://www.google.com/search?q=${encodeURIComponent(rec.search_query)}&tbm=shop`
                  window.open(searchUrl, '_blank')
                }}
                className="text-sm bg-neutral-900 text-white px-3 py-1.5 rounded-md hover:bg-neutral-800 hover:scale-105 transition-all duration-200"
              >
                Shop Now
              </button>
            </div>
            
            {/* Pair With section */}
            {rec.pair_with_ids && rec.pair_with_ids.length > 0 && items.length > 0 && (
              <div className="mt-3 pt-3 border-t border-neutral-100">
                <div className="text-xs font-medium text-neutral-600 mb-2">Pair With:</div>
                <div className="flex gap-2 flex-wrap">
                  {rec.pair_with_ids
                    .map(id => items.find(item => item.id === id))
                    .filter(Boolean)
                    .slice(0, 3)
                    .map((item) => (
                      <button
                        key={item!.id}
                        onClick={() => {
                          setSelectedItem(item!)
                          setSelectedPhotoIndex(0)
                        }}
                        className="group flex flex-col items-center p-2 rounded-lg hover:bg-neutral-50 transition-colors"
                      >
                        {/* Thumbnail */}
                        <PairWithThumbnail item={item!} />
                        {/* Item name */}
                        <span className="text-xs text-neutral-700 text-center line-clamp-2 max-w-[64px]">
                          {item!.name}
                        </span>
                      </button>
                    ))
                  }
                </div>
              </div>
            )}
          </div>
        ))}
      </div>
      
      <div className="text-xs text-neutral-500 bg-neutral-50 p-3 rounded-md">
        💡 These recommendations are based on your current wardrobe and the outfits you're trying to create. 
        Items are suggested to maximize your outfit possibilities and work well with your existing pieces.
      </div>
      
      {/* Image Modal */}
      {selectedItem && (
        <ImageModal
          item={selectedItem}
          photoIndex={selectedPhotoIndex}
          onClose={() => {
            setSelectedItem(null)
            setSelectedPhotoIndex(0)
          }}
          onPrevious={
            selectedItem.photoUrls && selectedItem.photoUrls.length > 1 && selectedPhotoIndex > 0
              ? () => setSelectedPhotoIndex(prev => Math.max(0, prev - 1))
              : undefined
          }
          onNext={
            selectedItem.photoUrls && selectedItem.photoUrls.length > 1 && selectedPhotoIndex < selectedItem.photoUrls.length - 1
              ? () => setSelectedPhotoIndex(prev => Math.min(selectedItem.photoUrls!.length - 1, prev + 1))
              : undefined
          }
        />
      )}
    </div>
  )
}

function PairWithThumbnail({ item }: { item: ClothingItem }) {
  const [src, setSrc] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState(false)

  useEffect(() => {
    let isMounted = true
    
    ;(async () => {
      const path = item.photoUrls?.[0] || item.photoUrl
      if (!path) {
        if (isMounted) {
          setIsLoading(false)
          setError(true)
        }
        return
      }
      
      try {
        // If it's already a full URL, use it directly
        if (/^https?:\/\//i.test(path)) {
          if (isMounted) {
            setSrc(path)
            setIsLoading(false)
          }
          return
        }
        
        const sb = getSupabaseBrowser()
        if (!sb) {
          if (isMounted) {
            setError(true)
            setIsLoading(false)
          }
          return
        }
        
        // Check if user has valid session before attempting storage operations
        const session = await getCurrentSession()
        if (!session) {
          if (isMounted) {
            setError(true)
            setIsLoading(false)
          }
          return
        }
        
        const { data, error: storageError } = await sb.storage
          .from("item-photos")
          .createSignedUrl(path, 36000) // 10 hours for thumbnails
        
        if (!storageError && data?.signedUrl && isMounted) {
          setSrc(data.signedUrl)
          setError(false)
        } else if (isMounted) {
          setError(true)
        }
      } catch (err) {
        if (isMounted) {
          setError(true)
        }
      } finally {
        if (isMounted) {
          setIsLoading(false)
        }
      }
    })()
    
    return () => {
      isMounted = false
    }
  }, [item.photoUrl, item.photoUrls])

  return (
    <div className="w-16 h-16 bg-neutral-100 rounded-md overflow-hidden mb-1 group-hover:ring-2 group-hover:ring-neutral-300 transition-all">
      {isLoading && (
        <div className="w-full h-full flex items-center justify-center text-neutral-400">
          <div className="w-4 h-4 border-2 border-neutral-300 border-t-neutral-500 rounded-full animate-spin"></div>
        </div>
      )}
      {!isLoading && src && !error && (
        <img
          src={src}
          alt={item.name}
          className="w-full h-full object-cover"
          onError={() => setError(true)}
        />
      )}
      {!isLoading && (!src || error) && (
        <div className="w-full h-full flex items-center justify-center text-neutral-400">
          <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
          </svg>
        </div>
      )}
    </div>
  )
}