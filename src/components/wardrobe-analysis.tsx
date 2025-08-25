"use client"

import { useState, useEffect } from "react"
import type { ClothingItem } from "../app"
import type { 
  WardrobeAnalysisResponse, 
  WardrobeAnalysisRequest,
  WardrobeInsight,
  WardrobeRecommendation,
  ColorPalette,
  CategoryAnalysis,
  SeasonalDistribution,
  GeneralSuggestion
} from "../types/wardrobe-analysis"
import PrimaryButton from "./primary-button"
import Toast from "./toast"
import { getSupabaseBrowser } from "../lib/supabase/browser-client"
import MetricExplanationModal from "./metric-explanation-modal"
import { VersatilityExplanation, CohesionExplanation, CompletenessExplanation } from "./metric-explanations"

interface WardrobeAnalysisScreenProps {
  items: ClothingItem[]
  onBack: () => void
}

export default function WardrobeAnalysisScreen({ items, onBack }: WardrobeAnalysisScreenProps) {
  const [analysis, setAnalysis] = useState<WardrobeAnalysisResponse | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [selectedFocusAreas, setSelectedFocusAreas] = useState<string[]>(["color", "gaps", "seasonal", "recommendations"])

  const focusAreaOptions = [
    { id: "color", label: "Color Palette", description: "Analyze color harmony and gaps" },
    { id: "gaps", label: "Wardrobe Gaps", description: "Find missing essential pieces" },
    { id: "seasonal", label: "Seasonal Coverage", description: "Assess weather appropriateness" },
    { id: "recommendations", label: "Shopping List", description: "View personalized shopping recommendations" }
  ]

  const startAnalysis = async () => {
    if (items.length === 0) {
      setError("No clothing items found. Please add some items to your closet first.")
      return
    }

    setLoading(true)
    setError(null)

    try {
      // Check if user is authenticated before making the API call
      const sb = getSupabaseBrowser()
      let userId = null
      if (sb) {
        const { data: { user } } = await sb.auth.getUser()
        userId = user?.id
        console.log("[WardrobeAnalysis] User check", { hasUser: Boolean(user), userId })
      }
      
      if (!userId) {
        setError("Please log in to analyze your wardrobe.")
        setLoading(false)
        return
      }

      const request: WardrobeAnalysisRequest = {
        focus_areas: selectedFocusAreas,
        user_preferences: {},
        userId: userId
      }

      console.log("[WardrobeAnalysis] Making API call", { userId, focusAreas: selectedFocusAreas.length })

      const response = await fetch("/api/analyze-wardrobe", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(request),
      })

      if (!response.ok) {
        const errorData = await response.json()
        throw new Error(errorData.error || "Analysis failed")
      }

      const analysisResult = await response.json()
      setAnalysis(analysisResult)
    } catch (err) {
      console.error("Wardrobe analysis error:", err)
      setError(err instanceof Error ? err.message : "Analysis failed. Please try again.")
    } finally {
      setLoading(false)
    }
  }

  const toggleFocusArea = (areaId: string) => {
    setSelectedFocusAreas(prev => 
      prev.includes(areaId) 
        ? prev.filter(id => id !== areaId)
        : [...prev, areaId]
    )
  }

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <h1 className="text-lg font-semibold text-neutral-700">Wardrobe Analysis</h1>
          <PrimaryButton variant="ghost" onClick={onBack}>Back</PrimaryButton>
        </div>
        
        <div className="text-center py-12">
          <div className="inline-flex items-center gap-3">
            <div className="animate-spin h-6 w-6 border-2 border-neutral-300 border-t-neutral-600 rounded-full"></div>
            <span className="text-neutral-600">Analyzing your complete wardrobe ({items.length} items)...</span>
          </div>
          <p className="text-sm text-neutral-500 mt-2">This may take a few moments</p>
        </div>
      </div>
    )
  }

  if (!analysis) {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <h1 className="text-lg font-semibold text-neutral-700">Wardrobe Analysis</h1>
          <PrimaryButton variant="ghost" onClick={onBack}>Back</PrimaryButton>
        </div>

        <div className="space-y-4">
          <div className="text-center py-8">
            <h2 className="text-lg font-medium text-neutral-800 mb-2">
              Analyze Your Wardrobe
            </h2>
            <p className="text-neutral-600 mb-6">
              Get comprehensive insights about your style, color palette, gaps, and seasonal coverage.
            </p>
            <p className="text-sm text-neutral-500 mb-6">
              Found {items.length} items in your closet
            </p>
            {items.length === 0 && (
              <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-3 mb-6">
                <p className="text-sm text-yellow-800">
                  <strong>No items found!</strong> Please add some clothing items to your closet first before analyzing your wardrobe.
                </p>
              </div>
            )}
          </div>

          <div className="space-y-3">
            <h3 className="font-medium text-neutral-700">Analysis Focus Areas</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {focusAreaOptions.map(option => (
                <button
                  key={option.id}
                  onClick={() => toggleFocusArea(option.id)}
                  className={`p-3 rounded-lg border text-left transition-colors ${
                    selectedFocusAreas.includes(option.id)
                      ? "bg-neutral-50 border-neutral-300 text-neutral-900"
                      : "bg-white border-neutral-200 text-neutral-600 hover:border-neutral-300"
                  }`}
                >
                  <div className="font-medium text-sm">{option.label}</div>
                  <div className="text-xs mt-1">{option.description}</div>
                </button>
              ))}
            </div>
          </div>

          <PrimaryButton 
            onClick={startAnalysis}
            disabled={selectedFocusAreas.length === 0 || items.length === 0}
            className="w-full"
          >
            Start Wardrobe Analysis
          </PrimaryButton>

          {selectedFocusAreas.length === 0 && items.length > 0 && (
            <p className="text-xs text-neutral-500 text-center">
              Please select at least one focus area
            </p>
          )}
          {items.length === 0 && (
            <p className="text-xs text-neutral-500 text-center">
              Add clothing items to your closet to enable analysis
            </p>
          )}
        </div>

        {error && (
          <Toast 
            message={error} 
            onClose={() => setError(null)} 
            type="error" 
          />
        )}
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-semibold text-neutral-700">Wardrobe Analysis</h1>
        <div className="flex gap-2">
          <PrimaryButton 
            variant="ghost" 
            onClick={() => setAnalysis(null)}
            className="text-sm"
          >
            Analyze Again
          </PrimaryButton>
          <PrimaryButton variant="ghost" onClick={onBack}>Back</PrimaryButton>
        </div>
      </div>

      {/* Summary Overview */}
      <div className="bg-neutral-50 rounded-xl p-4">
        <h2 className="font-semibold text-neutral-800 mb-2">Wardrobe Summary</h2>
        <p className="text-sm text-neutral-700 mb-3">{analysis.wardrobe_summary}</p>
        
        {/* Dominant Styles - moved from Style Profile */}
        {analysis.style_profile?.dominant_styles && 
         analysis.style_profile.dominant_styles.length > 0 && (
          <div className="mb-3">
            <h4 className="font-medium text-neutral-700 mb-2">Dominant Styles</h4>
            <div className="flex flex-wrap gap-2">
              {analysis.style_profile.dominant_styles.map(style => (
                <span key={style} className="px-2 py-1 bg-neutral-100 rounded text-xs font-medium">
                  {style}
                </span>
              ))}
            </div>
          </div>
        )}
        
        <div className="text-xs text-neutral-500">
          Analyzed {analysis.items_analyzed} items • {new Date(analysis.analyzed_at || "").toLocaleDateString()}
        </div>
      </div>

      {/* Overall Scores */}
      <div className="grid grid-cols-3 gap-4">
        <ScoreCard 
          label="Versatility" 
          score={analysis.versatility_score} 
          description="Mix & match potential"
        />
        <ScoreCard 
          label="Cohesion" 
          score={analysis.cohesion_score} 
          description="Style consistency"
        />
        <ScoreCard 
          label="Completeness" 
          score={analysis.completeness_score} 
          description="Essential coverage"
        />
      </div>

      {/* Color Analysis */}
      {selectedFocusAreas.includes("color") && (
        <AnalysisCard title="Color Palette">
          <ColorPaletteSection colors={analysis.color_analysis} />
        </AnalysisCard>
      )}

      {/* Category Gaps */}
      {selectedFocusAreas.includes("gaps") && (
        <AnalysisCard title="Category Coverage">
          <CategorySection categories={analysis.category_breakdown} />
        </AnalysisCard>
      )}

      {/* Seasonal Distribution */}
      {selectedFocusAreas.includes("seasonal") && (
        <AnalysisCard title="Seasonal Distribution">
          <SeasonalSection seasonal={analysis.seasonal_distribution} />
        </AnalysisCard>
      )}

      {/* Key Insights */}
      <AnalysisCard title="Key Insights">
        <div className="space-y-3">
          {analysis.key_insights
            .filter(insight => insight.category !== "gaps")  // Filter out gaps insights
            .map((insight, index) => (
              <InsightCard key={index} insight={insight} />
            ))}
        </div>
      </AnalysisCard>

      {/* General Suggestions */}
      {analysis.general_suggestions?.suggestions && 
       analysis.general_suggestions.suggestions.length > 0 && (
        <AnalysisCard title="General Suggestions">
          <div className="space-y-3">
            {analysis.general_suggestions.suggestions.map((suggestion, index) => (
              <SuggestionCard key={index} suggestion={suggestion} />
            ))}
          </div>
        </AnalysisCard>
      )}

      {/* Recommendations */}
      {selectedFocusAreas.includes("recommendations") && (
        <AnalysisCard title="Shopping Recommendations">
          <div className="space-y-3">
            {analysis.recommendations
              .sort((a, b) => {
                const priorityOrder = { "essential": 0, "recommended": 1, "nice-to-have": 2 }
                return priorityOrder[a.priority] - priorityOrder[b.priority]
              })
              .map((rec, index) => (
                <RecommendationCard key={index} recommendation={rec} />
              ))}
          </div>
        </AnalysisCard>
      )}

      {/* Next Steps */}
      <AnalysisCard title="Next Steps">
        <div className="space-y-2">
          {analysis.next_steps.map((step, index) => (
            <div key={index} className="flex items-start gap-2">
              <span className="font-semibold text-neutral-600 mt-0.5">{index + 1}.</span>
              <span className="text-sm text-neutral-700">{step}</span>
            </div>
          ))}
        </div>
      </AnalysisCard>
    </div>
  )
}

