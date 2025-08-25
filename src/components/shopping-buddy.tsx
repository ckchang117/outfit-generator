"use client"

import { useState, useRef, useCallback, useEffect } from "react"
import PrimaryButton from "./primary-button"
import { ClothingItem } from "../app"
import { getSupabaseBrowser } from "../lib/supabase/browser-client"
import VisualOutfitBuilder from "./visual-outfit-builder"
import { ImageModal } from "./image-modal"
import { LazyImage } from "./lazy-image"
import { useSignedUrl } from "../hooks/use-signed-url"

interface AnalysisResult {
  item: {
    category: string
    description: string
    colors: string[]
    style: string
    estimatedPrice: string
    formality: string
    season: string[]
  }
  compatibility: {
    score: number
    versatilityScore: number
    uniquenessScore: number
    styleCoherence: number
  }
  potentialOutfits: Array<{
    id: string
    items: ClothingItem[]
    occasion: string
    season: string
  }>
  similarOwned: ClothingItem[]
  recommendation: "buy" | "skip" | "consider"
  reasoning: {
    pros: string[]
    cons: string[]
  }
  outfitCount: number
  gapsFilled: string[]
  pairableItems?: ClothingItem[]  // New field from backend
}

interface ShoppingBuddyProps {
  items: ClothingItem[]
  onBack: () => void
}

