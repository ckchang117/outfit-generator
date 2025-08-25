"use client"

import { useState } from "react"
import { ClothingItem } from "../app"
import { LazyImage } from "./lazy-image"
import { useSignedUrl } from "../hooks/use-signed-url"

interface RankedItem {
  item: ClothingItem
  rank: number
  styling_note: string
}

interface PairableItemsByCategory {
  headwear: RankedItem[]
  eyewear: RankedItem[]
  tops: RankedItem[]
  bottoms: RankedItem[]
  dresses: RankedItem[]
  outerwear: RankedItem[]
  shoes: RankedItem[]
  accessories: RankedItem[]
}

interface VisualOutfitBuilderProps {
  analyzedItem: {
    category: string
    description: string
    colors: string[]
    formality: string
  }
  analyzedItemImage: string
  analyzedItemImages?: string[]  // All uploaded images for the analyzed item
  pairableItems?: ClothingItem[]  // Legacy prop for backward compatibility
  pairableItemsByCategory?: PairableItemsByCategory  // New AI-ranked structure
  onItemClick?: (item: ClothingItem) => void  // New prop for handling image clicks
  onAnalyzedItemClick?: () => void  // New prop for handling analyzed item clicks
}

// Legacy interface for backward compatibility
interface GroupedItems {
  headwear: ClothingItem[]
  eyewear: ClothingItem[]
  tops: ClothingItem[]
  bottoms: ClothingItem[]
  dresses: ClothingItem[]
  outerwear: ClothingItem[]
  shoes: ClothingItem[]
  accessories: ClothingItem[]
}

// Individual item selector with its own navigation
function CategorySlot({ 
  category,
  items,
  rankedItems,
  label,
  isAnalyzedItem = false,
  analyzedItemImage,
  analyzedItemDescription,
  className = "",
  onItemClick,
  onAnalyzedItemClick
}: {
  category: string
  items?: ClothingItem[]  // Legacy prop
  rankedItems?: RankedItem[]  // New ranked items
  label: string
  isAnalyzedItem?: boolean
  analyzedItemImage?: string
  analyzedItemDescription?: string
  className?: string
  onItemClick?: (item: ClothingItem) => void
  onAnalyzedItemClick?: () => void
}) {
  const [currentIndex, setCurrentIndex] = useState(0)
  
  // Use ranked items if available, otherwise fall back to legacy items
  const actualItems = rankedItems || (items || []).map(item => ({ item, rank: 1, styling_note: "" }))
  const currentRankedItem = actualItems[currentIndex]
  const currentItem = currentRankedItem?.item
  const signedUrl = useSignedUrl(currentItem?.photoUrl)
  
  const handlePrevious = () => {
    if (actualItems.length <= 1) return
    setCurrentIndex((prev) => (prev === 0 ? actualItems.length - 1 : prev - 1))
  }
  
  const handleNext = () => {
    if (actualItems.length <= 1) return
    setCurrentIndex((prev) => (prev + 1) % actualItems.length)
  }
  
  // If this is the analyzed item slot
  if (isAnalyzedItem && analyzedItemImage) {
    return (
      <div className={`flex flex-col items-center ${className}`}>
        <div className="relative">
          <div 
            className="border-4 border-blue-500 rounded-lg overflow-hidden w-32 h-40 shadow-lg bg-white cursor-pointer hover:border-blue-600 transition-colors"
            onClick={() => onAnalyzedItemClick?.()}
          >
            <img 
              src={analyzedItemImage} 
              alt={analyzedItemDescription} 
              className="w-full h-full object-cover"
            />
          </div>
          <div className="absolute -top-2 -right-2 bg-blue-500 text-white text-xs px-2 py-1 rounded font-semibold">
            NEW
          </div>
        </div>
        <p className="text-xs text-center mt-2 font-medium text-blue-600">Your Item</p>
      </div>
    )
  }
  
  // Empty slot with X
  if (!actualItems || actualItems.length === 0) {
    return (
      <div className={`flex flex-col items-center ${className}`}>
        <div className="border-2 border-dashed border-neutral-300 rounded-lg w-32 h-40 bg-neutral-50 flex items-center justify-center relative">
          <svg 
            className="w-12 h-12 text-neutral-300" 
            fill="none" 
            stroke="currentColor" 
            viewBox="0 0 24 24"
          >
            <path 
              strokeLinecap="round" 
              strokeLinejoin="round" 
              strokeWidth={2} 
              d="M6 18L18 6M6 6l12 12" 
            />
          </svg>
        </div>
        <p className="text-xs text-center mt-2 text-neutral-400">{label}</p>
      </div>
    )
  }
  
  // Regular item slot with navigation
  return (
    <div className={`flex flex-col items-center ${className}`}>
      <div className="flex items-center gap-2">
        {/* Left Arrow */}
        {actualItems.length > 1 && (
          <button
            onClick={handlePrevious}
            className="p-1 rounded-full hover:bg-neutral-100 transition-colors"
            aria-label={`Previous ${label}`}
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
          </button>
        )}
        
        {/* Item Display */}
        <div className="flex flex-col items-center">
          <div 
            className="border-2 border-neutral-300 rounded-lg overflow-hidden w-32 h-40 bg-white cursor-pointer hover:border-neutral-400 transition-colors"
            onClick={() => currentItem && onItemClick?.(currentItem)}
          >
            {signedUrl ? (
              <LazyImage
                src={signedUrl}
                alt={currentItem.name}
                className="w-full h-full object-cover"
              />
            ) : (
              <div className="w-full h-full flex items-center justify-center bg-neutral-50">
                <span className="text-xs text-neutral-500 text-center px-2">
                  {currentItem?.name || 'No image'}
                </span>
              </div>
            )}
          </div>
        </div>
        
        {/* Right Arrow */}
        {actualItems.length > 1 && (
          <button
            onClick={handleNext}
            className="p-1 rounded-full hover:bg-neutral-100 transition-colors"
            aria-label={`Next ${label}`}
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
          </button>
        )}
      </div>
      
      {/* Item Info */}
      <p className="text-xs text-center mt-2 max-w-32 truncate">{currentItem?.name || ''}</p>
      {actualItems.length > 1 && (
        <p className="text-xs text-center text-neutral-500">
          {currentIndex + 1} of {actualItems.length}
        </p>
      )}
      
    </div>
  )
}