// Helper Components

function AnalysisCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="bg-white border rounded-xl p-4">
      <h2 className="font-semibold text-neutral-800 mb-3">{title}</h2>
      {children}
    </div>
  )
}

function ScoreCard({ label, score, description }: { label: string; score: number; description: string }) {
  const [showExplanation, setShowExplanation] = useState(false)
  const percentage = Math.round(score * 100)
  const getScoreColor = (score: number) => {
    if (score >= 0.8) return "text-green-600"
    if (score >= 0.6) return "text-yellow-600"
    return "text-red-600"
  }

  // Get the appropriate explanation component based on label
  const getExplanationContent = () => {
    switch (label.toLowerCase()) {
      case "versatility":
        return <VersatilityExplanation />
      case "cohesion":
        return <CohesionExplanation />
      case "completeness":
        return <CompletenessExplanation />
      default:
        return null
    }
  }

  return (
    <>
      <div className="bg-white border rounded-lg p-3 text-center relative">
        {/* Question mark button */}
        <button
          onClick={() => setShowExplanation(true)}
          className="absolute top-2 right-2 w-4 h-4 rounded-full border border-neutral-300 text-neutral-500 hover:border-neutral-500 hover:text-neutral-700 text-xs flex items-center justify-center transition-colors"
          title={`How is ${label} calculated?`}
        >
          ?
        </button>
        
        <div className={`text-2xl font-bold ${getScoreColor(score)}`}>
          {percentage}%
        </div>
        <div className="font-medium text-neutral-800 text-sm">{label}</div>
        <div className="text-xs text-neutral-500 mt-1">{description}</div>
      </div>

      {/* Explanation Modal */}
      <MetricExplanationModal
        isOpen={showExplanation}
        onClose={() => setShowExplanation(false)}
        title={`How ${label} is Calculated`}
      >
        {getExplanationContent()}
      </MetricExplanationModal>
    </>
  )
}