export default function ShoppingBuddy({ items, onBack }: ShoppingBuddyProps) {
  const [capturedImages, setCapturedImages] = useState<string[]>([])
  const [isAnalyzing, setIsAnalyzing] = useState(false)
  const [analysisResult, setAnalysisResult] = useState<AnalysisResult | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [selectedImageItem, setSelectedImageItem] = useState<ClothingItem | null>(null)
  const [selectedPhotoIndex, setSelectedPhotoIndex] = useState(0)
  const [showAnalyzedItemModal, setShowAnalyzedItemModal] = useState(false)
  const [analyzedItemPhotoIndex, setAnalyzedItemPhotoIndex] = useState(0)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const handleImageCapture = useCallback(async (file: File) => {
    // Convert file to base64
    const reader = new FileReader()
    reader.onloadend = async () => {
      const base64 = reader.result as string
      setCapturedImages(prev => [...prev, base64])
      // Don't auto-analyze anymore - wait for user to click "Analyze Item"
    }
    reader.readAsDataURL(file)
  }, [])

  const analyzeImages = async () => {
    if (capturedImages.length === 0) return
    
    setIsAnalyzing(true)
    setError(null)
    
    try {
      // Get user ID
      const sb = getSupabaseBrowser()
      if (!sb) throw new Error("Not authenticated")
      
      const { data: { user } } = await sb.auth.getUser()
      if (!user) throw new Error("Not authenticated")

      const response = await fetch("/api/shopping-buddy/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          photo_urls: capturedImages, // Send all photos
          userId: user.id
        })
      })

      if (!response.ok) {
        throw new Error("Analysis failed")
      }

      const result = await response.json()
      setAnalysisResult(result)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Analysis failed")
    } finally {
      setIsAnalyzing(false)
    }
  }

  const removeImage = useCallback((index: number) => {
    setCapturedImages(prev => prev.filter((_, i) => i !== index))
  }, [])

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) {
      handleImageCapture(file)
    }
  }

  const reset = () => {
    setCapturedImages([])
    setAnalysisResult(null)
    setError(null)
    if (fileInputRef.current) {
      fileInputRef.current.value = ""
    }
  }

  const getRecommendationColor = (recommendation: string) => {
    switch (recommendation) {
      case "buy": return "text-green-600"
      case "skip": return "text-red-600"
      case "consider": return "text-yellow-600"
      default: return "text-neutral-600"
    }
  }

  const getScoreColor = (score: number) => {
    if (score >= 80) return "text-green-600"
    if (score >= 60) return "text-yellow-600"
    return "text-red-600"
  }

  // Create temporary ClothingItem object for analyzed item modal
  const analyzedItemForModal: ClothingItem | null = analysisResult ? {
    id: 'analyzed-item',
    name: analysisResult.item.description || 'Analyzed Item',
    photoUrls: capturedImages,
    photoUrl: capturedImages[0] || '',
    category: analysisResult.item.category || '',
    subcategory: '',
    createdAt: new Date().toISOString(),
    notes: '',
    userId: ''
  } : null

  const handleAnalyzedItemClick = () => {
    setShowAnalyzedItemModal(true)
    setAnalyzedItemPhotoIndex(0)
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-semibold">Shopping Buddy</h2>
        <PrimaryButton variant="ghost" onClick={onBack}>
          Back
        </PrimaryButton>
      </div>

      {capturedImages.length === 0 && !analysisResult && (
        <div className="space-y-4">
          {/* Upload Section */}
          <div className="border-2 border-dashed rounded-2xl p-8 text-center">
            <div className="space-y-4">
              <div className="text-4xl">📸</div>
              <div>
                <h3 className="font-semibold text-lg mb-2">
                  Photograph an item while shopping
                </h3>
                <p className="text-sm text-neutral-600">
                  I'll analyze how it works with your wardrobe
                </p>
              </div>
              <div className="flex gap-3 justify-center">
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  capture="environment"
                  onChange={handleFileSelect}
                  className="hidden"
                />
                <PrimaryButton
                  onClick={() => fileInputRef.current?.click()}
                  variant="primary"
                >
                  Take Photo
                </PrimaryButton>
                <PrimaryButton
                  onClick={() => {
                    if (fileInputRef.current) {
                      fileInputRef.current.capture = ""
                      fileInputRef.current.click()
                    }
                  }}
                  variant="ghost"
                >
                  Upload Photo
                </PrimaryButton>
              </div>
            </div>
          </div>

          {/* How it works */}
          <div className="bg-neutral-50 rounded-xl p-4 space-y-3">
            <h4 className="font-semibold">How it works:</h4>
            <ul className="text-sm space-y-2 text-neutral-700">
              <li className="flex gap-2">
                <span>1️⃣</span>
                <span>Photograph any clothing item you're considering</span>
              </li>
              <li className="flex gap-2">
                <span>2️⃣</span>
                <span>AI analyzes compatibility with your wardrobe</span>
              </li>
              <li className="flex gap-2">
                <span>3️⃣</span>
                <span>See how many new outfits it would create</span>
              </li>
              <li className="flex gap-2">
                <span>4️⃣</span>
                <span>Get smart buy/skip recommendations</span>
              </li>
            </ul>
          </div>
        </div>
      )}

      {/* Photo Collection State */}
      {capturedImages.length > 0 && !analysisResult && !isAnalyzing && (
        <div className="space-y-4">
          <div className="border rounded-2xl p-6">
            <div className="space-y-4">
              <div>
                <h3 className="font-semibold text-lg mb-2">
                  Photos Added ({capturedImages.length})
                </h3>
                <p className="text-sm text-neutral-600">
                  Add multiple angles for better analysis accuracy
                </p>
              </div>

              {/* Photo Grid */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                {capturedImages.map((image, index) => (
                  <div key={index} className="relative">
                    <div className="aspect-square rounded-lg overflow-hidden border-2 border-neutral-300">
                      <img 
                        src={image} 
                        alt={`Photo ${index + 1}`}
                        className="w-full h-full object-cover"
                      />
                    </div>
                    <button
                      onClick={() => removeImage(index)}
                      className="absolute -top-2 -right-2 bg-red-500 text-white rounded-full w-6 h-6 flex items-center justify-center text-sm font-bold hover:bg-red-600 transition-colors"
                    >
                      ×
                    </button>
                  </div>
                ))}
                
                {/* Add More Photos Button */}
                <button
                  onClick={() => fileInputRef.current?.click()}
                  className="aspect-square rounded-lg border-2 border-dashed border-neutral-300 flex flex-col items-center justify-center text-neutral-500 hover:border-neutral-400 hover:text-neutral-600 transition-colors"
                >
                  <div className="text-2xl mb-1">+</div>
                  <div className="text-xs">Add More</div>
                </button>
              </div>

              {/* Action Buttons */}
              <div className="flex gap-3 pt-4">
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  capture="environment"
                  onChange={handleFileSelect}
                  className="hidden"
                />
                <PrimaryButton
                  onClick={() => fileInputRef.current?.click()}
                  variant="ghost"
                >
                  Take Another Photo
                </PrimaryButton>
                <PrimaryButton
                  onClick={() => {
                    if (fileInputRef.current) {
                      fileInputRef.current.capture = ""
                      fileInputRef.current.click()
                    }
                  }}
                  variant="ghost"
                >
                  Upload Photo
                </PrimaryButton>
                <PrimaryButton
                  onClick={analyzeImages}
                  variant="primary"
                  className="ml-auto"
                >
                  Analyze Item
                </PrimaryButton>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Analyzing State */}
      {isAnalyzing && (
        <div className="border rounded-2xl p-8 text-center space-y-4">
          <div className="w-16 h-16 border-4 border-neutral-200 border-t-neutral-600 rounded-full animate-spin mx-auto"></div>
          <div>
            <h3 className="font-semibold text-lg">Analyzing item...</h3>
            <p className="text-sm text-neutral-600 mt-2">
              Checking compatibility with your complete wardrobe ({items.length} items)
            </p>
          </div>
        </div>
      )}

      {/* Analysis Results */}
      {analysisResult && !isAnalyzing && (
        <div className="space-y-6">
          {/* Visual Outfit Builder */}
          <VisualOutfitBuilder
            analyzedItem={analysisResult.item}
            analyzedItemImage={capturedImages[0] || ""}
            analyzedItemImages={capturedImages}
            pairableItems={analysisResult.pairableItems || []}  // Legacy support
            pairableItemsByCategory={analysisResult.pairableItemsByCategory}  // New AI-ranked structure
            onItemClick={(item) => {
              setSelectedImageItem(item)
              setSelectedPhotoIndex(0)
            }}
            onAnalyzedItemClick={handleAnalyzedItemClick}
          />

          {/* Compatibility Score */}
          <div className="bg-white border rounded-xl p-6 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-semibold">Compatibility Score</h3>
              <span className={`text-3xl font-bold ${getScoreColor(analysisResult.compatibility.score)}`}>
                {analysisResult.compatibility.score}/100
              </span>
            </div>

            {/* Score Breakdown */}
            <div className="space-y-2">
              <div className="flex justify-between text-sm">
                <span>Versatility</span>
                <span className="font-medium">{analysisResult.compatibility.versatilityScore}%</span>
              </div>
              <div className="flex justify-between text-sm">
                <span>Uniqueness</span>
                <span className="font-medium">{analysisResult.compatibility.uniquenessScore}%</span>
              </div>
              <div className="flex justify-between text-sm">
                <span>Style Fit</span>
                <span className="font-medium">{analysisResult.compatibility.styleCoherence}%</span>
              </div>
            </div>
          </div>

          {/* Recommendation */}
          <div className={`border-2 rounded-xl p-6 ${
            analysisResult.recommendation === "buy" ? "border-green-200 bg-green-50" :
            analysisResult.recommendation === "skip" ? "border-red-200 bg-red-50" :
            "border-yellow-200 bg-yellow-50"
          }`}>
            <h3 className={`text-lg font-semibold mb-3 ${getRecommendationColor(analysisResult.recommendation)}`}>
              {analysisResult.recommendation === "buy" ? "✅ Worth Buying!" :
               analysisResult.recommendation === "skip" ? "⚠️ Consider Skipping" :
               "🤔 Think Twice"}
            </h3>

            <div className="space-y-4">
              {analysisResult.reasoning.pros.length > 0 && (
                <div>
                  <h4 className="font-medium text-green-700 mb-2">Why to buy:</h4>
                  <ul className="text-sm space-y-1">
                    {analysisResult.reasoning.pros.map((pro, i) => (
                      <li key={i} className="flex gap-2">
                        <span>•</span>
                        <span>{pro}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {analysisResult.reasoning.cons.length > 0 && (
                <div>
                  <h4 className="font-medium text-red-700 mb-2">Concerns:</h4>
                  <ul className="text-sm space-y-1">
                    {analysisResult.reasoning.cons.map((con, i) => (
                      <li key={i} className="flex gap-2">
                        <span>•</span>
                        <span>{con}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          </div>

          {/* Similar Items Warning */}
          {analysisResult.similarOwned.length > 0 && (
            <div className="border border-yellow-200 bg-yellow-50 rounded-xl p-4">
              <h4 className="font-semibold text-yellow-800 mb-2">
                ⚠️ You own {analysisResult.similarOwned.length} similar items
              </h4>
              <div className="flex gap-3 overflow-x-auto pb-2">
                {analysisResult.similarOwned.map((item) => (
                  <SimilarItemCard 
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
          )}

          {/* Action Buttons */}
          <div className="flex gap-3">
            <PrimaryButton onClick={reset} variant="primary">
              Analyze Another Item
            </PrimaryButton>
          </div>
        </div>
      )}

      {/* Error State */}
      {error && (
        <div className="border border-red-200 bg-red-50 rounded-xl p-4 text-red-700">
          <p className="font-semibold">Analysis failed</p>
          <p className="text-sm mt-1">{error}</p>
          <PrimaryButton onClick={reset} variant="ghost" className="mt-3">
            Try Again
          </PrimaryButton>
        </div>
      )}

      {/* Image Modal for Wardrobe Items */}
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

      {/* Image Modal for Analyzed Item */}
      <ImageModal
        item={showAnalyzedItemModal ? analyzedItemForModal : null}
        photoIndex={analyzedItemPhotoIndex}
        onClose={() => {
          setShowAnalyzedItemModal(false)
          setAnalyzedItemPhotoIndex(0)
        }}
        onPrevious={analyzedItemForModal && analyzedItemForModal.photoUrls && analyzedItemForModal.photoUrls.length > 1 ? () => {
          setAnalyzedItemPhotoIndex(prev => prev > 0 ? prev - 1 : 0)
        } : undefined}
        onNext={analyzedItemForModal && analyzedItemForModal.photoUrls && analyzedItemForModal.photoUrls.length > 1 ? () => {
          setAnalyzedItemPhotoIndex(prev => 
            analyzedItemForModal.photoUrls && prev < analyzedItemForModal.photoUrls.length - 1 ? prev + 1 : prev
          )
        } : undefined}
      />
    </div>
  )
}

// Component for displaying similar items with images
function SimilarItemCard({ item, onClick }: { item: ClothingItem; onClick?: () => void }) {
  const signedUrl = useSignedUrl(item.photoUrl)
  
  return (
    <div 
      className="flex flex-col items-center bg-white rounded-lg p-3 min-w-[120px] cursor-pointer hover:shadow-md transition-shadow"
      onClick={onClick}
    >
      <div className="w-16 h-20 rounded-md overflow-hidden border border-neutral-200 bg-neutral-50 flex items-center justify-center">
        {signedUrl ? (
          <LazyImage
            src={signedUrl}
            alt={item.name}
            className="w-full h-full object-cover"
          />
        ) : (
          <div className="text-xs text-neutral-400 text-center px-1">
            No image
          </div>
        )}
      </div>
      <p className="text-xs text-center mt-2 font-medium text-neutral-700 max-w-[100px] truncate">
        {item.name}
      </p>
    </div>
  )
}