export default function VisualOutfitBuilder({ 
  analyzedItem, 
  analyzedItemImage,
  analyzedItemImages,
  pairableItems,
  pairableItemsByCategory,
  onItemClick,
  onAnalyzedItemClick
}: VisualOutfitBuilderProps) {
  // Use new AI-ranked structure if available, otherwise fall back to legacy grouping
  let grouped: GroupedItems | undefined
  let rankedGrouped: PairableItemsByCategory | undefined

  if (pairableItemsByCategory) {
    // Use the AI-ranked items directly
    rankedGrouped = pairableItemsByCategory
  } else if (pairableItems) {
    // Legacy grouping logic for backward compatibility
    grouped = {
      headwear: [],
      eyewear: [],
      tops: [],
      bottoms: [],
      dresses: [],
      outerwear: [],
      shoes: [],
      accessories: []
    }
    
      pairableItems.forEach(item => {
        const category = item.category?.toLowerCase() || ''
        const subcategory = item.subcategory?.toLowerCase() || ''
        const name = item.name?.toLowerCase() || ''
        
        // For accessories, use subcategory to determine specific position
        if (category === 'accessory') {
          // Check subcategory first for proper positioning
          if (subcategory === 'hat' || subcategory === 'cap' || subcategory === 'beanie' || 
              subcategory === 'headband' || subcategory === 'headwear') {
            grouped!.headwear.push(item)
          } else if (subcategory === 'sunglasses' || subcategory === 'glasses' || 
                     subcategory === 'eyewear') {
            grouped!.eyewear.push(item)
          } else {
            // Other accessories (belts, scarves, ties, bags, watches, etc.) go to the right position
            grouped!.accessories.push(item)
          }
        } 
        // Handle non-accessory categories normally
        else if (category === 'top') {
          grouped!.tops.push(item)
        } else if (category === 'bottom') {
          grouped!.bottoms.push(item)
        } else if (category === 'dress') {
          grouped!.dresses.push(item)
        } else if (category === 'outerwear') {
          grouped!.outerwear.push(item)
        } else if (category === 'shoes') {
          grouped!.shoes.push(item)
        }
        // Fallback: check name for items that might be miscategorized
        else if (!category || category === 'other') {
          if (name.includes('hat') || name.includes('cap') || name.includes('beanie')) {
            grouped!.headwear.push(item)
          } else if (name.includes('sunglasses') || name.includes('glasses')) {
            grouped!.eyewear.push(item)
          }
        }
      })
    }
  
  // Determine where the analyzed item should appear
  const analyzedCategory = analyzedItem.category?.toLowerCase() || ''
  const analyzedSubcategory = (analyzedItem as any).subcategory?.toLowerCase() || ''
  
  // Helper to check if analyzed item belongs in a specific position
  const isAnalyzedItemInPosition = (position: string) => {
    if (analyzedCategory === 'accessory') {
      if (position === 'headwear') {
        return analyzedSubcategory === 'hat' || analyzedSubcategory === 'cap' || 
               analyzedSubcategory === 'beanie' || analyzedSubcategory === 'headband'
      }
      if (position === 'eyewear') {
        return analyzedSubcategory === 'sunglasses' || analyzedSubcategory === 'glasses'
      }
      if (position === 'accessory') {
        // Other accessories that aren't headwear or eyewear
        return !['hat', 'cap', 'beanie', 'headband', 'sunglasses', 'glasses'].includes(analyzedSubcategory)
      }
    }
    return analyzedCategory === position
  }
  
  return (
    <div className="space-y-4">
      <h3 className="text-lg font-semibold">Build Your Outfit</h3>
      
      <div className="bg-neutral-50 rounded-xl p-8">
        <div className="flex flex-col items-center space-y-6">
          
          {/* Head Area - Headwear and Eyewear */}
          <div className="flex flex-col items-center space-y-3">
            {/* Headwear */}
            {isAnalyzedItemInPosition('headwear') ? (
              <CategorySlot
                category="headwear"
                items={[]}
                rankedItems={[]}
                label="Headwear"
                isAnalyzedItem={true}
                analyzedItemImage={analyzedItemImage}
                analyzedItemDescription={analyzedItem.description}
                onAnalyzedItemClick={onAnalyzedItemClick}
              />
            ) : (
              <CategorySlot
                category="headwear"
                items={grouped?.headwear}
                rankedItems={rankedGrouped?.headwear}
                label="Headwear"
                onItemClick={onItemClick}
              />
            )}
            
            {/* Eyewear */}
            {isAnalyzedItemInPosition('eyewear') ? (
              <CategorySlot
                category="eyewear"
                items={[]}
                rankedItems={[]}
                label="Eyewear"
                isAnalyzedItem={true}
                analyzedItemImage={analyzedItemImage}
                analyzedItemDescription={analyzedItem.description}
                onAnalyzedItemClick={onAnalyzedItemClick}
              />
            ) : (
              <CategorySlot
                category="eyewear"
                items={grouped?.eyewear}
                rankedItems={rankedGrouped?.eyewear}
                label="Eyewear"
                onItemClick={onItemClick}
              />
            )}
          </div>
          
          {/* Upper Body - Outerwear, Tops/Dresses, Accessories */}
          <div className="grid grid-cols-3 gap-6 items-center justify-items-center w-full max-w-2xl mx-auto">
            {/* Outerwear (left) */}
            <div className="flex justify-center">
              {analyzedCategory === 'outerwear' ? (
                <CategorySlot
                  category="outerwear"
                  items={[]}
                  rankedItems={[]}
                  label="Outerwear"
                  isAnalyzedItem={true}
                  analyzedItemImage={analyzedItemImage}
                  analyzedItemDescription={analyzedItem.description}
                  onAnalyzedItemClick={onAnalyzedItemClick}
                />
              ) : (
                <CategorySlot
                  category="outerwear"
                  items={grouped?.outerwear}
                  rankedItems={rankedGrouped?.outerwear}
                  label="Outerwear"
                  onItemClick={onItemClick}
                />
              )}
            </div>
            
            {/* Center - Top or Dress */}
            <div className="flex justify-center">
              {analyzedCategory === 'top' ? (
                <CategorySlot
                  category="top"
                  items={[]}
                  rankedItems={[]}
                  label="Top"
                  isAnalyzedItem={true}
                  analyzedItemImage={analyzedItemImage}
                  analyzedItemDescription={analyzedItem.description}
                  onAnalyzedItemClick={onAnalyzedItemClick}
                />
              ) : analyzedCategory === 'dress' ? (
                <CategorySlot
                  category="dress"
                  items={[]}
                  rankedItems={[]}
                  label="Dress"
                  isAnalyzedItem={true}
                  analyzedItemImage={analyzedItemImage}
                  analyzedItemDescription={analyzedItem.description}
                  onAnalyzedItemClick={onAnalyzedItemClick}
                />
              ) : (rankedGrouped?.dresses.length || grouped?.dresses?.length || 0) > 0 ? (
                <CategorySlot
                  category="dress"
                  items={grouped?.dresses}
                  rankedItems={rankedGrouped?.dresses}
                  label="Dress"
                  onItemClick={onItemClick}
                />
              ) : (
                <CategorySlot
                  category="top"
                  items={grouped?.tops}
                  rankedItems={rankedGrouped?.tops}
                  label="Top"
                  onItemClick={onItemClick}
                />
              )}
            </div>
            
            {/* Accessories (right) - for non-head accessories like belts, bags, scarves */}
            <div className="flex justify-center">
              {isAnalyzedItemInPosition('accessory') ? (
                <CategorySlot
                  category="accessory"
                  items={[]}
                  rankedItems={[]}
                  label="Accessory"
                  isAnalyzedItem={true}
                  analyzedItemImage={analyzedItemImage}
                  analyzedItemDescription={analyzedItem.description}
                  onAnalyzedItemClick={onAnalyzedItemClick}
                />
              ) : (
                <CategorySlot
                  category="accessory"
                  items={grouped?.accessories}
                  rankedItems={rankedGrouped?.accessories}
                  label="Accessory"
                  onItemClick={onItemClick}
                />
              )}
            </div>
          </div>
          
          {/* Lower Body - Bottoms (skip if wearing dress) */}
          {analyzedCategory !== 'dress' && (rankedGrouped?.dresses.length || grouped?.dresses?.length || 0) === 0 && (
            analyzedCategory === 'bottom' ? (
              <CategorySlot
                category="bottom"
                items={[]}
                rankedItems={[]}
                label="Bottom"
                isAnalyzedItem={true}
                analyzedItemImage={analyzedItemImage}
                analyzedItemDescription={analyzedItem.description}
                onAnalyzedItemClick={onAnalyzedItemClick}
              />
            ) : (
              <CategorySlot
                category="bottom"
                items={grouped?.bottoms}
                rankedItems={rankedGrouped?.bottoms}
                label="Bottom"
                onItemClick={onItemClick}
              />
            )
          )}
          
          {/* Feet - Shoes */}
          {analyzedCategory === 'shoes' ? (
            <CategorySlot
              category="shoes"
              items={[]}
              rankedItems={[]}
              label="Shoes"
              isAnalyzedItem={true}
              analyzedItemImage={analyzedItemImage}
              analyzedItemDescription={analyzedItem.description}
              onAnalyzedItemClick={onAnalyzedItemClick}
            />
          ) : (
            <CategorySlot
              category="shoes"
              items={grouped?.shoes}
              rankedItems={rankedGrouped?.shoes}
              label="Shoes"
              onItemClick={onItemClick}
            />
          )}
        </div>
        
        {/* Summary */}
        <div className="mt-8 pt-4 border-t">
          <div className="text-sm text-neutral-600 text-center">
            {(pairableItems?.length || (rankedGrouped ? Object.values(rankedGrouped).reduce((acc, cat) => acc + cat.length, 0) : 0)) > 0 ? (
              <>
                <span className="text-sm text-neutral-500 mt-1">
                  Use the arrows to browse different combinations
                </span>
              </>
            ) : (
              <>No pairable items found in your wardrobe</>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}