function ColorPaletteSection({ colors }: { colors: ColorPalette }) {
  return (
    <div className="space-y-3">
      <div>
        <h4 className="font-medium text-neutral-700 mb-2">Primary Colors</h4>
        <div className="flex flex-wrap gap-2">
          {colors.primary_colors.map(color => (
            <div key={color} className="flex items-center gap-2">
              <div 
                className="w-4 h-4 rounded border border-neutral-300"
                style={{ backgroundColor: color.toLowerCase() }}
              />
              <span className="text-xs">{color}</span>
            </div>
          ))}
        </div>
      </div>
      <div>
        <h4 className="font-medium text-neutral-700 mb-2">Missing Colors</h4>
        <div className="flex flex-wrap gap-1">
          {colors.missing_colors.map(color => (
            <span key={color} className="px-2 py-1 bg-red-50 text-red-700 rounded text-xs">
              {color}
            </span>
          ))}
        </div>
      </div>
      <div className="text-xs text-neutral-500">
        Palette harmony: {colors.palette_harmony}
      </div>
    </div>
  )
}

function CategorySection({ categories }: { categories: CategoryAnalysis }) {
  return (
    <div className="space-y-3">
      <div>
        <h4 className="font-medium text-neutral-700 mb-2">Well Covered</h4>
        <div className="flex flex-wrap gap-1">
          {categories.well_covered.map(cat => (
            <span key={cat} className="px-2 py-1 bg-green-50 text-green-700 rounded text-xs">
              {cat}
            </span>
          ))}
        </div>
      </div>
      <div>
        <h4 className="font-medium text-neutral-700 mb-2">Gaps</h4>
        <div className="flex flex-wrap gap-1">
          {categories.gaps.map(gap => (
            <span key={gap} className="px-2 py-1 bg-red-50 text-red-700 rounded text-xs">
              {gap}
            </span>
          ))}
        </div>
      </div>
      {categories.oversupplied.length > 0 && (
        <div>
          <h4 className="font-medium text-neutral-700 mb-2">Oversupplied</h4>
          <div className="flex flex-wrap gap-1">
            {categories.oversupplied.map(cat => (
              <span key={cat} className="px-2 py-1 bg-yellow-50 text-yellow-700 rounded text-xs">
                {cat}
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

function SeasonalSection({ seasonal }: { seasonal: SeasonalDistribution }) {
  const seasons = [
    { name: "Spring", emoji: "🌸", percentage: seasonal.spring_percentage },
    { name: "Summer", emoji: "☀️", percentage: seasonal.summer_percentage },
    { name: "Fall", emoji: "🍂", percentage: seasonal.fall_percentage },
    { name: "Winter", emoji: "❄️", percentage: seasonal.winter_percentage },
  ]

  // Function to create bar visualization
  const createBar = (percentage: number) => {
    const filled = Math.round(percentage * 20) // 20 segments for the bar
    const empty = 20 - filled
    return "█".repeat(filled) + "░".repeat(empty)
  }

  return (
    <div className="space-y-4">
      {/* Distribution bars */}
      <div className="space-y-2">
        {seasons.map(season => (
          <div key={season.name} className="flex items-center gap-3">
            <span className="text-lg">{season.emoji}</span>
            <span className="text-sm font-medium text-neutral-700 w-16">{season.name}</span>
            <span className="font-mono text-xs text-neutral-500 flex-1">
              {createBar(season.percentage)}
            </span>
            <span className="text-sm font-semibold text-neutral-700 w-10 text-right">
              {Math.round(season.percentage * 100)}%
            </span>
          </div>
        ))}
      </div>
      
      {/* Summary info */}
      <div className="pt-2 border-t border-neutral-200">
        <div className="text-sm text-neutral-600">
          {seasonal.distribution_description}
        </div>
        <div className="text-xs text-neutral-500 mt-1">
          Versatility: {Math.round(seasonal.versatility_metric * 100)}% of items work across 3+ seasons
        </div>
      </div>
    </div>
  )
}

function InsightCard({ insight }: { insight: WardrobeInsight }) {
  const getCategoryColor = (category: string) => {
    switch (category) {
      case "style": return "text-blue-600 bg-blue-50"
      case "color": return "text-purple-600 bg-purple-50"
      case "seasonal": return "text-green-600 bg-green-50"
      case "formality": return "text-indigo-600 bg-indigo-50"
      default: return "text-neutral-600 bg-neutral-50"
    }
  }

  return (
    <div className="p-3 rounded-lg border border-neutral-200">
      <div className="flex items-start justify-between gap-2 mb-1">
        <h4 className="font-medium text-neutral-800 text-sm">{insight.title}</h4>
        <span className={`px-2 py-0.5 rounded text-xs font-medium ${getCategoryColor(insight.category)}`}>
          {insight.category}
        </span>
      </div>
      <p className="text-sm text-neutral-700">{insight.description}</p>
    </div>
  )
}

function SuggestionCard({ suggestion }: { suggestion: GeneralSuggestion }) {
  return (
    <div className="p-3 rounded-lg border border-neutral-200">
      <h4 className="font-medium text-neutral-800 text-sm mb-1">
        {suggestion.title}
      </h4>
      <p className="text-sm text-neutral-700">{suggestion.description}</p>
    </div>
  )
}

function RecommendationCard({ recommendation }: { recommendation: WardrobeRecommendation }) {
  const getPriorityColor = (priority: string) => {
    switch (priority) {
      case "essential": return "text-red-600 bg-red-50"
      case "recommended": return "text-yellow-600 bg-yellow-50"
      case "nice-to-have": return "text-green-600 bg-green-50"
      default: return "text-neutral-600 bg-neutral-50"
    }
  }

  return (
    <div className="p-3 rounded-lg border border-neutral-200">
      <div className="flex items-start justify-between gap-2 mb-1">
        <h4 className="font-medium text-neutral-800 text-sm">{recommendation.item_type}</h4>
        <div className="flex items-center gap-2">
          <span className="text-xs text-neutral-500">{recommendation.estimated_budget}</span>
          <span className={`px-2 py-0.5 rounded text-xs font-medium ${getPriorityColor(recommendation.priority)}`}>
            {recommendation.priority}
          </span>
        </div>
      </div>
      <p className="text-sm text-neutral-700 mb-2">{recommendation.reasoning}</p>
      {recommendation.style_notes && (
        <p className="text-xs text-neutral-500 italic">{recommendation.style_notes}</p>
      )}
    </div>
  )
}