// Types for Wardrobe Analysis Feature

export interface StyleProfile {
  dominant_styles: string[]           // Top 3 most common style tags
  secondary_styles: string[]          // Additional style patterns
  style_distribution: Record<string, number> // Percentage breakdown
  aesthetic_description: string       // Overall style summary
  consistency_score?: number          // Optional - deprecated metric (0-1)
}

export interface ColorPalette {
  primary_colors: string[]           // Most worn colors
  accent_colors: string[]            // Secondary/accent colors  
  neutral_colors: string[]           // Neutral base colors
  color_distribution: Record<string, number> // Color frequency percentages
  palette_harmony: string            // "cohesive", "varied", "chaotic"
  missing_colors: string[]           // Recommended color additions
}

export interface CategoryAnalysis {
  category_counts: Record<string, number>     // Items per category
  coverage_percentages: Record<string, number> // Category distribution
  well_covered: string[]             // Categories with good coverage
  gaps: string[]                     // Missing/underrepresented categories
  oversupplied: string[]             // Categories with too many items
  versatility_gaps: string[]         // Missing versatile pieces
}

export interface SeasonalDistribution {
  spring_percentage: number            // Weighted % of wardrobe for spring
  summer_percentage: number            // Weighted % of wardrobe for summer  
  fall_percentage: number              // Weighted % of wardrobe for fall
  winter_percentage: number            // Weighted % of wardrobe for winter
  versatility_metric: number           // % of items working 3+ seasons
  primary_season: string                // Season with highest percentage
  distribution_description: string     // e.g., "Summer-focused wardrobe"
}

export interface WardrobeInsight {
  title: string
  description: string
  category: "style" | "color" | "seasonal" | "formality"  // Removed "gaps"
}

export interface GeneralSuggestion {
  title: string                         // General observation title
  description: string                   // Explanation of the gap/improvement area
  type: "gap" | "improvement"          // To differentiate styling
}

export interface GeneralSuggestions {
  suggestions: GeneralSuggestion[]     // Array of general suggestions
}

export interface WardrobeRecommendation {
  item_type: string                      // What to buy/add
  reasoning: string                      // Why it's needed
  priority: "essential" | "recommended" | "nice-to-have"
  impact_score: number                   // How much it would improve wardrobe (0-1)
  estimated_budget: "$" | "$$" | "$$$"   // Budget estimate
  style_notes: string                    // How to style/integrate
}

export interface WardrobeAnalysisRequest {
  focus_areas?: string[]  // ["style", "color", "gaps", "seasonal"]
  user_preferences?: Record<string, any>
  userId?: string
}

export interface WardrobeAnalysisResponse {
  // Core analysis components
  style_profile: StyleProfile
  color_analysis: ColorPalette  
  category_breakdown: CategoryAnalysis
  seasonal_distribution: SeasonalDistribution
  
  // Overall metrics
  versatility_score: number            // 0-1 overall wardrobe versatility
  cohesion_score: number              // 0-1 how well pieces work together
  completeness_score: number          // 0-1 how complete the wardrobe is
  
  // Insights and recommendations
  key_insights: WardrobeInsight[]
  general_suggestions?: GeneralSuggestions  // New field for gaps and improvements
  recommendations: WardrobeRecommendation[]
  
  // Summary
  wardrobe_summary: string              // 2-3 sentence overview
  next_steps: string[]                  // Top 3 actionable items
  
  // Metadata
  analyzed_at?: string
  items_analyzed?: number
  focus_areas_requested?: string[]
}

// Chart data interfaces for visualization components
export interface ChartData {
  labels: string[]
  data: number[]
  backgroundColor?: string[]
  borderColor?: string[]
}

export interface ScoreData {
  label: string
  score: number
  description?: string
  color?: string
}

// Component prop types
export interface WardrobeAnalysisScreenProps {
  items: any[] // ClothingItem[] - using any to avoid circular imports
  onBack: () => void
}

export interface AnalysisCardProps {
  title: string
  children: React.ReactNode
  className?: string
}

export interface InsightCardProps {
  insight: WardrobeInsight
}

export interface RecommendationCardProps {
  recommendation: WardrobeRecommendation
}

export interface ScoreGaugeProps {
  score: number
  label: string
  description?: string
  size?: "sm" | "md" | "lg"
  color?: string
}

export interface ColorSwatchProps {
  colors: string[]
  percentages?: Record<string, number>
  maxSwatches?: number
}

export interface CategoryChartProps {
  data: CategoryAnalysis
  type?: "pie" | "bar"
}

export interface SeasonalRadarProps {
  data: SeasonalDistribution
}

// Error and loading states
export interface AnalysisError {
  message: string
  code?: string
}

export interface AnalysisLoadingState {
  isLoading: boolean
  progress?: number
  stage?: string
}