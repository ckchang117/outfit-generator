import os
import random
import asyncio
import hashlib
import time
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel, validator
from typing import List, Optional, Dict, Any, Union
from agents import Agent, Runner
from dotenv import load_dotenv
import json
import re
from openai import AsyncOpenAI
from scoring import calculate_all_scores

# Load environment variables from .env file
load_dotenv()

# Environment
OPENAI_API_KEY = os.environ.get("OPENAI_API_KEY")
if not OPENAI_API_KEY:
    raise RuntimeError("OPENAI_API_KEY is required in environment")

# Initialize OpenAI client for direct API calls
openai_client = AsyncOpenAI(api_key=OPENAI_API_KEY)

app = FastAPI(title="Outfit Generator Agents Service")

# Simple in-memory cache with TTL
wardrobe_analysis_cache = {}
CACHE_TTL = 3600  # 1 hour

def create_cache_key(data: dict) -> str:
    """Create a cache key from data"""
    data_str = json.dumps(data, sort_keys=True)
    return hashlib.md5(data_str.encode()).hexdigest()

def get_cached_result(cache_key: str, cache_dict: dict):
    """Get cached result if still valid"""
    if cache_key in cache_dict:
        result, timestamp = cache_dict[cache_key]
        if time.time() - timestamp < CACHE_TTL:
            return result
        else:
            # Remove expired cache
            del cache_dict[cache_key]
    return None

def set_cached_result(cache_key: str, result: any, cache_dict: dict):
    """Cache a result with timestamp"""
    cache_dict[cache_key] = (result, time.time())


@app.get("/")
async def health():
    """Health check endpoint to verify service is running"""
    return {"status": "healthy", "service": "Outfit Generator AI Service"}


def fix_photo_url(url: str) -> str:
    """Legacy function - URLs should already be signed from Next.js backend"""
    if not url:
        print(f"[fix_photo_url] Empty URL provided")
        return url
    
    # URLs should already be signed from Next.js, but keep basic validation
    if url.startswith('http') or url.startswith('data:'):
        return url
    
    print(f"[fix_photo_url] WARNING: Received relative URL that should have been signed: {url}")
    return url

@app.get("/health")
async def health_check():
    return {"status": "healthy", "service": "agents"}

# Pydantic models
class AnalyzeItemRequest(BaseModel):
    name: str
    notes: Optional[str] = None
    photo_urls: List[str]

class ColorAnalysisResponse(BaseModel):
    colors: List[str]
    primaryColor: str
    secondaryColors: Optional[List[str]] = None
    pattern: Optional[str] = None
    colorDistribution: Optional[str] = None
    undertones: str
    colorIntensity: str
    colorDominance: str
    patternDescription: Optional[str] = None
    confidence: float = 1.0

class AnalyzeItemResponse(BaseModel):
    # Basic attributes
    description: str
    category: str
    subcategory: str
    colors: List[str]
    primaryColor: str
    pattern: Optional[str] = None
    material: Optional[List[str]] = None
    season: List[str]
    formality: str
    styleTags: List[str]
    brand: Optional[str] = None
    fit: Optional[str] = None
    
    # Style and coordination fields
    neckline: Optional[str] = None
    sleeveLength: Optional[str] = None
    length: Optional[str] = None
    silhouette: Optional[str] = None
    texture: Optional[str] = None
    transparency: Optional[str] = None
    layeringRole: Optional[str] = None
    
    # Occasion and versatility
    occasions: Optional[List[str]] = None
    timeOfDay: Optional[List[str]] = None
    weatherSuitability: Optional[List[str]] = None
    temperatureRange: Optional[str] = None
    
    # Coordination hints
    colorCoordinationNotes: Optional[str] = None
    stylingNotes: Optional[str] = None
    avoidCombinations: Optional[List[str]] = None
    bestPairedWith: Optional[List[str]] = None
    
    # Practical considerations
    careLevel: Optional[str] = None
    wrinkleResistance: Optional[str] = None
    stretchLevel: Optional[str] = None
    comfortLevel: Optional[str] = None
    
    # Advanced style attributes
    designDetails: Optional[List[str]] = None
    printScale: Optional[str] = None
    vintageEra: Optional[str] = None
    trendStatus: Optional[str] = None
    
    # Body type and styling
    flatteringFor: Optional[List[str]] = None
    stylingVersatility: Optional[str] = None
    
    # Color and coordination
    undertones: Optional[str] = None
    colorIntensity: Optional[str] = None
    colorDominance: Optional[str] = None
    
    aiAttributes: Dict[str, Any] = {}

class ClosetItem(BaseModel):
    id: str
    name: str
    # Photo fields
    photo_url: Optional[str] = None
    photo_urls: Optional[List[str]] = None
    # Basic attributes
    category: Optional[str] = None
    subcategory: Optional[str] = None
    colors: Optional[List[str]] = None
    season: Optional[List[str]] = None
    formality: Optional[str] = None
    styleTags: Optional[List[str]] = None
    description: Optional[str] = None
    
    # New coordination fields
    occasions: Optional[List[str]] = None
    layeringRole: Optional[str] = None
    bestPairedWith: Optional[List[str]] = None
    avoidCombinations: Optional[List[str]] = None
    stylingNotes: Optional[str] = None
    colorCoordinationNotes: Optional[str] = None
    weatherSuitability: Optional[List[str]] = None
    temperatureRange: Optional[str] = None
    stylingVersatility: Optional[str] = None
    undertones: Optional[str] = None
    colorIntensity: Optional[str] = None
    
    class Config:
        # Allow both snake_case and camelCase field names
        populate_by_name = True
        
    @validator('category', pre=True)
    def normalize_category(cls, v):
        """Normalize category to standard values"""
        if not v:
            return None
        
        # Category normalization map
        category_map = {
            'shirt': 'top', 't-shirt': 'top', 'tshirt': 'top', 'blouse': 'top',
            'sweater': 'top', 'hoodie': 'top', 'tank': 'top', 'sweatshirt': 'top',
            'pants': 'bottom', 'jeans': 'bottom', 'shorts': 'bottom', 'skirt': 'bottom',
            'trousers': 'bottom', 'leggings': 'bottom',
            'jacket': 'outerwear', 'coat': 'outerwear', 'blazer': 'outerwear',
            'sneakers': 'shoes', 'boots': 'shoes', 'sandals': 'shoes', 'heels': 'shoes',
            'loafers': 'shoes', 'flats': 'shoes',
            'hat': 'accessory', 'cap': 'accessory', 'sunglasses': 'accessory',
            'belt': 'accessory', 'scarf': 'accessory', 'bag': 'accessory'
        }
        
        normalized = v.lower() if isinstance(v, str) else str(v).lower()
        return category_map.get(normalized, normalized)
    
    @validator('colors', 'season', 'styleTags', pre=True)
    def ensure_list(cls, v):
        """Ensure array fields are lists, not None"""
        if v is None:
            return []
        if isinstance(v, str):
            return [v]
        return list(v) if v else []
    
    @validator('styleTags', pre=True)
    def handle_style_tags_snake_case(cls, v, values):
        """Handle both styleTags and style_tags field names"""
        # Check if style_tags was provided in the raw data
        if hasattr(values, '__fields_set__') and 'style_tags' in values:
            return values.get('style_tags', [])
        return v
    
    def __init__(self, **data):
        # Handle snake_case to camelCase conversion
        if 'style_tags' in data and 'styleTags' not in data:
            data['styleTags'] = data.pop('style_tags')
        if 'layering_role' in data and 'layeringRole' not in data:
            data['layeringRole'] = data.pop('layering_role')
        if 'best_paired_with' in data and 'bestPairedWith' not in data:
            data['bestPairedWith'] = data.pop('best_paired_with')
        if 'avoid_combinations' in data and 'avoidCombinations' not in data:
            data['avoidCombinations'] = data.pop('avoid_combinations')
        if 'styling_notes' in data and 'stylingNotes' not in data:
            data['stylingNotes'] = data.pop('styling_notes')
        if 'color_coordination_notes' in data and 'colorCoordinationNotes' not in data:
            data['colorCoordinationNotes'] = data.pop('color_coordination_notes')
        if 'weather_suitability' in data and 'weatherSuitability' not in data:
            data['weatherSuitability'] = data.pop('weather_suitability')
        if 'temperature_range' in data and 'temperatureRange' not in data:
            data['temperatureRange'] = data.pop('temperature_range')
        if 'styling_versatility' in data and 'stylingVersatility' not in data:
            data['stylingVersatility'] = data.pop('styling_versatility')
        if 'color_intensity' in data and 'colorIntensity' not in data:
            data['colorIntensity'] = data.pop('color_intensity')
        
        super().__init__(**data)

class GenerateOutfitRequest(BaseModel):
    request: str
    pieceCount: Optional[int] = 3
    closet: List[ClosetItem]
    excludeCategories: Optional[List[str]] = []
    occasion: Optional[str] = None
    weather: Optional[str] = None
    # New context parameters
    vibe: Optional[str] = None
    formality: Optional[int] = None  # 1-5 scale
    timeOfDay: Optional[str] = None

class OutfitSuggestion(BaseModel):
    itemIds: List[str]
    rationale: str
    score: float
    occasion: Optional[str] = None
    title: str

class OutfitRequirements(BaseModel):
    essential_categories: List[List[str]]  # Must have ONE of these combinations
    recommended_categories: List[str]      # Should include if available
    optional_categories: List[str]         # Nice to have
    avoid_categories: List[str]            # Should not include
    min_items: int                         # Minimum pieces needed
    max_items: int                         # Maximum pieces recommended
    occasion_type: str                     # Context descriptor
    special_notes: str                     # Additional guidance for stylist

class ShoppingRecommendation(BaseModel):
    item_type: str  # "Linen Shorts"
    specifications: str  # "Khaki or Natural, 7-9 inch inseam"
    rationale: str  # Why this item would help
    search_query: str  # Ready-to-copy search term
    budget_range: str  # "$40-80"
    priority: str  # "essential", "recommended", "nice-to-have"
    outfit_impact: int  # Number of new combinations
    pair_with_ids: Optional[List[str]] = None  # IDs of existing items to pair with

class GenerateOutfitResponse(BaseModel):
    outfits: List[OutfitSuggestion]
    shopping_recommendations: List[ShoppingRecommendation] = []

class ClassifyCategoryRequest(BaseModel):
    photo_urls: List[str]
    item_name: Optional[str] = None  # Optional context for ambiguous cases

class ShoppingBuddyRequest(BaseModel):
    photo_url: str
    wardrobe_items: List[ClosetItem]
    store_location: Optional[str] = None
    price: Optional[float] = None

class RankedPairableItem(BaseModel):
    """Pairable item with AI-generated ranking and styling insight"""
    item: dict
    rank: int  # 1, 2, or 3
    styling_note: str  # Brief styling tip like "Creates a sharp business-casual look"
    
class PairableItemsByCategory(BaseModel):
    """Top 3 ranked items per category from valid pairings"""
    headwear: List[RankedPairableItem] = []
    eyewear: List[RankedPairableItem] = []
    tops: List[RankedPairableItem] = []
    bottoms: List[RankedPairableItem] = []
    dresses: List[RankedPairableItem] = []
    outerwear: List[RankedPairableItem] = []
    shoes: List[RankedPairableItem] = []
    accessories: List[RankedPairableItem] = []

class ShoppingBuddyResponse(BaseModel):
    item: dict
    compatibility: dict
    potentialOutfits: List[dict]
    similarOwned: List[dict]
    recommendation: str
    reasoning: dict
    outfitCount: int
    gapsFilled: List[str]
    pairableItems: List[dict] = []  # Legacy field for backward compatibility
    pairableItemsByCategory: Optional[PairableItemsByCategory] = None  # New AI-ranked structure

class CategoryResult(BaseModel):
    category: str               # Must be from valid Supabase categories
    subcategory: Optional[str] = None
    confidence: float          # 0.0 to 1.0
    reasoning: str             # Why this category was chosen
    used_name_context: bool    # Whether item name influenced the decision

# Wardrobe Analysis Models
class StyleProfile(BaseModel):
    dominant_styles: List[str]           # Top 3 most common style tags
    secondary_styles: List[str]          # Additional style patterns
    style_distribution: Optional[Dict[str, float]] = None # Percentage breakdown (optional)
    aesthetic_description: str           # Overall style summary
    consistency_score: Optional[float] = None  # Added from deterministic calc

class ColorPalette(BaseModel):
    primary_colors: List[str]           # Most worn colors
    accent_colors: List[str]            # Secondary/accent colors  
    neutral_colors: List[str]           # Neutral base colors
    color_distribution: Optional[Dict[str, float]] = None # Color frequency percentages (optional)
    palette_harmony: str                 # "cohesive", "varied", "chaotic"
    missing_colors: List[str]           # Recommended color additions

class CategoryAnalysis(BaseModel):
    category_counts: Optional[Dict[str, int]] = None  # Items per category (optional)
    coverage_percentages: Optional[Dict[str, float]] = None # Category distribution (optional)
    well_covered: List[str]             # Categories with good coverage
    gaps: List[str]                     # Missing/underrepresented categories
    oversupplied: List[str]             # Categories with too many items
    versatility_gaps: List[str]         # Missing versatile pieces
    wardrobe_style: Optional[str] = None  # Detected style: "masculine", "feminine", "neutral", "mixed"
    relevant_categories: Optional[List[str]] = None  # Categories that matter for this style

class SeasonalDistribution(BaseModel):
    spring_percentage: float            # Weighted % of wardrobe for spring
    summer_percentage: float            # Weighted % of wardrobe for summer  
    fall_percentage: float              # Weighted % of wardrobe for fall
    winter_percentage: float            # Weighted % of wardrobe for winter
    versatility_metric: float           # % of items working 3+ seasons
    primary_season: str                 # Season with highest percentage
    distribution_description: str       # e.g., "Summer-focused wardrobe"

class WardrobeInsight(BaseModel):
    title: str
    description: str
    category: str  # "style", "color", "seasonal", "formality" - removed "gaps"

class GeneralSuggestion(BaseModel):
    title: str                            # General observation title
    description: str                      # Explanation of the gap/improvement area
    type: str                            # "gap" or "improvement"

class GeneralSuggestions(BaseModel):
    suggestions: List[GeneralSuggestion] = []  # Array of general suggestions

class WardrobeRecommendation(BaseModel):
    item_type: str                      # What to buy/add
    reasoning: str                      # Why it's needed
    priority: str                       # "essential", "recommended", "nice-to-have"
    impact_score: Optional[float] = None  # How much it would improve wardrobe (0-1) - optional
    estimated_budget: str               # "$", "$$", "$$$"
    style_notes: str                    # How to style/integrate

class WardrobeAnalysisRequest(BaseModel):
    closet_items: List[ClosetItem]
    user_preferences: Optional[Dict[str, Any]] = None
    focus_areas: Optional[List[str]] = None  # ["style", "color", "gaps", "seasonal"]

class AIWardrobeInsights(BaseModel):
    """What the AI generates - only qualitative analysis"""
    style_profile: StyleProfile
    color_analysis: ColorPalette  
    category_breakdown: CategoryAnalysis
    key_insights: List[WardrobeInsight]
    recommendations: List[WardrobeRecommendation]
    wardrobe_summary: str
    next_steps: List[str]

class WardrobeAnalysisResponse(BaseModel):
    """Complete response combining deterministic scores and AI insights"""
    # Core analysis components from AI
    style_profile: StyleProfile
    color_analysis: ColorPalette  
    category_breakdown: CategoryAnalysis
    seasonal_distribution: SeasonalDistribution
    
    # Deterministic metrics (calculated, not from AI)
    versatility_score: float            # 0-1 overall wardrobe versatility
    cohesion_score: float              # 0-1 how well pieces work together
    completeness_score: float          # 0-1 how complete the wardrobe is
    
    # Insights and recommendations from AI
    key_insights: List[WardrobeInsight]
    general_suggestions: Optional[GeneralSuggestions] = None  # New field for gaps and improvements
    recommendations: List[WardrobeRecommendation]
    
    # Summary from AI
    wardrobe_summary: str              # 2-3 sentence overview
    next_steps: List[str]              # Top 3 actionable items

# Define Agents using the OpenAI Agents SDK
color_analyst_agent = Agent(
    name="Color Analysis Specialist",
    model="gpt-4o",  # Use GPT-4o for vision capabilities
    instructions=(
        "You are a color analysis expert who identifies garment colors with extreme precision.\n"
        "FOCUS ONLY on the specific named garment - ignore all background, other clothing, people, and environment.\n"
        "Return ONLY JSON with fields: colors, primaryColor, secondaryColors, pattern, colorDistribution, undertones, colorIntensity, colorDominance, patternDescription, confidence."
    ),
)

# Note: Category classification now uses direct OpenAI API for vision support

catalog_agent = Agent(
    name="Fashion Catalog Analyst",
    instructions=(
        "You analyze clothing items from photos and produce detailed fashion attributes.\n"
        "You will receive pre-analyzed color data and a pre-determined category - use them and focus on other attributes.\n"
        "Do NOT re-classify the category - it has been verified by visual analysis.\n"
        "Return ONLY JSON with fields: description, subcategory, material, season, formality, styleTags, brand, fit, aiAttributes."
    ),
)

requirements_agent = Agent(
    name="Requirements Analyst",
    instructions=(
        "You are an expert at understanding clothing needs for different occasions.\n"
        "Analyze the user's request and determine what clothing categories are needed.\n\n"
        "Use these exact categories: top, bottom, outerwear, dress, shoes, accessory, underwear, swimwear, activewear, sleepwear, bag, jewelry, other\n\n"
        "For essential_categories, use nested lists to show alternatives:\n"
        "- [['top', 'bottom'], ['dress']] means: (top AND bottom) OR dress\n"
        "- [['swimwear']] means: swimwear is required\n"
        "- [['activewear']] means: activewear items required\n\n"
        "Examples:\n"
        "- Beach/pool → essential: [['swimwear']], recommended: ['shoes', 'accessory'], avoid: ['sleepwear']\n"
        "- Office work → essential: [['top', 'bottom'], ['dress']], recommended: ['shoes', 'outerwear'], avoid: ['swimwear', 'activewear']\n"
        "- Gym → essential: [['activewear']], recommended: ['shoes'], avoid: ['dress', 'swimwear']\n\n"
        'Return ONLY JSON: {"essential_categories":[[]],"recommended_categories":[],"optional_categories":[],"avoid_categories":[],"min_items":2,"max_items":5,"occasion_type":"","special_notes":""}'
    ),
)

stylist_agent = Agent(
    name="Personal Stylist", 
    instructions=(
        "You select cohesive outfits from a given closet. Use only provided IDs.\n"
        "IMPORTANT: If you receive feedback about a previous attempt, you MUST address it.\n"
        "Generate ONE complete outfit (not multiple).\n\n"
        "ABSOLUTE RULE #1 - CATEGORY LIMITS (VIOLATIONS = IMMEDIATE FAILURE):\n"
        "Each outfit MUST have:\n"
        "- EXACTLY ONE primary top (shirt, t-shirt, blouse, tank top)\n"
        "- EXACTLY ONE bottom (pants, jeans, shorts, skirt) OR ONE dress\n"  
        "- EXACTLY ONE pair of shoes\n"
        "- MAXIMUM ONE outerwear (jacket, coat, cardigan, blazer)\n"
        "- MAXIMUM ONE accessory per type (one belt, one hat, one bag, etc.)\n\n"
        "LAYERING EXCEPTIONS (the ONLY allowed duplicates):\n"
        "- Base layer + outer layer is OK (tank top + cardigan, t-shirt + blazer)\n"
        "- Undershirt + shirt is OK for formal outfits\n"
        "- Sport base layer + jersey for athletic outfits\n"
        "ALL OTHER DUPLICATES ARE FORBIDDEN\n\n"
        "EXAMPLES:\n"
        "- FORBIDDEN: Blue Jeans + Black Pants (2 bottoms)\n"
        "- FORBIDDEN: Nike Sneakers + Dress Shoes (2 shoes)\n"
        "- FORBIDDEN: T-Shirt + Another T-Shirt (2 similar tops)\n"
        "- ALLOWED: Tank Top + Cardigan (base + outer layer)\n"
        "- ALLOWED: Button-Down + Blazer (shirt + jacket layer)\n\n"
        "CRITICAL RULE - ITEM NAMES IN DESCRIPTIONS:\n"
        "- In your rationale, you MUST use the actual NAME of each item\n"
        "- NEVER use item IDs in descriptions (users don't understand random strings)\n"
        "- Example GOOD: 'The White Cotton Tee pairs perfectly with the Blue Jeans because...'\n"
        "- Example BAD: 'Item abc123 goes well with item def456...'\n"
        "- Example BAD: 'The selected top works with the chosen bottom...'\n"
        "- Be specific: use the full item name as provided in the closet data\n\n"
        "FOOTWEAR SELECTION RULES - CRITICAL:\n"
        "SPORT-SPECIFIC shoes are ONLY for their intended activity:\n"
        "- Golf shoes → ONLY for golf outfits/requests\n"
        "- Tennis shoes → ONLY for tennis activities  \n"
        "- Climbing shoes → ONLY for climbing\n"
        "- Cleats (soccer/football/baseball) → ONLY for those specific sports\n"
        "- Ski/snowboard boots → ONLY for snow sports\n"
        "- Cycling shoes → ONLY for cycling\n"
        "- Wrestling/boxing shoes → ONLY for those sports\n"
        "- Bowling shoes → ONLY for bowling\n\n"
        "ATHLETIC shoes have LIMITED versatility:\n"
        "- Running shoes → running, gym, casual athletic wear, errands\n"
        "- Cross-trainers → gym, general athletic activities, athleisure\n"
        "- Basketball shoes → basketball, streetwear (if style appropriate)\n"
        "- Trail running shoes → hiking, outdoor activities\n\n"
        "VERSATILE footwear for general outfits:\n"
        "- Sneakers (non-sport specific) → casual, streetwear, errands\n"
        "- Loafers → business casual, smart casual\n"
        "- Boots → casual to formal depending on style\n"
        "- Dress shoes → business, formal events\n"
        "- Sandals → casual, beach, warm weather\n"
        "- Flats → casual to business casual\n"
        "- Heels → business to formal events\n\n"
        "CONTEXT MATCHING:\n"
        "- Check item's name/description for sport-specific terms\n"
        "- If item mentions specific sport, ONLY use for that context\n"
        "- Default to versatile options for general outfit requests\n"
        "- Match footwear formality to outfit formality\n\n"
        "Other Rules:\n"
        "1. Ensure proper coverage for the occasion\n"
        "2. Include appropriate footwear unless explicitly for sleep/lounging\n"
        "3. Consider weather and practicality\n"
        "4. If items are marked 'previously_used', try to avoid them for variety\n"
        "5. Always explain your choices clearly using specific item names\n"
        "6. Create a contextual title that reflects the EVENT/PURPOSE\n\n"
        'Return ONLY JSON: {"itemIds":[], "rationale":"...", "score":0.9, "occasion":"...", "title":"Event-Specific Title"}'
    ),
)

coverage_validator_agent = Agent(
    name="Coverage Validator",
    instructions=(
        "You are an expert at determining if an outfit provides appropriate coverage for the occasion.\n"
        "Analyze the proposed outfit and determine if it's complete and appropriate.\n\n"
        "CRITICAL - Check for OVERCOVERAGE (duplicate categories):\n"
        "- NEVER suggest multiple bottoms (2 pants, 2 skirts, etc.) - this is illogical\n"  
        "- NEVER suggest multiple shoes - people wear one pair at a time\n"
        "- Avoid multiple tops unless one is clearly for layering (e.g., shirt + cardigan OK, but NOT 2 t-shirts)\n"
        "- Flag any duplicate categories that don't make sense\n"
        "- Example BAD: jeans + dress pants, sneakers + dress shoes, two t-shirts\n"
        "- Example OK: button-down shirt + cardigan (layering)\n\n"
        "Also check UNDERCOVERAGE:\n"
        "1. Body coverage - Is the person appropriately dressed?\n"
        "2. Footwear - Are shoes needed for this occasion?\n"
        "3. Weather appropriateness - Will they be comfortable?\n"
        "4. Social appropriateness - Is it suitable for the venue/event?\n"
        "5. Practical completeness - Can they actually go out in this?\n\n"
        "Be context-aware:\n"
        "- Beach/pool: Swimwear + sandals is complete\n"
        "- Gym: Activewear + athletic shoes is complete\n"
        "- Office: Professional coverage + shoes required\n"
        "- Date night: Complete outfit with shoes required\n"
        "- Home/lounging: Relaxed requirements\n"
        "- Sleep: No shoes needed\n\n"
        'Return ONLY JSON: {"is_complete": true, "missing_elements": [], "feedback": "Specific advice for improvement", "severity": "critical"}'
    ),
)

shopping_intelligence_agent = Agent(
    name="Shopping Intelligence Advisor",
    instructions=(
        "You analyze wardrobes and generate smart shopping recommendations.\n\n"
        "ANALYSIS PROCESS:\n"
        "1. Review the user's request and what outfits were generated\n"
        "2. Identify what prevented more/better outfit options\n"
        "3. Analyze existing wardrobe style and gender patterns\n"
        "4. Suggest specific items that would maximize wardrobe utility\n\n"
        "STYLE CONSISTENCY - CRITICAL:\n"
        "- FIRST analyze the existing wardrobe to detect style patterns\n"
        "- Look at item categories, subcategories, and descriptions for gender/style cues:\n"
        "  * Men's patterns: dress shirts, suits, ties, chinos, men's jeans, polo shirts\n"
        "  * Women's patterns: dresses, blouses, skirts, women's tops, heels\n"
        "  * Unisex patterns: t-shirts, hoodies, sneakers, jeans (without gender specification)\n"
        "- ONLY recommend items that match the detected style profile\n"
        "- If wardrobe is clearly men's clothing, NEVER suggest dresses, skirts, heels, or women's items\n"
        "- If wardrobe is clearly women's clothing, suggest appropriately\n"
        "- For mixed/unclear wardrobes, stick to unisex items\n\n"
        "RECOMMENDATION CRITERIA:\n"
        "- Focus on versatile pieces that work with existing items\n"
        "- For each recommendation, identify 2-3 specific existing item IDs to pair with\n"
        "- Prioritize main clothing pieces (tops, bottoms, dresses) for pairing, not accessories\n"
        "- Prioritize items that unlock multiple outfit combinations\n"
        "- Consider the specific occasion/context of the request\n"
        "- Suggest realistic, buyable items (not vague categories)\n"
        "- MAINTAIN STYLE CONSISTENCY with existing wardrobe\n\n"
        "PAIRING RULES - CRITICAL:\n"
        "- NEVER suggest pairing with items from the SAME category\n"
        "- If recommending a TOP, pair with: bottoms, outerwear, shoes (NOT other tops)\n"
        "- If recommending a BOTTOM, pair with: tops, dresses (for layering), shoes (NOT other bottoms)\n"
        "- If recommending a DRESS, pair with: outerwear, shoes, accessories (NOT tops/bottoms)\n"
        "- If recommending SHOES, pair with: tops, bottoms, dresses (NOT other shoes)\n"
        "- If recommending OUTERWEAR, pair with: tops, bottoms, dresses (NOT other outerwear)\n\n"
        "VALID PAIRING EXAMPLES:\n"
        "- White T-Shirt (top) → Blue Jeans (bottom), Denim Jacket (outerwear), White Sneakers (shoes)\n"
        "- Black Dress → Leather Jacket (outerwear), Ankle Boots (shoes), Gold Necklace (accessory)\n"
        "- Navy Blazer (outerwear) → White Shirt (top), Gray Pants (bottom), Oxford Shoes (shoes)\n\n"
        "INVALID PAIRING EXAMPLES:\n"
        "- White T-Shirt → Blue T-Shirt (both tops - WRONG!)\n"
        "- Jeans → Khaki Pants (both bottoms - WRONG!)\n"
        "- Sneakers → Loafers (both shoes - WRONG!)\n\n"
        "SEARCH QUERY OPTIMIZATION:\n"
        "- Create specific, searchable terms that work on major shopping sites\n"
        "- Include important details: material, fit, color, style\n"
        "- Include gender specification when relevant (e.g., 'men's' or 'women's')\n"
        "- Use common shopping language consumers would search\n\n"
        "BUDGET GUIDANCE:\n"
        "- Provide realistic price ranges for each item category\n"
        "- Consider quality vs cost for different item types\n\n"
        "PRIORITY LEVELS:\n"
        "- essential: Required for the specific request\n"
        "- recommended: Would significantly improve options\n"
        "- nice-to-have: Would add style variety\n\n"
        "Return ONLY JSON array of recommendations:\n"
        '[{"item_type": "specific item name", "specifications": "detailed specs", "rationale": "why this helps", "search_query": "buyable search term", "budget_range": "$X-Y", "priority": "essential/recommended/nice-to-have", "outfit_impact": number, "pair_with_ids": ["item_id1", "item_id2"]}]'
    ),
)

outfit_validator_agent = Agent(
    name="Outfit Validator",
    instructions=(
        "You validate outfits for BOTH coverage AND color coordination in one comprehensive analysis.\n\n"
        
        "VALIDATION PRIORITY ORDER:\n"
        "1. DUPLICATES CHECK (CRITICAL - IMMEDIATE FAIL):\n"
        "   - Count categories: If >1 bottom, >1 shoes, >1 dress = INVALID\n"
        "   - If dress + bottom = INVALID (impossible to wear)\n"
        "   - If >1 top, check if valid layering (base+outer) or INVALID\n"
        "   - Return is_valid: false IMMEDIATELY if duplicates found\n\n"
        "2. COVERAGE CHECK (after duplicates pass):\n"
        "   - Then check if outfit is complete for occasion\n\n"
        "3. COLOR CHECK (after coverage passes):\n"
        "   - Finally validate color coordination\n\n"
        
        "COVERAGE CHECKS:\n"
        "- NO DUPLICATE CATEGORIES: Never multiple bottoms (2 pants, 2 skirts), multiple shoes, or duplicate tops unless proper layering\n"
        "- APPROPRIATE BODY COVERAGE: Ensure proper coverage for the occasion (top+bottom OR dress)\n"
        "- REQUIRED FOOTWEAR: Include shoes based on context (not needed for sleep/lounging)\n"
        "- WEATHER APPROPRIATENESS: Items suitable for stated weather conditions\n"
        "- PRACTICAL COMPLETENESS: Person can actually go out dressed like this\n\n"
        
        "FOOTWEAR VALIDATION - CRITICAL:\n"
        "- REJECT if sport-specific shoes used outside their context:\n"
        "  * Golf shoes NOT for casual dinner\n"
        "  * Climbing shoes NOT for office\n"
        "  * Cleats NOT for shopping\n"
        "  * Ski boots NOT for summer events\n"
        "- FLAG mismatched footwear formality:\n"
        "  * Athletic shoes with formal attire (unless intentional streetwear)\n"
        "  * Flip-flops with business wear\n"
        "  * Hiking boots with cocktail dress\n"
        "- ENSURE footwear matches activity level:\n"
        "  * Running shoes for running/gym\n"
        "  * Dress shoes for formal events\n"
        "  * Casual sneakers for everyday wear\n\n"
        
        "COLOR COORDINATION CHECKS:\n"
        "- HARMONY RULES: Use complementary, analogous, monochromatic, or neutral+accent combinations\n"
        "- AVOID CLASHES: No red+green unless intentional, no more than 3-4 main colors\n"
        "- OCCASION FORMALITY: Professional = neutrals + max 1 accent, casual = more flexibility\n"
        "- SPECIFIC GUIDELINES: Denim works with everything, earth tones harmonize, neutrals are versatile\n\n"
        
        "CONTEXT AWARENESS:\n"
        "- Beach/pool: Swimwear + sandals is complete\n"
        "- Office: Professional coverage + dress shoes/loafers + conservative colors\n"
        "- Gym: Activewear + athletic shoes is complete\n"
        "- Golf: Golf attire + golf shoes ONLY\n"
        "- Formal: Complete coverage + dress shoes + sophisticated color combinations\n"
        "- Casual: Relaxed requirements but still coordinated + versatile footwear\n\n"
        
        'Return ONLY JSON: {"is_valid": true, "coverage_issues": [], "color_issues": [], "combined_feedback": "Specific improvement advice", "severity": "minor"}'
    ),
)

wardrobe_analyst_agent = Agent(
    name="Wardrobe Style Analyst",
    model="gpt-4o",
    instructions=(
        "You are an expert wardrobe analyst who provides qualitative closet analysis and styling insights.\n\n"
        
        "IMPORTANT: Focus ONLY on qualitative analysis. Do NOT generate or return any numerical scores.\n\n"
        
        "ANALYSIS METHODOLOGY:\n"
        "1. STYLE PROFILING: Identify dominant aesthetic patterns and personal brand\n"
        "2. COLOR PALETTE ANALYSIS: Assess color distribution and harmony\n"
        "3. CATEGORY COVERAGE: Identify wardrobe gaps and oversupply\n"
        "4. FORMALITY RANGE: Evaluate occasion readiness from casual to formal\n"
        "5. INVESTMENT PRIORITIES: Identify high-impact additions and optimization opportunities\n\n"
        
        "STYLE ANALYSIS GUIDELINES:\n"
        "- DOMINANT STYLES: Identify top 3 most represented style aesthetics (e.g., minimalist, bohemian, classic)\n"
        "- AESTHETIC DESCRIPTION: Provide 2-3 sentence summary of the overall wardrobe personality\n"
        "- STYLE EVOLUTION: Note any conflicting styles that could be refined\n\n"
        
        "COLOR PALETTE ANALYSIS:\n"
        "- PRIMARY COLORS: Most frequently worn colors (neutrals + dominants)\n"
        "- ACCENT COLORS: Secondary colors used for interest\n"
        "- NEUTRAL FOUNDATION: Base colors that anchor the wardrobe\n"
        "- PALETTE HARMONY: Rate as 'cohesive', 'varied', or 'chaotic'\n"
        "- MISSING COLORS: Identify colors that would enhance the existing palette\n\n"
        
        "CATEGORY COVERAGE ASSESSMENT:\n"
        "- WELL-COVERED: Categories with 3+ versatile pieces\n"
        "- GAPS: Missing essential categories or insufficient variety\n"
        "- OVERSUPPLIED: Categories with redundant or similar items\n"
        "- VERSATILITY GAPS: Missing pieces that would unlock multiple outfits\n\n"
        
        "SEASONAL ANALYSIS:\n"
        "- Score each season 0-1 based on weather-appropriate pieces\n"
        "- Identify specific seasonal gaps (e.g., 'missing winter coats', 'no summer dresses')\n"
        "- Calculate all-season percentage (pieces that work year-round)\n\n"
        
        "INSIGHT GENERATION:\n"
        "- Generate OBSERVATIONAL insights about wardrobe patterns and characteristics\n"
        "- Present insights as neutral observations, not problems to fix\n"
        "- Order insights from most prominent/notable to least prominent\n"
        "- Focus on what IS rather than what SHOULD BE\n"
        "- Examples: 'Neutral-Heavy Palette', 'Casual-Dominant Style', 'Strong Seasonal Bias'\n\n"
        
        "RECOMMENDATION CRITERIA:\n"
        "For each recommendation, provide comprehensive context:\n"
        "- ESSENTIAL: Items that fill fundamental gaps limiting outfit creation\n"
        "- RECOMMENDED: Pieces that would unlock multiple new combinations\n"
        "- NICE-TO-HAVE: Items for style refinement or special occasions\n\n"
        
        "REASONING MUST INCLUDE:\n"
        "1. SPECIFIC GAP: What's missing that this item addresses\n"
        "2. WARDROBE INTEGRATION: Which existing items it would pair with\n"
        "3. OUTFIT POTENTIAL: New combinations it would enable\n"
        "4. STYLE COHESION: How it fits the existing aesthetic\n"
        "Example reasoning: 'Your wardrobe lacks mid-layer options for transitional weather. "
        "A navy blazer would bridge the formality gap between your casual tees and dress shirts, "
        "pairing with your existing dark jeans for smart-casual looks and your dress pants for business occasions. "
        "This single piece would unlock 5+ new outfit combinations while maintaining your minimalist aesthetic.'\n\n"
        
        "STYLE NOTES MUST INCLUDE:\n"
        "- Specific existing items to pair with\n"
        "- Occasions it prepares you for\n"
        "- Color coordination with current palette\n"
        "- Seasonal versatility gained\n"
        "- Consider budget implications ($, $$, $$$)\n\n"
        
        
        "CRITICAL RESPONSE FORMAT:\n"
        "Return ONLY valid JSON with EXACT field names (snake_case). No markdown, no explanations.\n"
        "Required JSON structure:\n"
        "{\n"
        '  "style_profile": {\n'
        '    "dominant_styles": ["style1", "style2", "style3"],\n'
        '    "secondary_styles": ["style4", "style5"],\n'
        '    "style_distribution": {"casual": 0.6, "business": 0.3, "formal": 0.1},\n'
        '    "aesthetic_description": "2-3 sentence description",\n'
        '  },\n'
        '  "color_analysis": {\n'
        '    "primary_colors": ["navy", "white", "black"],\n'
        '    "accent_colors": ["red", "blue"],\n'
        '    "neutral_colors": ["gray", "beige"],\n'
        '    "palette_harmony": "cohesive",\n'
        '    "missing_colors": ["burgundy", "forest-green"]\n'
        '  },\n'
        '  "category_breakdown": {\n'
        '    "well_covered": ["top", "casual"],\n'
        '    "gaps": ["formal-shoes", "winter-coats"],\n'
        '    "oversupplied": ["t-shirts"],\n'
        '    "versatility_gaps": ["blazer", "dress-pants"]\n'
        '  },\n'
        '  "key_insights": [\n'
        '    {\n'
        '      "title": "Monochromatic Foundation",\n'
        '      "description": "Wardrobe centers around a black, white, and gray palette with 80% of items in these neutral tones",\n'
        '      "category": "color"\n'
        '    },\n'
        '    {\n'
        '      "title": "Casual-Focused Collection",\n'
        '      "description": "Collection shows strong preference for relaxed styles with 85% casual wear and minimal formal pieces",\n'
        '      "category": "style"\n'
        '    },\n'
        '    {\n'
        '      "title": "Spring-Summer Emphasis",\n'
        '      "description": "Seasonal distribution favors warmer months with stronger coverage in spring/summer categories",\n'
        '      "category": "seasonal"\n'
        '    }\n'
        '  ],\n'
        '  "recommendations": [\n'
        '    {\n'
        '      "item_type": "Navy Blazer",\n'
        '      "reasoning": "You have 0 blazers but 5 dress shirts and 3 dress pants that lack a coordinating layer. A navy blazer would fill the smart-casual gap, working with 80% of your existing wardrobe including your white/blue shirts, gray pants, and dark jeans. This addresses the missing formality bridge between casual and business wear.",\n'
        '      "priority": "essential",\n'
        '      "estimated_budget": "$$",\n'
        '      "style_notes": "Pair with existing white Oxford + dark jeans for dates, or gray dress pants + blue shirt for meetings. Works across 3 seasons with your current pieces. The navy color complements your blue/gray/black palette perfectly."\n'
        '    }\n'
        '  ],\n'
        '  "wardrobe_summary": "2-3 sentence overview of the wardrobe",\n'
        '  "next_steps": ["Step 1", "Step 2", "Step 3"]\n'
        "}\n\n"
        "CRITICAL: Use exact field names above. Make insights observational and neutral, recommendations actionable and supportive."
    )
)

async def analyze_item_colors(req: AnalyzeItemRequest) -> ColorAnalysisResponse:
    """Stage 1: Dedicated color analysis using direct GPT-4o Vision API"""
    print("[OpenAI] GPT-4o color analysis start", {"photos": len(req.photo_urls), "name": req.name})
    
    user_notes = req.notes.strip() if req.notes else ""
    
    # Prepare vision analysis request with OpenAI API format
    message_content = [
        {
            "type": "text",
            "text": (
                f"EXPERT COLOR ANALYSIS TASK:\n"
                f"Analyze ONLY the colors of the specific garment named: '{req.name}'\n\n"
                f"Item Name: {req.name}\n"
                f"User Description/Notes: {user_notes or 'No additional notes provided'}\n\n"
                f"CRITICAL FOCUS INSTRUCTIONS:\n"
                f"1. ANALYZE ONLY THE GARMENT: '{req.name}' - Completely ignore:\n"
                f"   - Background colors (walls, furniture, settings)\n"
                f"   - Other clothing items worn by the person\n"
                f"   - Skin tone, hair color, or any person-related colors\n"
                f"   - Accessories unless they ARE the named item\n"
                f"   - Shoes, bags, jewelry unless they ARE the named item\n"
                f"   - Any colors not physically part of the '{req.name}' garment\n\n"
                f"2. GARMENT IDENTIFICATION:\n"
                f"   - If multiple items are visible, focus ONLY on the '{req.name}'\n"
                f"   - Look for the specific garment type in the item name\n"
                f"   - If the garment has multiple parts (e.g., set), analyze ALL parts of the '{req.name}'\n\n"
                f"COMPREHENSIVE COLOR VOCABULARY - Use these specific colors:\n"
                f"NEUTRALS: black, white, gray, charcoal, slate, dove-gray, cream, ivory, beige, tan, taupe, mushroom, greige\n"
                f"BLUES: navy, royal-blue, cobalt, sky-blue, powder-blue, baby-blue, teal, turquoise, aqua, periwinkle, steel-blue\n"
                f"REDS: burgundy, maroon, wine, crimson, cherry, coral, salmon, rose, blush, brick-red, rust\n"
                f"GREENS: forest-green, emerald, sage, olive, mint, lime, seafoam, hunter-green, moss, jade\n"
                f"BROWNS: chocolate, coffee, espresso, camel, cognac, mahogany, walnut, amber, bronze\n"
                f"YELLOWS: mustard, gold, butter, lemon, canary, honey, saffron, champagne\n"
                f"PURPLES: lavender, lilac, plum, eggplant, violet, mauve, orchid, amethyst\n"
                f"PINKS: rose, blush, fuchsia, magenta, dusty-rose, ballet-pink, hot-pink\n"
                f"ORANGES: peach, apricot, tangerine, burnt-orange, copper, terracotta\n"
                f"METALLICS: gold, silver, bronze, copper, rose-gold, pewter, gunmetal\n\n"
                f"PATTERN ANALYSIS:\n"
                f"- solid: Single color or very subtle variations\n"
                f"- striped: Lines of different colors (horizontal, vertical, diagonal)\n"
                f"- plaid: Intersecting lines creating squares/rectangles\n"
                f"- checkered: Regular squares of alternating colors\n"
                f"- polka-dot: Circular dots on background\n"
                f"- floral: Flower patterns\n"
                f"- geometric: Abstract shapes, triangles, circles\n"
                f"- paisley: Teardrop-shaped patterns\n"
                f"- abstract: Non-representational designs\n"
                f"- animal-print: Leopard, zebra, snake, etc.\n"
                f"- textured: Solid color with fabric texture creating visual interest\n\n"
                f"UNDERTONE ANALYSIS:\n"
                f"- WARM: Contains red, orange, or yellow undertones (corals, warm grays, golden tones)\n"
                f"- COOL: Contains blue, green, or purple undertones (true blues, cool grays, blue-based colors)\n"
                f"- NEUTRAL: No strong temperature bias (pure white, true gray, balanced beiges)\n\n"
                f"COLOR INTENSITY LEVELS:\n"
                f"- muted: Dusty, grayed-down, faded appearance\n"
                f"- medium: Clear, true colors without being overly bright\n"
                f"- vibrant: Rich, saturated, eye-catching colors\n"
                f"- neon: Artificially bright, fluorescent colors\n\n"
                f"ANALYSIS PROCESS:\n"
                f"1. First, identify the '{req.name}' garment in each image\n"
                f"2. List ALL colors visible on that specific garment in order of prominence\n"
                f"3. Determine the most dominant color (primaryColor)\n"
                f"4. Identify any patterns or prints\n"
                f"5. Estimate color distribution percentages\n"
                f"6. Analyze undertones and intensity\n"
                f"7. If user notes mention colors, cross-reference with your analysis\n\n"
                f"LIGHTING COMPENSATION:\n"
                f"- Account for different lighting conditions across images\n"
                f"- Look for the most color-accurate image (natural lighting preferred)\n"
                f"- If colors appear different across images, use the most representative\n\n"
                f"RETURN ONLY valid JSON with these exact fields:\n"
                f'{{"colors": ["primary-color", "secondary-color"], "primaryColor": "most-dominant-color", "secondaryColors": ["accent1", "accent2"], "pattern": "solid|striped|floral|etc", "colorDistribution": "60% primary, 30% secondary, 10% accent", "undertones": "warm|cool|neutral", "colorIntensity": "muted|medium|vibrant|neon", "colorDominance": "monochrome|primary-color|multi-color|colorblock", "patternDescription": "detailed pattern description if applicable", "confidence": 0.95}}'
            )
        }
    ]
    
    # Add images to the content
    for i, url in enumerate(req.photo_urls[:3]):  # Limit to 3 images for cost/performance
        message_content.append({
            "type": "image_url",
            "image_url": {"url": url}
        })
    
    try:
        print("[OpenAI] Calling GPT-4o Vision API...")
        
        # Call OpenAI Vision API directly
        response = await openai_client.chat.completions.create(
            model="gpt-4o",
            messages=[
                {
                    "role": "user",
                    "content": message_content
                }
            ],
            max_tokens=1000,
            temperature=0.1
        )
        
        if not response.choices or not response.choices[0].message.content:
            raise HTTPException(status_code=500, detail="No output from color analyst")
        
        raw_output = response.choices[0].message.content
        print("[OpenAI] Raw GPT-4o output:", repr(raw_output))
        
        # Extract JSON from markdown code blocks if present
        json_match = re.search(r'```(?:json)?\s*(\{.*?\})\s*```', raw_output, re.DOTALL)
        if json_match:
            json_str = json_match.group(1)
        else:
            json_str = raw_output
        
        color_data = json.loads(json_str)
        print("[OpenAI] Vision color analysis successful:", {
            "primaryColor": color_data.get("primaryColor"),
            "colors": color_data.get("colors"),
            "pattern": color_data.get("pattern"),
            "confidence": color_data.get("confidence", 0.9)
        })
        return ColorAnalysisResponse(**color_data)
        
    except Exception as e:
        print("[OpenAI] Color analysis error:", str(e))
        raise HTTPException(status_code=500, detail=f"Color analysis failed: {e}")

@app.post("/classify-category", response_model=CategoryResult)
async def classify_category(req: ClassifyCategoryRequest):
    """
    Classify clothing item category using visual analysis with optional name context
    
    This endpoint focuses purely on category classification using computer vision.
    It's designed to provide accurate categorization for the outfit generation system.
    """
    print("[Agents] /classify-category start", {
        "photos": len(req.photo_urls), 
        "name": req.item_name,
        "has_name_context": bool(req.item_name)
    })
    
    if not req.photo_urls:
        raise HTTPException(status_code=400, detail="At least one photo URL is required")
    
    try:
        result = await classify_item_category(req.photo_urls, req.item_name)
        
        print("[Agents] /classify-category complete", {
            "category": result.category,
            "confidence": result.confidence,
            "used_name": result.used_name_context
        })
        
        return result
    except Exception as e:
        print("[Agents] /classify-category error:", str(e))
        raise HTTPException(status_code=500, detail=f"Category classification failed: {e}")

@app.post("/analyze-item", response_model=AnalyzeItemResponse)
async def analyze_item(req: AnalyzeItemRequest):
    print("[Agents] /analyze-item start - Three-stage analysis", {"photos": len(req.photo_urls), "name": req.name})
    print("[Agents] Photo URLs:", req.photo_urls[:2])  # Log first 2 URLs
    
    # Stage 1: Category Classification
    print("[Agents] Stage 1: Starting category classification...")
    category_result = await classify_item_category(req.photo_urls, req.name)
    print("[Agents] Stage 1 complete:", {
        "category": category_result.category,
        "subcategory": category_result.subcategory,
        "confidence": category_result.confidence,
        "used_name": category_result.used_name_context
    })
    
    # Log if visual classification differs from name
    if req.name and category_result.used_name_context:
        print(f"[Agents] Category classification used name context for '{req.name}' → '{category_result.category}'")
    elif req.name and not category_result.used_name_context:
        print(f"[Agents] Category classification ignored name '{req.name}', visual analysis → '{category_result.category}'")
    
    # Stage 2: Color Analysis
    print("[Agents] Stage 2: Starting color analysis...")
    color_analysis = await analyze_item_colors(req)
    print("[Agents] Stage 2 complete:", {
        "primaryColor": color_analysis.primaryColor,
        "pattern": color_analysis.pattern,
        "confidence": color_analysis.confidence
    })
    
    # Stage 3: Detailed Catalog Analysis with pre-determined category and colors
    print("[Agents] Stage 3: Starting detailed catalog analysis...")
    user_notes = req.notes.strip() if req.notes else ""
    
    prompt = (
        f"Analyze this clothing item using pre-analyzed color data and category classification.\n\n"
        f"Item Name: {req.name}\n"
        f"User Description/Notes: {user_notes or 'No additional notes provided'}\n\n"
        f"Available Images ({len(req.photo_urls)} total):\n"
        f"{chr(10).join([f'- Image {i+1}: {url}' for i, url in enumerate(req.photo_urls)])}\n\n"
        
        f"PRE-DETERMINED CATEGORY (Use this - DO NOT re-classify):\n"
        f"- Category: {category_result.category}\n"
        f"- Subcategory: {category_result.subcategory or 'To be determined'}\n"
        f"- Classification Confidence: {category_result.confidence}\n"
        f"- Visual Analysis: {category_result.reasoning}\n\n"
        
        f"PRE-ANALYZED COLOR DATA (Use this - DO NOT re-analyze colors):\n"
        f"- Colors: {color_analysis.colors}\n"
        f"- Primary Color: {color_analysis.primaryColor}\n"
        f"- Secondary Colors: {color_analysis.secondaryColors or 'None'}\n"
        f"- Pattern: {color_analysis.pattern or 'solid'}\n"
        f"- Color Distribution: {color_analysis.colorDistribution or 'N/A'}\n"
        f"- Undertones: {color_analysis.undertones}\n"
        f"- Color Intensity: {color_analysis.colorIntensity}\n"
        f"- Color Dominance: {color_analysis.colorDominance}\n"
        f"- Pattern Description: {color_analysis.patternDescription or 'N/A'}\n\n"
        
        f"ANALYSIS FOCUS (Category and colors already determined - focus on these attributes):\n"
        f"- ANALYZE ONLY THE SPECIFIC GARMENT: '{req.name}'\n"
        f"- Refine subcategory if needed (keep category as '{category_result.category}')\n"
        f"- Material composition and fabric type\n"
        f"- Style tags and fashion descriptors\n"
        f"- Seasonal appropriateness\n"
        f"- Formality level\n"
        f"- Fit and silhouette\n"
        f"- Brand identification (if visible)\n"
        f"- Construction details and design elements\n"
        f"- Occasions and styling versatility\n"
        f"- IGNORE background elements, other clothing, people, accessories (unless analyzing accessories)\n\n"
        
        f"REQUIRED FIELD CONSTRAINTS:\n"
        f"- category: MUST be one of: 'top', 'bottom', 'outerwear', 'dress', 'shoes', 'accessory', 'underwear', 'swimwear', 'activewear', 'sleepwear', 'bag', 'jewelry', 'other'\n"
        f"- formality: MUST be one of: 'casual', 'smart-casual', 'business', 'business-formal', 'formal', 'athleisure', 'loungewear'\n"
        f"- season: MUST use only: 'spring', 'summer', 'fall', 'winter', 'all-season'\n"
        f"- fit: MUST be one of: 'slim', 'regular', 'relaxed', 'oversized'\n"
        f"- sleeveLength: 'sleeveless', 'short', 'three-quarter', 'long', 'extra-long'\n"
        f"- transparency: 'opaque', 'semi-sheer', 'sheer', 'mesh'\n"
        f"- layeringRole: 'base', 'mid', 'outer', 'standalone'\n"
        f"- careLevel: 'easy', 'moderate', 'high-maintenance'\n"
        f"- wrinkleResistance: 'wrinkle-free', 'wrinkle-resistant', 'wrinkles-easily'\n"
        f"- stretchLevel: 'no-stretch', 'slight-stretch', 'stretchy', 'very-stretchy'\n"
        f"- comfortLevel: 'very-comfortable', 'comfortable', 'moderate', 'restrictive'\n"
        f"- printScale: 'solid', 'small-print', 'medium-print', 'large-print', 'oversized-print'\n"
        f"- trendStatus: 'classic', 'trendy', 'vintage', 'timeless', 'statement'\n"
        f"- stylingVersatility: 'very-versatile', 'versatile', 'moderate', 'specific-use'\n"
        f"- undertones: 'warm', 'cool', 'neutral' (analyze carefully based on color temperature)\n\n"
        f"ANALYSIS INSTRUCTIONS:\n"
        f"Analyze ONLY the '{req.name}' garment - ignore everything else:\n"
        f"- If the '{req.name}' is being worn: focus on that garment's details, not body shape/fit on person\n"
        f"- If the '{req.name}' is laid flat: analyze its construction, fabric, and design elements\n"
        f"- Extract intrinsic properties of the '{req.name}' only (material, cut, style, etc.)\n"
        f"- Do NOT analyze colors, patterns, or details from other visible clothing items\n"
        f"- Do NOT let other visible garments influence your category determination\n\n"
        f"REQUIRED COORDINATION ANALYSIS - You MUST provide specific values for these fields:\n"
        f"- timeOfDay: When is this item appropriate? ['morning','afternoon','evening','night'] - be specific about 2-3 options\n"
        f"- weatherSuitability: What weather works? ['sunny','rainy','windy','snowy','humid','cold','mild'] - provide 3-4 options\n"
        f"- temperatureRange: Be specific like '15-25°C', '10-20°C', 'above 25°C', 'below 10°C'\n"
        f"- colorCoordinationNotes: Write specific pairing advice based on the PRE-ANALYZED COLORS:\n"
        f"  * Use the provided color data: {color_analysis.colors}, {color_analysis.undertones} undertones, {color_analysis.colorIntensity} intensity\n"
        f"  * Suggest specific colors that work well with {color_analysis.primaryColor}\n"
        f"  * Consider the {color_analysis.undertones} undertones when recommending pairings\n"
        f"  * Mention colors to avoid based on the analyzed color data\n"
        f"- stylingNotes: Practical styling advice (e.g., 'Tuck into high-waisted bottoms for a polished look. Can be layered under blazers.')\n"
        f"- bestPairedWith: 3-4 categories that work well ['top','bottom','outerwear','dress','shoes','accessory'] based on this item's category\n"
        f"- avoidCombinations: 2-3 specific things to avoid (e.g., 'Avoid pairing with other busy patterns', 'Don't wear with casual sneakers')\n"
        f"- occasions: Be comprehensive ['work','casual','date','party','sport','travel','formal','business'] - provide 4-6 relevant options\n\n"
        f"REQUIRED DETAILED GARMENT ANALYSIS - You MUST analyze these physical characteristics:\n"
        f"- flatteringFor: What body types does this work well for? ['petite','tall','curvy','athletic','pear','apple','hourglass','rectangle'] - provide 3-4 relevant options\n"
        f"- designDetails: List specific visible details ['buttons','zipper','pockets','pleats','darts','seams','hem','collar','cuffs','belt-loops','embroidery','appliques','studs','buckles'] - be thorough\n"
        f"- texture: Describe the fabric feel/appearance ['smooth','textured','ribbed','cable-knit','waffle','corduroy','terry','velvet','satin','matte','shiny','brushed','rough','soft'] - be specific\n"
        f"- silhouette: Describe the overall shape ['fitted','loose','oversized','slim','straight','a-line','flowy','structured','boxy','tapered','flared','bodycon','relaxed'] - choose 1-2 primary descriptors\n"
        f"- length: For tops/dresses/outerwear, be specific ['crop','waist-length','hip-length','mid-thigh','knee-length','midi','maxi','floor-length','tunic','longline'] - choose the most accurate\n"
        f"- neckline: For tops/dresses, describe precisely ['crew','v-neck','scoop','boat','off-shoulder','halter','strapless','mock-neck','turtleneck','cowl','square','sweetheart','high-neck'] - be exact\n\n"
        f"COLOR ANALYSIS EXAMPLES:\n"
        f"- Navy blazer: colors=['navy'], primaryColor='navy', undertones='cool', colorIntensity='medium', colorDominance='monochrome', colorCoordinationNotes='This classic navy pairs beautifully with white, cream, light gray, and burgundy. Excellent with gold or silver accessories. Avoid pairing with black as it can look muddy.'\n"
        f"- Red floral blouse: colors=['red','green','white'], primaryColor='red', undertones='warm', colorIntensity='vibrant', colorDominance='multi-color', colorCoordinationNotes='The warm red base works well with cream, beige, warm gray, and navy. The green accents pair with other earth tones. Avoid cool blues or purples that clash with the warm undertones.'\n"
        f"- Cream cashmere sweater: colors=['cream'], primaryColor='cream', undertones='neutral', colorIntensity='muted', colorDominance='monochrome', colorCoordinationNotes='This versatile neutral works with both warm and cool palettes. Beautiful with navy, charcoal, camel, burgundy, or olive. Avoid pairing with pure white as it will look dingy in comparison.'\n\n"
        
        f"COMPREHENSIVE EXAMPLES FOR REFERENCE:\n"
        f"- White button-down shirt: neckline='crew', texture='smooth', silhouette='fitted', length='hip-length', designDetails=['buttons','collar','cuffs','chest-pocket'], flatteringFor=['hourglass','rectangle','athletic','petite']\n"
        f"- Black skinny jeans: silhouette='slim', texture='smooth', designDetails=['zipper','pockets','belt-loops','seams'], flatteringFor=['tall','hourglass','athletic','rectangle']\n"
        f"- Chunky knit sweater: texture='cable-knit', silhouette='oversized', neckline='crew', designDetails=['ribbed-hem','ribbed-cuffs'], flatteringFor=['petite','pear','apple','rectangle']\n"
        f"- Midi dress: length='midi', silhouette='a-line', neckline='v-neck', designDetails=['zipper','darts','hem'], flatteringFor=['curvy','hourglass','pear','tall']\n\n"
        f"Return ONLY valid JSON - all fields are optional except: description, category, subcategory, season, formality, styleTags:\n"
        f'{{"description":"","category":"","subcategory":"","material":[],"season":[],"formality":"","styleTags":[],"brand":"","fit":"","neckline":"","sleeveLength":"","length":"","silhouette":"","texture":"","transparency":"","layeringRole":"","occasions":[],"timeOfDay":[],"weatherSuitability":[],"temperatureRange":"","colorCoordinationNotes":"","stylingNotes":"","avoidCombinations":[],"bestPairedWith":[],"careLevel":"","wrinkleResistance":"","stretchLevel":"","comfortLevel":"","designDetails":[],"printScale":"","vintageEra":"","trendStatus":"","flatteringFor":[],"stylingVersatility":"","aiAttributes":{{}}}}'
    )
    
    print("[Agents] Sending prompt to catalog agent...")
    
    try:
        # Use async runner instead of sync to avoid event loop issues
        result = await Runner.run(catalog_agent, prompt)
        
        if not result.final_output:
            print("[Agents] /analyze-item no output")
            raise HTTPException(status_code=500, detail="No output from catalog agent")
        
        print("[Agents] Raw AI output:", repr(result.final_output))
        
        # Extract JSON from markdown code blocks if present
        raw_output = result.final_output
        json_match = re.search(r'```(?:json)?\s*(\{.*?\})\s*```', raw_output, re.DOTALL)
        if json_match:
            json_str = json_match.group(1)
            print("[Agents] Extracted JSON from markdown:", json_str[:200] + "..." if len(json_str) > 200 else json_str)
        else:
            json_str = raw_output
            print("[Agents] Using raw output as JSON")
        
        catalog_data = json.loads(json_str)
        
        # Combine all three analyses: category, color, and detailed catalog
        combined_data = {
            **catalog_data,
            # Override with pre-determined category
            "category": category_result.category,
            "subcategory": category_result.subcategory or catalog_data.get("subcategory"),
            # Override with pre-analyzed color data
            "colors": color_analysis.colors,
            "primaryColor": color_analysis.primaryColor,
            "pattern": color_analysis.pattern,
            "undertones": color_analysis.undertones,
            "colorIntensity": color_analysis.colorIntensity,
            "colorDominance": color_analysis.colorDominance,
        }
        
        print("[Agents] Three-stage analysis complete:", {
            "category": combined_data.get("category"),
            "subcategory": combined_data.get("subcategory"),
            "primaryColor": combined_data.get("primaryColor"),
            "colors": combined_data.get("colors"),
            "pattern": combined_data.get("pattern"),
            "formality": combined_data.get("formality"),
            "category_confidence": category_result.confidence,
            "color_confidence": color_analysis.confidence
        })
        
        return AnalyzeItemResponse(**combined_data)
    except Exception as e:
        print("[Agents] /analyze-item error:", str(e))
        print("[Agents] Exception type:", type(e).__name__)
        print("[Agents] Full exception details:", repr(e))
        
        # Check if it's an OpenAI API error
        if hasattr(e, 'response') and hasattr(e.response, 'json'):
            try:
                error_details = e.response.json()
                print("[Agents] OpenAI API error details:", error_details)
            except:
                pass
                
        raise HTTPException(status_code=500, detail=f"Agent analysis failed: {e}")

async def analyze_outfit_requirements(
    user_request: str, 
    vibe: Optional[str] = None,
    weather: Optional[str] = None,
    formality: Optional[int] = None,
    time_of_day: Optional[str] = None
) -> OutfitRequirements:
    """Analyze user request to determine outfit requirements"""
    print("[Agents] Requirements analysis start", {"request": user_request})
    
    # Build context information
    context_info = []
    if vibe:
        context_info.append(f"Desired Vibe: {vibe}")
    if weather:
        context_info.append(f"Weather: {weather}")
    if formality:
        formality_labels = {1: "Very Casual", 2: "Casual", 3: "Business Casual", 4: "Formal", 5: "Black Tie"}
        context_info.append(f"Formality Level: {formality_labels.get(formality, 'Business Casual')}")
    if time_of_day:
        context_info.append(f"Time of Day: {time_of_day}")
    
    context_section = "\n".join(context_info) if context_info else "No additional context provided"
    
    prompt = (
        f"OUTFIT REQUEST ANALYSIS:\n"
        f"User Request: '{user_request}'\n"
        f"Additional Context:\n{context_section}\n\n"
        f"Analyze this request and the provided context to determine what clothing categories are needed.\n"
        f"Use ALL available information (request + context) to make decisions.\n\n"
        f"Consider the context, occasion, and activity to determine:\n"
        f"1. ESSENTIAL categories (must have)\n"
        f"2. RECOMMENDED categories (should have if available)\n"
        f"3. OPTIONAL categories (nice to have)\n"
        f"4. AVOID categories (inappropriate for this occasion)\n\n"
        f"Context Guidelines:\n"
        f"- VIBE affects style choices (Professional = conservative, Edgy = bold choices, Romantic = feminine touches)\n"
        f"- WEATHER affects layers (Cold = outerwear needed, Hot = lightweight/breathable, Rainy = weather protection)\n"
        f"- FORMALITY affects category priorities (1-2 = casual wear, 3 = business appropriate, 4-5 = formal wear)\n"
        f"- TIME OF DAY affects color/style (Evening = darker/sophisticated, Morning = fresh/professional)\n\n"
        f"Think about:\n"
        f"- Is this casual, business, formal, athletic, or beach/swim related?\n"
        f"- What activities will they be doing?\n"
        f"- What coverage is appropriate for the weather and formality?\n"
        f"- What would be inappropriate or uncomfortable?\n"
        f"- How does the desired vibe influence category choices?\n\n"
        f"Use EXACT category names: top, bottom, outerwear, dress, shoes, accessory, underwear, swimwear, activewear, sleepwear, bag, jewelry, other\n\n"
        f"For essential_categories, provide alternatives as nested arrays:\n"
        f"- Standard outfit: [['top', 'bottom'], ['dress']] (either top+bottom OR dress)\n"
        f"- Beach outfit: [['swimwear']] (swimwear required)\n"
        f"- Athletic outfit: [['activewear']] (activewear pieces required)\n"
        f"- Formal outfit: [['dress'], ['top', 'bottom']] (dress preferred, or formal top+bottom)\n\n"
        f"Return ONLY JSON with this exact structure:\n"
        f'{{"essential_categories": [[]], "recommended_categories": [], "optional_categories": [], "avoid_categories": [], "min_items": 2, "max_items": 5, "occasion_type": "", "special_notes": ""}}'
    )
    
    try:
        result = await Runner.run(requirements_agent, prompt)
        
        if not result.final_output:
            print("[Agents] Requirements analysis no output")
            raise HTTPException(status_code=500, detail="No output from requirements agent")
        
        print("[Agents] Raw requirements output:", repr(result.final_output))
        
        # Extract JSON from markdown code blocks if present
        raw_output = result.final_output
        json_match = re.search(r'```(?:json)?\s*(\{.*?\})\s*```', raw_output, re.DOTALL)
        if json_match:
            json_str = json_match.group(1)
            print("[Agents] Extracted requirements JSON:", json_str[:200] + "..." if len(json_str) > 200 else json_str)
        else:
            json_str = raw_output
            print("[Agents] Using raw output as requirements JSON")
        
        requirements_data = json.loads(json_str)
        print("[Agents] Requirements analysis complete:", {
            "essential": requirements_data.get("essential_categories"),
            "recommended": requirements_data.get("recommended_categories"),
            "avoid": requirements_data.get("avoid_categories"),
            "occasion": requirements_data.get("occasion_type")
        })
        
        return OutfitRequirements(**requirements_data)
    except Exception as e:
        print("[Agents] Requirements analysis error:", str(e))
        raise HTTPException(status_code=500, detail=f"Requirements analysis failed: {e}")

async def classify_item_category(photo_urls: List[str], item_name: Optional[str] = None) -> CategoryResult:
    """
    Classify item category using visual analysis with optional name context
    
    Args:
        photo_urls: List of image URLs to analyze
        item_name: Optional name for context (use cautiously)
    
    Returns:
        CategoryResult with category, subcategory, confidence
    """
    print("[Agents] Category classification start", {"photos": len(photo_urls), "name": item_name})
    
    # Prepare vision analysis request with OpenAI API format
    prompt_text = (
        f"EXPERT CATEGORY CLASSIFICATION TASK:\n"
        f"Analyze these {len(photo_urls)} images to determine the clothing category.\n\n"
        f"VALID CATEGORIES (MUST use one of these):\n"
        f"- top: shirts, blouses, t-shirts, sweaters, tanks, vests\n"
        f"- bottom: pants, jeans, skirts, shorts, leggings (non-athletic)\n"
        f"- outerwear: jackets, coats, blazers, cardigans, vests\n"
        f"- dress: dresses, gowns, jumpsuits, rompers (one-piece garments)\n"
        f"- shoes: all footwear\n"
        f"- accessory: scarves, belts, hats, gloves, ties\n"
        f"- underwear: undergarments, lingerie, bras (non-sports)\n"
        f"- swimwear: swimsuits, bikinis, swim trunks, board shorts, rash guards\n"
        f"- activewear: gym clothes, athletic wear, sports bras, athletic leggings, workout tops\n"
        f"- sleepwear: pajamas, nightgowns, robes, sleep sets\n"
        f"- bag: purses, backpacks, totes, clutches, handbags\n"
        f"- jewelry: necklaces, rings, bracelets, watches, earrings\n"
        f"- other: anything that doesn't fit the above categories\n\n"
        f"PRIMARY ANALYSIS: Look at the visual characteristics:\n"
        f"- Overall garment structure and shape\n"
        f"- How it would be worn on the body\n"
        f"- Functional purpose of the item\n"
        f"- Material and construction clues\n\n"
    )
    
    if item_name:
        prompt_text += (
            f"CONTEXT HINT: Item is labeled as '{item_name}'\n"
            f"- Use this ONLY if visual analysis is ambiguous\n"
            f"- Visual evidence takes priority over name\n"
            f"- If name conflicts with visual, explain why visual classification is correct\n\n"
        )
    
    prompt_text += (
        f"CLASSIFICATION RULES:\n"
        f"1. PRIMARY: Use visual analysis - how is it constructed, what does it cover?\n"
        f"2. SECONDARY: Consider item name only if visual analysis is ambiguous\n"
        f"3. One-piece garments that cover torso → 'dress'\n"
        f"4. Athletic material/design → 'activewear', not 'top'/'bottom'\n"
        f"5. Sports bras → 'activewear', regular bras → 'underwear'\n"
        f"6. Cardigans/blazers → 'outerwear', not 'top'\n"
        f"7. When multiple images: analyze all for complete context\n\n"
        
        f"COMMON DISAMBIGUATION:\n"
        f"- Athletic leggings → 'activewear' (performance fabric)\n"
        f"- Regular leggings → 'bottom' (casual fabric)\n"
        f"- Sports bra → 'activewear'\n"
        f"- Regular bra → 'underwear'\n"
        f"- Cardigan/blazer → 'outerwear'\n"
        f"- Romper/jumpsuit → 'dress' (one-piece)\n"
        f"- Bikini pieces → 'swimwear'\n\n"
        
        f"When multiple images provided:\n"
        f"- Look at all images for complete view (front, back, details)\n"
        f"- Identify the PRIMARY item if multiple items visible\n"
        f"- Focus on the most prominent/central clothing item\n\n"
        
        f"Return the category that BEST matches what you SEE in the images.\n"
        f"Be specific about your reasoning and confidence level.\n"
        f"If you used the name as context, set used_name_context to true.\n\n"
        
        f"RETURN ONLY valid JSON with these exact fields:\n"
        f'{{\"category\":\"valid_category_name\",\"subcategory\":\"optional_subcategory\",\"confidence\":0.9,\"reasoning\":\"visual analysis explanation\",\"used_name_context\":false}}'
    )
    
    message_content = [
        {
            "type": "text",
            "text": prompt_text
        }
    ]
    
    # Add images to the content
    for i, url in enumerate(photo_urls[:3]):  # Limit to 3 images for cost/performance
        message_content.append({
            "type": "image_url",
            "image_url": {"url": url}
        })
    
    try:
        print("[Agents] Calling GPT-4o Vision API for category classification...")
        
        # Call OpenAI Vision API directly
        response = await openai_client.chat.completions.create(
            model="gpt-4o",
            messages=[
                {
                    "role": "user",
                    "content": message_content
                }
            ],
            max_tokens=500,
            temperature=0.1
        )
        
        if not response.choices or not response.choices[0].message.content:
            print("[Agents] Category classification no output")
            raise HTTPException(status_code=500, detail="No output from category classifier")
        
        raw_output = response.choices[0].message.content
        print("[Agents] Raw category output:", repr(raw_output))
        
        # Extract JSON from markdown code blocks if present
        json_match = re.search(r'```(?:json)?\s*(\{.*?\})\s*```', raw_output, re.DOTALL)
        if json_match:
            json_str = json_match.group(1)
            print("[Agents] Extracted category JSON:", json_str[:200] + "..." if len(json_str) > 200 else json_str)
        else:
            json_str = raw_output
            print("[Agents] Using raw output as category JSON")
        
        category_data = json.loads(json_str)
        
        # Validate category is in allowed list
        VALID_CATEGORIES = ['top', 'bottom', 'outerwear', 'dress', 'shoes', 
                           'accessory', 'underwear', 'swimwear', 'activewear', 
                           'sleepwear', 'bag', 'jewelry', 'other']
        
        classified_category = category_data.get("category", "other")
        if classified_category not in VALID_CATEGORIES:
            print(f"[Agents] Invalid category '{classified_category}', mapping to 'other'")
            category_data["category"] = "other"
            category_data["confidence"] = category_data.get("confidence", 0.5) * 0.8  # Reduce confidence
            category_data["reasoning"] = f"Invalid category mapped to 'other': {category_data.get('reasoning', '')}"
        
        print("[Agents] Category classification complete:", {
            "category": category_data.get("category"),
            "subcategory": category_data.get("subcategory"),
            "confidence": category_data.get("confidence"),
            "used_name": category_data.get("used_name_context", False)
        })
        
        return CategoryResult(**category_data)
    except Exception as e:
        print("[Agents] Category classification error:", str(e))
        raise HTTPException(status_code=500, detail=f"Category classification failed: {e}")

def validate_outfit_against_requirements(outfit: OutfitSuggestion, closet_items: List, requirements: OutfitRequirements) -> bool:
    """Validate that an outfit meets the specified requirements"""
    
    # Get categories of items in the outfit
    item_lookup = {item.id: item for item in closet_items}
    outfit_items = [item_lookup.get(item_id) for item_id in outfit.itemIds]
    outfit_items = [item for item in outfit_items if item]  # Remove None values
    
    if not outfit_items:
        print(f"[Validation] No valid items found for outfit {outfit.title}")
        return False
    
    outfit_categories = [item.category for item in outfit_items]
    print(f"[Validation] Outfit '{outfit.title}' categories: {outfit_categories}")
    
    # Check 1: Essential categories - at least one combination must be satisfied
    essential_satisfied = False
    if requirements.essential_categories:
        for essential_combo in requirements.essential_categories:
            # Check if ALL categories in this combo are present
            if all(cat in outfit_categories for cat in essential_combo):
                essential_satisfied = True
                print(f"[Validation] Essential requirement satisfied: {essential_combo}")
                break
        
        if not essential_satisfied:
            print(f"[Validation] FAIL: No essential combination satisfied. Required: {requirements.essential_categories}")
            return False
    
    # Check 2: Avoid categories - none should be present
    if requirements.avoid_categories:
        forbidden_present = [cat for cat in requirements.avoid_categories if cat in outfit_categories]
        if forbidden_present:
            print(f"[Validation] FAIL: Forbidden categories present: {forbidden_present}")
            return False
    
    # Check 3: Item count within range
    item_count = len(outfit_items)
    if item_count < requirements.min_items or item_count > requirements.max_items:
        print(f"[Validation] FAIL: Item count {item_count} outside range {requirements.min_items}-{requirements.max_items}")
        return False
    
    print(f"[Validation] PASS: Outfit '{outfit.title}' meets all requirements")
    return True

def get_item_details(item_ids: List[str], closet_summary: List[dict]) -> List[dict]:
    """Get detailed item information for validation"""
    item_lookup = {item["id"]: item for item in closet_summary}
    return [item_lookup.get(item_id) for item_id in item_ids if item_lookup.get(item_id)]


def detect_duplicate_categories(selected_items: List[dict]) -> tuple[bool, str]:
    """
    Detect duplicate categories that violate outfit rules.
    Returns (has_duplicates, error_message)
    """
    category_counts = {}
    items_by_category = {}
    
    for item in selected_items:
        cat = item.get('category', '').lower()
        subcat = item.get('subcategory', '').lower()
        name = item.get('name', '').lower()
        
        if cat not in items_by_category:
            items_by_category[cat] = []
        items_by_category[cat].append(item)
        category_counts[cat] = category_counts.get(cat, 0) + 1
    
    errors = []
    
    # Check for multiple bottoms (never allowed)
    if category_counts.get('bottom', 0) > 1:
        errors.append(f"Multiple bottoms selected: {[i['name'] for i in items_by_category['bottom']]}")
    
    # Check for multiple shoes (never allowed)
    if category_counts.get('shoes', 0) > 1:
        errors.append(f"Multiple shoes selected: {[i['name'] for i in items_by_category['shoes']]}")
    
    # Check for multiple dresses (never allowed)
    if category_counts.get('dress', 0) > 1:
        errors.append(f"Multiple dresses selected: {[i['name'] for i in items_by_category['dress']]}")
    
    # Check for dress + bottom combination (illogical)
    if category_counts.get('dress', 0) > 0 and category_counts.get('bottom', 0) > 0:
        errors.append("Cannot wear dress with separate bottom")
    
    # Check for multiple tops (need to check if it's valid layering)
    if category_counts.get('top', 0) > 1:
        tops = items_by_category['top']
        # Check if it's valid layering
        has_base = any('tank' in t.get('subcategory', '').lower() or 
                      'undershirt' in t.get('name', '').lower() or
                      'base layer' in t.get('name', '').lower() for t in tops)
        has_outer = any('cardigan' in t.get('subcategory', '').lower() or
                       'blazer' in t.get('subcategory', '').lower() or
                       'jacket' in t.get('subcategory', '').lower() for t in tops)
        
        if not (has_base and has_outer):
            # Not valid layering - these are duplicate tops
            errors.append(f"Multiple tops without valid layering: {[t['name'] for t in tops]}")
    
    # Check for multiple outerwear (usually not needed)
    if category_counts.get('outerwear', 0) > 1:
        errors.append(f"Multiple outerwear items: {[i['name'] for i in items_by_category['outerwear']]}")
    
    if errors:
        return True, "; ".join(errors)
    return False, ""


def remove_duplicate_items(item_ids: List[str], items: List[dict]) -> List[str]:
    """Remove duplicate category items, keeping the first of each category"""
    kept_ids = []
    seen_categories = set()
    seen_shoes = False
    
    for item_id, item in zip(item_ids, items):
        cat = item.get('category', '').lower()
        
        # Special handling for strict single-item categories
        if cat == 'shoes':
            if not seen_shoes:
                kept_ids.append(item_id)
                seen_shoes = True
        elif cat == 'bottom' or cat == 'dress':
            if cat not in seen_categories:
                kept_ids.append(item_id)
                seen_categories.add(cat)
        else:
            # For other categories, keep all (accessories, tops for layering)
            kept_ids.append(item_id)
    
    return kept_ids

async def generate_single_outfit_with_validation(
    closet_summary: List[dict],
    requirements: OutfitRequirements,
    request: str,
    weather: str = None,
    attempt_num: int = 1,
    vibe: str = None,
    formality: int = None,
    time_of_day: str = None,
    previous_feedback: str = None
) -> OutfitSuggestion:
    """Generate a single outfit with validation and retry logic"""
    
    # Shuffle for this specific outfit
    random.shuffle(closet_summary)
    print(f"[Single Outfit] Attempt {attempt_num} for: {request}")
    
    # Build context information
    context_info = []
    if vibe:
        context_info.append(f"Desired Vibe: {vibe}")
    if weather:
        context_info.append(f"Weather: {weather}")
    if formality:
        formality_labels = {1: "Very Casual", 2: "Casual", 3: "Business Casual", 4: "Formal", 5: "Black Tie"}
        context_info.append(f"Formality Level: {formality_labels.get(formality, 'Business Casual')}")
    if time_of_day:
        context_info.append(f"Time of Day: {time_of_day}")
    
    context_section = "\n".join(context_info) if context_info else "No additional context provided"

    # Build prompt with any previous feedback and context
    prompt_parts = [
        f"SINGLE OUTFIT GENERATION REQUEST:\n",
        f"User Request: {request}\n",
        f"Occasion: {requirements.occasion_type or 'Not specified'}\n",
        f"Additional Context:\n{context_section}\n\n",
        f"CONTEXT GUIDANCE:\n",
        f"- VIBE: {vibe or 'Not specified'} - Match this aesthetic in your choices\n",
        f"- FORMALITY: {formality or 3}/5 - Select appropriately formal pieces\n", 
        f"- TIME: {time_of_day or 'Not specified'} - Consider appropriate colors/styles\n",
        f"- WEATHER: {weather or 'Not specified'} - Ensure comfort and practicality\n\n"
    ]
    
    if previous_feedback:
        prompt_parts.extend([
            f"IMPORTANT FEEDBACK FROM PREVIOUS ATTEMPT:\n",
            f"{previous_feedback}\n",
            f"Address these issues in your new selection.\n\n"
        ])
    
    prompt_parts.extend([
        f"OUTFIT REQUIREMENTS:\n",
        f"Essential Categories: {requirements.essential_categories}\n",
        f"Recommended Categories: {requirements.recommended_categories}\n",
        f"Avoid Categories: {requirements.avoid_categories}\n",
        f"Item Count Range: {requirements.min_items}-{requirements.max_items} items\n\n",
        f"FOOTWEAR SELECTION GUIDANCE:\n",
        f"- Sport-specific shoes (golf, tennis, climbing, etc.) ONLY for their sports\n",
        f"- Check shoe names for sport terms - if present, only use for that activity\n",
        f"- Athletic shoes OK for gym/running/casual, NOT for formal events\n",
        f"- Match footwear formality to overall outfit formality\n",
        f"- Default to versatile footwear (sneakers, loafers, boots) for general outfits\n\n",
        f"AVAILABLE CLOSET ITEMS:\n",
        f"{json.dumps(closet_summary, indent=2)[:15000]}\n\n",
        f"Generate ONE complete outfit that addresses any feedback provided.\n",
        f"CRITICAL: NO DUPLICATE CATEGORIES! Never select 2 pants, 2 shoes, 2 similar tops, etc.\n",
        f"CRITICAL: Use actual item NAMES in rationale (NOT IDs). Example: 'The Blue Denim Jeans pair with the White Cotton Tee' (NOT 'item_123 works with item_456').\n",
        f"CRITICAL: Check footwear context - no golf shoes for dinner, no climbing shoes for office!\n",
        f"Create contextual title based on '{request}'."
    ])
    
    prompt = "".join(prompt_parts)
    
    # Generate outfit
    result = await Runner.run(stylist_agent, prompt)
    if not result.final_output:
        raise HTTPException(status_code=500, detail=f"No output from stylist on attempt {attempt_num}")
    
    # Parse outfit
    try:
        # Extract JSON from markdown if needed
        json_match = re.search(r'```(?:json)?\s*(\{.*?\})\s*```', result.final_output, re.DOTALL)
        if json_match:
            json_str = json_match.group(1)
        else:
            json_str = result.final_output
            
        outfit_data = json.loads(json_str)
        outfit = OutfitSuggestion(**outfit_data)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to parse outfit: {e}")
    
    # Get item details for validation
    selected_items = get_item_details(outfit.itemIds, closet_summary)
    if not selected_items:
        raise HTTPException(status_code=500, detail="No valid items selected")

    # Check for duplicate categories before any other validation
    has_duplicates, duplicate_error = detect_duplicate_categories(selected_items)
    if has_duplicates:
        print(f"[Duplicate Detection] REJECTED outfit with duplicates: {duplicate_error}")
        # Force immediate retry with specific feedback
        if attempt_num < 3:  # Increase retry attempts for duplicate issues
            return await generate_single_outfit_with_validation(
                closet_summary,
                requirements,
                request,
                weather,
                attempt_num + 1,
                vibe=vibe,
                formality=formality,
                time_of_day=time_of_day,
                previous_feedback=f"CRITICAL ERROR: {duplicate_error}. You MUST fix this by selecting different items."
            )
        else:
            print(f"[Duplicate Detection] Max retries reached, removing duplicates programmatically")
            # Last resort: remove duplicates programmatically
            outfit.itemIds = remove_duplicate_items(outfit.itemIds, selected_items)
            selected_items = get_item_details(outfit.itemIds, closet_summary)
    
    # Build combined validation prompt (coverage + color)
    validation_prompt = (
        f"COMPREHENSIVE OUTFIT VALIDATION:\n"
        f"User Request: {request}\n"
        f"Occasion: {requirements.occasion_type}\n"
        f"Weather: {weather or 'Not specified'}\n\n"
        f"SELECTED OUTFIT TO ANALYZE:\n"
    )
    
    for item in selected_items:
        colors = item.get('colors', [])
        color_str = ', '.join(colors) if colors else 'No color data available'
        validation_prompt += f"- {item['name']} ({item['category']}): Colors = {color_str}\n"
    
    validation_prompt += (
        f"\nValidate this outfit for '{request}' checking BOTH:\n"
        f"1. COVERAGE: Is it complete, appropriate, no duplicates?\n"
        f"2. COLOR COORDINATION: Do the colors work well together for this occasion?\n"
        f"Provide specific feedback for any issues found."
    )
    
    # Run combined validation
    validation_result = await Runner.run(outfit_validator_agent, validation_prompt)
    if not validation_result.final_output:
        # If validator fails, assume it's complete
        print(f"[Validation] Validator failed, accepting outfit")
        return outfit
    
    # Parse combined validation result (coverage + color)
    try:
        json_match = re.search(r'```(?:json)?\s*(\{.*?\})\s*```', validation_result.final_output, re.DOTALL)
        if json_match:
            validation_json = json_match.group(1)
        else:
            validation_json = validation_result.final_output
            
        validation = json.loads(validation_json)
        is_valid = validation.get("is_valid", True)
        combined_feedback = validation.get("combined_feedback", "")
        
        print(f"[Combined Validation] Outfit validation result: {'PASSED' if is_valid else 'FAILED'}")
        if not is_valid:
            print(f"[Combined Validation] Issues: {combined_feedback}")
        
    except Exception as e:
        print(f"[Combined Validation] Failed to parse validation result: {e}")
        # If parsing fails, assume it's valid
        is_valid = True
        combined_feedback = ""
    
    # If validation failed and we have attempts left, retry with feedback
    if not is_valid and attempt_num < 2:
        print(f"[Single Outfit] Attempt {attempt_num} validation failed: {combined_feedback}")
        return await generate_single_outfit_with_validation(
            closet_summary,
            requirements, 
            request,
            weather,
            attempt_num + 1,
            vibe,
            formality,
            time_of_day,
            combined_feedback
        )
    
    # Return the outfit (valid or best attempt after 2 tries)
    if not is_valid:
        print(f"[Single Outfit] Returning outfit with issues after {attempt_num} attempts: {combined_feedback}")
    else:
        print(f"[Single Outfit] Valid outfit generated on attempt {attempt_num} (coverage + colors)")
        
    return outfit

def get_complementary_categories(item_category: str) -> List[str]:
    """
    Return categories that complement the given category for outfit building
    """
    complements = {
        'top': ['bottom', 'outerwear', 'shoes', 'accessory'],
        'bottom': ['top', 'outerwear', 'shoes', 'accessory', 'dress'],  # dress for layering
        'dress': ['outerwear', 'shoes', 'accessory'],
        'shoes': ['top', 'bottom', 'dress', 'outerwear'],
        'outerwear': ['top', 'bottom', 'dress', 'shoes'],
        'accessory': ['top', 'bottom', 'dress', 'outerwear', 'shoes']
    }
    return complements.get(item_category.lower(), [])


def detect_item_category_from_type(item_type: str) -> Optional[str]:
    """
    Detect clothing category from item type description
    """
    item_type_lower = item_type.lower()
    
    if any(word in item_type_lower for word in ['shirt', 'blouse', 'tee', 'top', 'sweater', 'tank', 'cardigan', 'hoodie']):
        # Cardigans can be tops or outerwear, check for outerwear keywords
        if 'cardigan' in item_type_lower or 'hoodie' in item_type_lower:
            return 'outerwear'
        return 'top'
    elif any(word in item_type_lower for word in ['pants', 'jeans', 'shorts', 'skirt', 'trousers', 'leggings']):
        return 'bottom'
    elif any(word in item_type_lower for word in ['dress', 'romper', 'jumpsuit']):
        return 'dress'
    elif any(word in item_type_lower for word in ['shoes', 'sneakers', 'boots', 'sandals', 'heels', 'loafers', 'flats']):
        return 'shoes'
    elif any(word in item_type_lower for word in ['jacket', 'coat', 'blazer', 'vest', 'outerwear']):
        return 'outerwear'
    elif any(word in item_type_lower for word in ['belt', 'bag', 'hat', 'scarf', 'necklace', 'earrings', 'bracelet', 'watch']):
        return 'accessory'
    
    return None


def validate_pairing_recommendations(
    recommendations: List[ShoppingRecommendation],
    closet_summary: List[dict]
) -> List[ShoppingRecommendation]:
    """
    Validate and fix pairing recommendations to ensure no same-category pairings
    """
    # Create item lookup by ID
    item_lookup = {item["id"]: item for item in closet_summary}
    
    for rec in recommendations:
        if not rec.pair_with_ids:
            continue
            
        # Determine category of recommended item
        rec_category = detect_item_category_from_type(rec.item_type)
        if not rec_category:
            continue  # Can't validate if we don't know the category
        
        # Get valid complementary categories
        valid_categories = get_complementary_categories(rec_category)
        
        # Filter out invalid pairings
        valid_pairs = []
        removed_count = 0
        
        for pair_id in rec.pair_with_ids:
            pair_item = item_lookup.get(pair_id)
            if not pair_item:
                continue
                
            pair_category = pair_item.get('category', '').lower()
            
            # Check if pairing is valid (not same category)
            if pair_category in valid_categories or rec_category == 'accessory':  # accessories can pair with anything
                valid_pairs.append(pair_id)
            else:
                removed_count += 1
                print(f"[Shopping] Removed invalid pairing: {rec.item_type} (new {rec_category}) with {pair_item['name']} (existing {pair_category})")
        
        # Update with valid pairs only
        rec.pair_with_ids = valid_pairs
        
        if removed_count > 0:
            print(f"[Shopping] Fixed {removed_count} invalid pairings for {rec.item_type}")
    
    return recommendations


async def generate_shopping_recommendations(
    closet_summary: List[dict],
    requirements: OutfitRequirements,
    request: str,
    generated_outfits: List[OutfitSuggestion],
    weather: str = None,
    vibe: str = None,
    formality: int = None,
    time_of_day: str = None
) -> List[ShoppingRecommendation]:
    """Generate shopping recommendations based on wardrobe gaps and request context"""
    
    print(f"[Shopping Intelligence] Analyzing recommendations for: {request}")
    
    # Build analysis prompt
    context_info = []
    if vibe:
        context_info.append(f"Desired Vibe: {vibe}")
    if weather:
        context_info.append(f"Weather: {weather}")
    if formality:
        formality_labels = {1: "Very Casual", 2: "Casual", 3: "Business Casual", 4: "Formal", 5: "Black Tie"}
        context_info.append(f"Formality Level: {formality_labels.get(formality, 'Business Casual')}")
    if time_of_day:
        context_info.append(f"Time of Day: {time_of_day}")
    
    context_section = "\n".join(context_info) if context_info else "No additional context provided"
    
    # Count outfits generated and analyze gaps
    outfit_count = len(generated_outfits)
    success_level = "full" if outfit_count >= 3 else "partial" if outfit_count >= 1 else "failed"
    
    # Analyze current wardrobe composition and style patterns
    categories_count = {}
    style_indicators = {'mens': [], 'womens': [], 'unisex': []}
    
    for item in closet_summary:
        cat = item.get('category', 'other')
        categories_count[cat] = categories_count.get(cat, 0) + 1
        
        # Analyze style patterns for gender/style detection
        name = (item.get('name') or '').lower()
        subcategory = (item.get('subcategory') or '').lower()
        description = (item.get('description') or '').lower()
        full_text = f"{name} {subcategory} {description}"
        
        # Men's style indicators
        if any(term in full_text for term in ['mens', "men's", 'dress shirt', 'tie', 'chinos', 'polo', 'suit', 'oxford', 'button down']):
            style_indicators['mens'].append(item.get('name', 'Unknown'))
        # Women's style indicators  
        elif any(term in full_text for term in ['womens', "women's", 'dress', 'skirt', 'blouse', 'heel', 'blazer', 'cardigan']):
            style_indicators['womens'].append(item.get('name', 'Unknown'))
        # Unisex indicators
        elif any(term in full_text for term in ['t-shirt', 'tshirt', 'hoodie', 'sweatshirt', 'sneaker', 'jean', 'sweater']):
            style_indicators['unisex'].append(item.get('name', 'Unknown'))
    
    # Determine dominant style profile
    mens_count = len(style_indicators['mens'])
    womens_count = len(style_indicators['womens'])
    unisex_count = len(style_indicators['unisex'])
    
    if mens_count > womens_count and mens_count > 0:
        dominant_style = "men's/masculine"
        style_examples = style_indicators['mens'][:3]
    elif womens_count > mens_count and womens_count > 0:
        dominant_style = "women's/feminine"
        style_examples = style_indicators['womens'][:3]
    else:
        dominant_style = "unisex/mixed"
        style_examples = style_indicators['unisex'][:3]
    
    prompt = (
        f"SHOPPING INTELLIGENCE ANALYSIS\n\n"
        f"User Request: '{request}'\n"
        f"Context: {context_section}\n"
        f"Generation Results: {success_level} success - {outfit_count} outfits created\n\n"
        f"CURRENT WARDROBE SUMMARY:\n"
        f"Total Items: {len(closet_summary)}\n"
        f"Categories: {dict(categories_count)}\n\n"
        f"WARDROBE STYLE PROFILE:\n"
        f"Dominant Style: {dominant_style}\n"
        f"Style Indicators Found: Men's items ({mens_count}), Women's items ({womens_count}), Unisex items ({unisex_count})\n"
        f"Example Items: {style_examples}\n"
        f"CRITICAL: All recommendations MUST match this style profile. Never suggest items from incompatible gender/style categories.\n\n"
        f"WARDROBE DETAILS:\n"
        f"{json.dumps(closet_summary[:20], indent=2)}\n\n"  # First 20 items for analysis
        f"OUTFIT REQUIREMENTS THAT WERE NEEDED:\n"
        f"Essential: {requirements.essential_categories}\n"
        f"Recommended: {requirements.recommended_categories}\n"
        f"Avoid: {requirements.avoid_categories}\n"
        f"Occasion: {requirements.occasion_type}\n\n"
        f"ANALYSIS GOALS:\n"
        f"1. Identify what prevented generating more outfits for this specific request\n"
        f"2. Suggest 2-4 strategic items that would unlock multiple new combinations\n"
        f"3. Focus on pieces that work with existing wardrobe items\n"
        f"4. Prioritize items most relevant to the user's request context\n"
        f"5. MAINTAIN STRICT STYLE CONSISTENCY with detected wardrobe profile\n\n"
        f"Consider these factors:\n"
        f"- What categories are missing or underrepresented?\n"
        f"- What would bridge style/formality gaps?\n"
        f"- What seasonal pieces are needed?\n"
        f"- What colors would complement existing items?\n"
        f"- WHAT STYLE/GENDER CATEGORY matches the existing wardrobe?\n\n"
        f"Provide 2-4 specific, actionable recommendations that would have the biggest impact for this user's request.\n"
        f"Each recommendation should include realistic search terms that work on Amazon, Google Shopping, or major retailers.\n"
        f"Include appropriate gender specification in search queries when relevant.\n"
        f"IMPORTANT: For each recommendation, include 'pair_with_ids' field with 2-3 specific item IDs from the wardrobe that would pair well.\n"
        f"Focus on main clothing pieces (tops, bottoms, dresses) for pairing, not accessories.\n\n"
        f"Return ONLY a JSON array of recommendations."
    )
    
    try:
        result = await Runner.run(shopping_intelligence_agent, prompt)
        
        if not result.final_output:
            print("[Shopping Intelligence] No output from agent")
            return []
        
        print("[Shopping Intelligence] Raw output:", repr(result.final_output))
        
        # Extract JSON from markdown code blocks if present
        raw_output = result.final_output
        json_match = re.search(r'```(?:json)?\s*(\[.*?\])\s*```', raw_output, re.DOTALL)
        if json_match:
            json_str = json_match.group(1)
        else:
            json_str = raw_output
        
        recommendations_data = json.loads(json_str)
        
        # Convert to ShoppingRecommendation objects
        recommendations = []
        for rec_data in recommendations_data:
            if isinstance(rec_data, dict):
                recommendations.append(ShoppingRecommendation(**rec_data))

        # Validate pairings to remove same-category suggestions
        recommendations = validate_pairing_recommendations(recommendations, closet_summary)
        
        print(f"[Shopping Intelligence] Generated {len(recommendations)} recommendations")
        return recommendations[:4]  # Limit to max 4 recommendations
        
    except Exception as e:
        print(f"[Shopping Intelligence] Error: {e}")
        return []

async def generate_single_outfit_async(
    closet_summary: List[dict],
    requirements: OutfitRequirements,
    request: str,
    weather: str,
    outfit_index: int,
    vibe: str = None,
    formality: int = None,
    time_of_day: str = None
) -> OutfitSuggestion:
    """Generate a single outfit asynchronously for parallel processing"""
    
    # Rotate closet to ensure variety without reshuffling
    rotation = len(closet_summary) // 3 * outfit_index if len(closet_summary) >= 3 else outfit_index
    rotated_closet = closet_summary[rotation:] + closet_summary[:rotation]
    
    print(f"[Async Outfit {outfit_index+1}] Starting generation with rotated closet")
    
    # Generate outfit with combined validation and retry logic
    return await generate_single_outfit_with_validation(
        rotated_closet,
        requirements,
        request,
        weather,
        attempt_num=1,
        vibe=vibe,
        formality=formality,
        time_of_day=time_of_day
    )

@app.post("/generate-outfit", response_model=GenerateOutfitResponse)
async def generate_outfit(req: GenerateOutfitRequest):
    print("[Agents] /generate-outfit start", {"closet": len(req.closet), "pieceCount": req.pieceCount})
    
    # Step 1: Analyze requirements based on user request and context
    requirements = await analyze_outfit_requirements(
        req.request, 
        vibe=req.vibe, 
        weather=req.weather, 
        formality=req.formality, 
        time_of_day=req.timeOfDay
    )
    print("[Agents] Requirements determined:", {
        "essential": requirements.essential_categories,
        "recommended": requirements.recommended_categories,
        "avoid": requirements.avoid_categories,
        "occasion": requirements.occasion_type
    })
    
    # Step 2: Filter closet items based on requirements and excludeCategories
    filtered = [c for c in req.closet if not (c.category in (req.excludeCategories or []))]
    
    # Additional filtering: Remove items in avoid_categories
    if requirements.avoid_categories:
        filtered = [c for c in filtered if c.category not in requirements.avoid_categories]
        print(f"[Agents] After avoiding {requirements.avoid_categories}: {len(filtered)} items")
    
    if len(filtered) < 2:
        print("[Agents] /generate-outfit insufficient items after filter")
        raise HTTPException(status_code=400, detail="Not enough suitable items for this occasion")

    import json
    closet_summary = [
        {
            "id": c.id,
            "name": c.name,
            "category": c.category,
            "subcategory": c.subcategory,
            "description": c.description,
            "colors": c.colors,
            "season": c.season,
            "formality": c.formality,
            "styleTags": c.styleTags,
            "occasions": c.occasions,
            "layeringRole": c.layeringRole,
            "bestPairedWith": c.bestPairedWith,
            "avoidCombinations": c.avoidCombinations,
            "stylingNotes": c.stylingNotes,
            "colorCoordinationNotes": c.colorCoordinationNotes,
            "weatherSuitability": c.weatherSuitability,
            "temperatureRange": c.temperatureRange,
            "stylingVersatility": c.stylingVersatility,
            "undertones": c.undertones,
            "colorIntensity": c.colorIntensity,
        }
        for c in filtered
    ]
    
    # Shuffle closet once for variety, then use rotation for each outfit
    random.shuffle(closet_summary)
    print(f"[Agents] Shuffled closet once, generating 3 outfits in parallel")
    
    # Generate 3 outfits IN PARALLEL
    outfit_tasks = []
    for i in range(3):
        task = generate_single_outfit_async(
            closet_summary,
            requirements,
            req.request,
            req.weather or None,
            outfit_index=i,
            vibe=req.vibe,
            formality=req.formality,
            time_of_day=req.timeOfDay
        )
        outfit_tasks.append(task)
    
    # Execute all outfit generation tasks in parallel
    try:
        outfits = await asyncio.gather(*outfit_tasks, return_exceptions=True)
        
        # Filter out any failed outfits (exceptions)
        valid_outfits = []
        for i, outfit in enumerate(outfits):
            if isinstance(outfit, OutfitSuggestion):
                valid_outfits.append(outfit)
                print(f"[Parallel] Outfit {i+1} completed: {outfit.title}")
            else:
                print(f"[Parallel] Outfit {i+1} failed: {outfit}")
        
        if not valid_outfits:
            raise HTTPException(status_code=500, detail="Failed to generate any valid outfits")
        
        print(f"[Agents] Successfully generated {len(valid_outfits)} outfits in parallel")
        
        # Step 4: Generate shopping recommendations based on outfit results
        try:
            shopping_recs = await generate_shopping_recommendations(
                closet_summary=closet_summary,
                requirements=requirements,
                request=req.request,
                generated_outfits=valid_outfits,
                weather=req.weather,
                vibe=req.vibe,
                formality=req.formality,
                time_of_day=req.timeOfDay
            )
            print(f"[Shopping] Generated {len(shopping_recs)} recommendations")
        except Exception as e:
            print(f"[Shopping] Failed to generate recommendations: {e}")
            shopping_recs = []
        
        return GenerateOutfitResponse(outfits=valid_outfits, shopping_recommendations=shopping_recs)
        
    except Exception as e:
        print(f"[Parallel] Generation error: {e}")
        raise HTTPException(status_code=500, detail=f"Parallel generation failed: {str(e)}")

@app.post("/analyze-wardrobe", response_model=WardrobeAnalysisResponse)
async def analyze_wardrobe(req: WardrobeAnalysisRequest):
    """Comprehensive wardrobe analysis providing style insights, gaps, and recommendations"""
    print(f"[WardrobeAnalyst] Starting analysis for {len(req.closet_items)} items")
    
    try:
        if len(req.closet_items) == 0:
            raise HTTPException(status_code=400, detail="No closet items provided for analysis")

        # Check cache first (cache based on item names + focus areas for speed)
        cache_data = {
            "items": [{"name": item.name, "category": item.category, "colors": item.colors} for item in req.closet_items],
            "focus_areas": req.focus_areas
        }
        cache_key = create_cache_key(cache_data)
        
        cached_result = get_cached_result(cache_key, wardrobe_analysis_cache)
        if cached_result:
            print(f"[WardrobeAnalyst] Cache hit! Returning cached analysis")
            return cached_result
        
        # Prepare wardrobe data for analysis
        wardrobe_summary = []
        for item in req.closet_items:
            # Standardize field names and ensure all fields are present
            item_data = {
                "name": item.name,
                "category": item.category or "unknown",
                "subcategory": item.subcategory or "general",
                "colors": item.colors if isinstance(item.colors, list) else [],
                "primary_color": item.colors[0] if item.colors and len(item.colors) > 0 else "unknown",
                "season": item.season if isinstance(item.season, list) else [],
                "formality": item.formality or "casual",
                "styleTags": item.styleTags if isinstance(item.styleTags, list) else [],  # Use consistent field name
                "style_tags": item.styleTags if isinstance(item.styleTags, list) else [],  # Keep both for compatibility
                "description": item.description or "",
                "occasions": item.occasions if isinstance(item.occasions, list) else [],
                "versatility": getattr(item, 'stylingVersatility', None) or getattr(item, 'versatility', 'moderate'),
                "layering_role": item.layeringRole or "standalone"
            }
            wardrobe_summary.append(item_data)
        
        # Calculate deterministic scores with error handling
        print(f"[WardrobeAnalyst] Calculating deterministic scores...")
        try:
            scores = calculate_all_scores(wardrobe_summary)
            print(f"[WardrobeAnalyst] Scores calculated: versatility={scores['versatility_score']}, "
                  f"cohesion={scores['cohesion_score']}, completeness={scores['completeness_score']}")
        except Exception as e:
            print(f"[WardrobeAnalyst] Error calculating scores: {e}")
            # Provide fallback scores if calculation fails
            scores = {
                'versatility_score': 0.5,
                'cohesion_score': 0.5,
                'completeness_score': 0.5,
                'versatility_details': {'explanation': 'Unable to calculate - using default'},
                'cohesion_details': {'explanation': 'Unable to calculate - using default', 'style_consistency': 0.5},
                'completeness_details': {'well_covered': [], 'missing_essentials': []},
                'seasonal_distribution': {
                    'spring_percentage': 0.25,
                    'summer_percentage': 0.25,
                    'fall_percentage': 0.25,
                    'winter_percentage': 0.25,
                    'versatility_metric': 0.0,
                    'primary_season': 'balanced',
                    'distribution_description': 'Unable to calculate distribution'
                }
            }
        
        # Create comprehensive analysis prompt
        focus_areas = req.focus_areas or ["style", "color", "gaps", "seasonal"]
        user_prefs = req.user_preferences or {}
        
        analysis_prompt = (
            f"COMPREHENSIVE WARDROBE ANALYSIS\n\n"
            f"Analyze this wardrobe of {len(req.closet_items)} items:\n\n"
            f"ITEMS INVENTORY:\n"
        )
        
        for i, item in enumerate(wardrobe_summary, 1):
            analysis_prompt += (
                f"{i}. {item['name']}\n"
                f"   Category: {item['category']} ({item['subcategory']})\n"
                f"   Colors: {', '.join(item['colors']) if item['colors'] else 'Unknown'}\n"
                f"   Season: {', '.join(item['season']) if item['season'] else 'All-season'}\n"
                f"   Formality: {item['formality']}\n"
                f"   Style: {', '.join(item['style_tags']) if item['style_tags'] else 'Basic'}\n"
                f"   Occasions: {', '.join(item['occasions']) if item['occasions'] else 'General'}\n\n"
            )
        
        analysis_prompt += (
            f"ANALYSIS REQUIREMENTS:\n"
            f"Focus Areas: {', '.join(focus_areas)}\n"
            f"User Preferences: {user_prefs}\n\n"
            
            f"WARDROBE METRICS (for context only - do NOT include these in your response):\n"
            f"- Wardrobe Style: {scores['completeness_details'].get('style_description', 'Unknown style')}\n"
            f"- Versatility: {round(scores['versatility_score']*100)}% - {scores['versatility_details']['explanation']}\n"
            f"- Cohesion: {round(scores['cohesion_score']*100)}% - {scores['cohesion_details']['explanation']}\n"
            f"- Completeness: {round(scores['completeness_score']*100)}% - {scores['completeness_details']['explanation']}\n"
            f"- Seasonal Distribution: Spring {round(scores['seasonal_distribution']['spring_percentage']*100)}%, "
            f"Summer {round(scores['seasonal_distribution']['summer_percentage']*100)}%, "
            f"Fall {round(scores['seasonal_distribution']['fall_percentage']*100)}%, "
            f"Winter {round(scores['seasonal_distribution']['winter_percentage']*100)}%\n"
            f"- {scores['seasonal_distribution']['distribution_description']}\n\n"
            
            f"PROVIDE COMPREHENSIVE ANALYSIS INCLUDING:\n\n"
            
            f"1. STYLE PROFILE ANALYSIS:\n"
            f"   - Identify the 3 most dominant style aesthetics\n"
            f"   - List secondary/emerging styles\n"
            f"   - Write 2-3 sentence aesthetic description\n\n"
            
            f"2. COLOR PALETTE ASSESSMENT:\n"
            f"   - Identify primary colors (most frequent)\n"
            f"   - List accent colors (secondary colors)\n"
            f"   - Identify neutral foundation colors\n"
            f"   - Rate palette harmony ('cohesive'/'varied'/'chaotic')\n"
            f"   - Suggest missing colors that would enhance the palette\n\n"
            
            f"3. CATEGORY COVERAGE ANALYSIS:\n"
            f"   - Well-covered categories: {scores['completeness_details'].get('well_covered', [])}\n"
            f"   - Gaps (relevant to {scores['completeness_details'].get('wardrobe_style', 'this')} style): {scores['completeness_details'].get('missing_essentials', [])}\n"
            f"   - Note oversupplied categories\n"
            f"   - Identify versatility gaps appropriate for this wardrobe style\n"
            f"   - DO NOT suggest dresses for masculine wardrobes\n"
            f"   - Focus on gaps that align with the detected style\n\n"
            
            f"4. KEY INSIGHTS (5-7 insights):\n"
            f"   - Each with title, description, category (observational patterns)\n"
            f"   - Categories: 'style', 'color', 'gaps', 'seasonal', 'formality'\n"
            f"   - Present as neutral observations, not problems to fix\n\n"
            
            f"5. ACTIONABLE RECOMMENDATIONS (5-8 items):\n"
            f"   - Specific item types to add\n"
            f"   - Clear reasoning for each recommendation\n"
            f"   - Priority: 'essential', 'recommended', 'nice-to-have'\n"
            f"   - Budget estimate: '$', '$$', '$$$'\n"
            f"   - Styling integration notes\n\n"
            
            f"6. SUMMARY:\n"
            f"   - 2-3 sentence wardrobe overview\n"
            f"   - Top 3 next steps\n\n"
            
            f"Return ONLY valid JSON with the qualitative analysis fields.\n"
            f"Do NOT include any numerical scores in your response.\n"
            f"Be specific, actionable, and supportive in all feedback."
        )
        
        print(f"[WardrobeAnalyst] Running comprehensive analysis...")
        
        # Run the analysis using the wardrobe analyst agent
        result = await Runner.run(wardrobe_analyst_agent, analysis_prompt)
        
        if not result.final_output:
            raise HTTPException(status_code=500, detail="No output from wardrobe analyst agent")
        
        analysis_content = result.final_output
        print(f"[WardrobeAnalyst] Raw response length: {len(analysis_content)}")
        
        # Parse the JSON response
        try:
            # First try to extract from markdown code blocks (like other endpoints)
            json_match = re.search(r'```(?:json)?\s*(\{.*?\})\s*```', analysis_content, re.DOTALL)
            if json_match:
                json_str = json_match.group(1)
            else:
                # Fallback to raw JSON extraction
                json_match = re.search(r'\{.*\}', analysis_content, re.DOTALL)
                if not json_match:
                    print(f"[WardrobeAnalyst] No JSON found in response")
                    raise HTTPException(status_code=500, detail="Analysis failed to return valid JSON")
                json_str = json_match.group()
            
            # Clean up common JSON issues before parsing
            # Remove trailing commas before closing braces/brackets
            json_str = re.sub(r',\s*([}\]])', r'\1', json_str)
            
            try:
                ai_insights = json.loads(json_str)
            except json.JSONDecodeError as e:
                # If still fails, log more details
                print(f"[WardrobeAnalyst] JSON parse error after cleanup: {e}")
                print(f"[WardrobeAnalyst] Cleaned JSON preview: {json_str[:500]}...")
                raise
            
            # Debug: Log the actual keys returned by the agent
            print(f"[WardrobeAnalyst] Agent returned keys: {list(ai_insights.keys())}")
            
            # Create general suggestions from gaps and improvements
            suggestions = []
            
            # Transform completeness gaps into general suggestions
            missing_essentials = scores['completeness_details'].get('missing_essentials', [])
            if missing_essentials:
                # Group gaps by type for better titles
                has_tops_gap = any("top" in gap.lower() for gap in missing_essentials)
                has_bottoms_gap = any("bottom" in gap.lower() for gap in missing_essentials)
                has_outerwear_gap = any("outerwear" in gap.lower() for gap in missing_essentials)
                has_shoes_gap = any("shoes" in gap.lower() or "shoe" in gap.lower() for gap in missing_essentials)
                
                if has_tops_gap or has_bottoms_gap:
                    suggestions.append(GeneralSuggestion(
                        title="Insufficient Core Basics",
                        description="Your foundation pieces like tops and bottoms are below typical quantities for a versatile wardrobe, which may lead to frequent outfit repetition.",
                        type="gap"
                    ))
                
                if has_outerwear_gap:
                    suggestions.append(GeneralSuggestion(
                        title="Limited Layering Options",
                        description="Your wardrobe lacks sufficient outerwear pieces for weather versatility and adding depth to outfit combinations.",
                        type="gap"
                    ))
                
                if has_shoes_gap:
                    suggestions.append(GeneralSuggestion(
                        title="Minimal Footwear Variety",
                        description="Your shoe collection covers limited use cases and may not adequately support all your activities and occasions.",
                        type="gap"
                    ))
            
            # Check for formal wear gaps
            category_gaps = ai_insights.get("category_breakdown", {}).get("gaps", [])
            if any("formal" in gap.lower() or "dress" in gap.lower() for gap in category_gaps):
                suggestions.append(GeneralSuggestion(
                    title="Limited Formal Wear Coverage",
                    description="Your wardrobe has minimal formal options, which may limit your readiness for professional events or special occasions.",
                    type="gap"
                ))
            
            # Add color/style improvements based on scores
            if scores['cohesion_details'].get('unique_colors', 0) < 5:
                suggestions.append(GeneralSuggestion(
                    title="Narrow Color Palette",
                    description="Your wardrobe relies heavily on a limited color range. Introducing additional colors could enhance outfit variety and personal expression.",
                    type="improvement"
                ))
            
            # Check seasonal balance
            seasonal_dist = scores['seasonal_distribution']
            max_season_pct = max(
                seasonal_dist['spring_percentage'],
                seasonal_dist['summer_percentage'],
                seasonal_dist['fall_percentage'],
                seasonal_dist['winter_percentage']
            )
            if max_season_pct > 0.4:  # If any season dominates with >40%
                suggestions.append(GeneralSuggestion(
                    title="Seasonal Coverage Imbalance",
                    description="Your wardrobe heavily favors certain seasons, potentially leaving you underprepared for year-round weather changes.",
                    type="improvement"
                ))
            
            # Filter out gaps insights from key_insights
            filtered_insights = [
                insight for insight in ai_insights.get("key_insights", [])
                if not (isinstance(insight, dict) and insight.get("category") == "gaps")
            ]
            
            # Build the complete response by combining AI insights with deterministic scores
            complete_response = {
                # AI-generated qualitative analysis
                "style_profile": ai_insights.get("style_profile", {}),
                "color_analysis": ai_insights.get("color_analysis", {}),
                "category_breakdown": {
                    **ai_insights.get("category_breakdown", {}),
                    "wardrobe_style": scores['completeness_details'].get('wardrobe_style', 'neutral'),
                    "relevant_categories": scores['completeness_details'].get('relevant_essentials', [])
                },
                
                # Deterministic seasonal distribution from our calculations
                "seasonal_distribution": scores['seasonal_distribution'],
                
                # Deterministic scores from our calculations
                "versatility_score": scores['versatility_score'],
                "cohesion_score": scores['cohesion_score'],
                "completeness_score": scores['completeness_score'],
                
                # AI-generated insights and recommendations
                "key_insights": filtered_insights,  # Filtered to remove gaps
                "general_suggestions": GeneralSuggestions(
                    suggestions=suggestions
                ) if suggestions else None,
                "recommendations": ai_insights.get("recommendations", []),
                "wardrobe_summary": ai_insights.get("wardrobe_summary", ""),
                "next_steps": ai_insights.get("next_steps", [])
            }
            
            # Validate and create response object
            wardrobe_analysis = WardrobeAnalysisResponse(**complete_response)
            
            print(f"[WardrobeAnalyst] Analysis complete - {len(wardrobe_analysis.key_insights)} insights, "
                  f"{len(wardrobe_analysis.recommendations)} recommendations, "
                  f"scores: V={wardrobe_analysis.versatility_score:.2f}, "
                  f"Co={wardrobe_analysis.cohesion_score:.2f}, "
                  f"Cm={wardrobe_analysis.completeness_score:.2f}")
            
            # Cache the result for future requests
            set_cached_result(cache_key, wardrobe_analysis, wardrobe_analysis_cache)
            print(f"[WardrobeAnalyst] Result cached for future requests")
            
            return wardrobe_analysis
            
        except json.JSONDecodeError as e:
            print(f"[WardrobeAnalyst] JSON parse error: {e}")
            print(f"[WardrobeAnalyst] Response content: {analysis_content[:500]}...")
            raise HTTPException(status_code=500, detail="Failed to parse analysis response")
        except Exception as e:
            print(f"[WardrobeAnalyst] Validation error: {e}")
            raise HTTPException(status_code=500, detail=f"Analysis validation failed: {str(e)}")
    
    except Exception as e:
        print(f"[WardrobeAnalyst] Unexpected error: {e}")
        raise HTTPException(status_code=500, detail=f"Wardrobe analysis failed: {str(e)}")

@app.post("/shopping-buddy/analyze", response_model=ShoppingBuddyResponse)
async def analyze_shopping_item(req: ShoppingBuddyRequest):
    print(f"[ShoppingBuddy] ====== REQUEST RECEIVED ======")
    print(f"[ShoppingBuddy] Analyzing potential purchase against {len(req.wardrobe_items)} wardrobe items")
    
    # Debug: Log structure of first few wardrobe items
    if req.wardrobe_items and len(req.wardrobe_items) > 0:
        print(f"[ShoppingBuddy] Sample wardrobe items (first 3):")
        for i, item in enumerate(req.wardrobe_items[:3]):
            print(f"  Item {i+1}: {item.name}")
            print(f"    - ID: {item.id}")
            print(f"    - Category: {item.category}")
            print(f"    - Subcategory: {item.subcategory}")  # ADD THIS
            print(f"    - Formality: {item.formality}")
            print(f"    - Colors: {item.colors}")
            print(f"    - Photo URL: {'Yes' if item.photo_url else 'No'}")
            print(f"    - Photo URLs: {len(item.photo_urls) if item.photo_urls else 0} photos")
    
    # Reset debug flag
    global debug_logged
    debug_logged = False
    
    try:
        # Step 1: Analyze the photographed item using Vision API
        try:
            item_analysis = await analyze_potential_purchase(req.photo_url, req.price)
            print(f"[ShoppingBuddy] Item analysis complete: {item_analysis.get('category', 'unknown')}")
        except Exception as e:
            print(f"[ShoppingBuddy] Failed to analyze photo: {e}")
            raise HTTPException(status_code=500, detail=f"Photo analysis failed: {str(e)}")
        
        # Step 2 & 3: Find similar items and pairable items IN PARALLEL (saves ~2-3 seconds)
        print(f"[ShoppingBuddy] Starting parallel processing of similar items and pairings...")
        
        # Prepare tasks for parallel execution
        similar_task = None
        pairable_task = None
        
        if req.photo_url:
            # AI-powered similarity detection
            similar_task = find_similar_items_with_ai(item_analysis, req.wardrobe_items, req.photo_url)
        
        # AI pairable items ranking (always run this)
        pairable_task = find_best_pairings_with_ai(item_analysis, req.wardrobe_items, req.photo_url)
        
        # Execute both tasks in parallel
        try:
            if similar_task:
                # Run both in parallel
                similar_items, pairable_by_category = await asyncio.gather(
                    similar_task, 
                    pairable_task, 
                    return_exceptions=True
                )
                
                # Handle results - check if either failed
                if isinstance(similar_items, Exception):
                    print(f"[ShoppingBuddy] Similar items detection failed: {similar_items}")
                    # Fallback to basic method
                    try:
                        similar_items = find_similar_items(item_analysis, req.wardrobe_items)
                        print(f"[ShoppingBuddy] Fallback found {len(similar_items)} similar items")
                    except Exception as fallback_e:
                        print(f"[ShoppingBuddy] Fallback also failed: {fallback_e}")
                        similar_items = []
                else:
                    print(f"[ShoppingBuddy] AI found {len(similar_items)} truly similar items")
                
                if isinstance(pairable_by_category, Exception):
                    print(f"[ShoppingBuddy] Pairable items detection failed: {pairable_by_category}")
                    pairable_by_category = PairableItemsByCategory()
                    pairable_items = []
                else:
                    # Process pairable_by_category successfully returned
                    pairable_items = []
                    total_ranked = 0
                    for category_items in [
                        pairable_by_category.headwear, pairable_by_category.eyewear,
                        pairable_by_category.tops, pairable_by_category.bottoms,
                        pairable_by_category.dresses, pairable_by_category.outerwear,
                        pairable_by_category.shoes, pairable_by_category.accessories
                    ]:
                        for ranked_item in category_items:
                            pairable_items.append(ranked_item.item)
                            total_ranked += 1
                    print(f"[ShoppingBuddy] AI agent found {total_ranked} ranked pairable items across categories")
            else:
                # No photo URL - only run pairable items task, use basic similar items
                pairable_by_category = await pairable_task
                if isinstance(pairable_by_category, Exception):
                    print(f"[ShoppingBuddy] Pairable items detection failed: {pairable_by_category}")
                    pairable_by_category = PairableItemsByCategory()
                    pairable_items = []
                else:
                    # Process pairable_by_category successfully returned  
                    pairable_items = []
                    total_ranked = 0
                    for category_items in [
                        pairable_by_category.headwear, pairable_by_category.eyewear,
                        pairable_by_category.tops, pairable_by_category.bottoms,
                        pairable_by_category.dresses, pairable_by_category.outerwear,
                        pairable_by_category.shoes, pairable_by_category.accessories
                    ]:
                        for ranked_item in category_items:
                            pairable_items.append(ranked_item.item)
                            total_ranked += 1
                    print(f"[ShoppingBuddy] AI agent found {total_ranked} ranked pairable items across categories")
                
                # Basic similarity detection fallback
                similar_items = find_similar_items(item_analysis, req.wardrobe_items)
                print(f"[ShoppingBuddy] Basic analysis found {len(similar_items)} similar items")
            
            potential_outfits = []  # We're not generating full outfits anymore
            print(f"[ShoppingBuddy] Parallel processing complete")
            
        except Exception as e:
            print(f"[ShoppingBuddy] Error in parallel processing: {e}")
            import traceback
            traceback.print_exc()
            # Fallback to empty results
            similar_items = []
            pairable_items = []
            pairable_by_category = PairableItemsByCategory()
            potential_outfits = []
        
        # Step 4: Calculate compatibility scores (using AI-determined similar items and pairable items)
        try:
            compatibility = calculate_compatibility(item_analysis, req.wardrobe_items, similar_items)
            print(f"[ShoppingBuddy] Compatibility calculated: {compatibility['score']} (versatility: {compatibility['versatilityScore']})")
        except Exception as e:
            print(f"[ShoppingBuddy] Error calculating compatibility: {e}")
            import traceback
            traceback.print_exc()
            # Provide default compatibility
            compatibility = {
                "score": 50,
                "versatilityScore": 50,
                "uniquenessScore": 50,
                "styleCoherence": 50
            }
        
        # Step 5: Determine recommendation
        try:
            recommendation, reasoning = determine_purchase_recommendation(
                item_analysis,
                compatibility,
                similar_items,
                potential_outfits,
                req.wardrobe_items
            )
            print(f"[ShoppingBuddy] Recommendation: {recommendation}")
        except Exception as e:
            print(f"[ShoppingBuddy] Error determining recommendation: {e}")
            recommendation = "consider"
            reasoning = {"pros": [], "cons": ["Unable to fully analyze"]}
        
        # Step 6: Identify wardrobe gaps filled
        try:
            gaps_filled = identify_gaps_filled(item_analysis, req.wardrobe_items)
            print(f"[ShoppingBuddy] Gaps filled: {gaps_filled}")
        except Exception as e:
            print(f"[ShoppingBuddy] Error identifying gaps: {e}")
            gaps_filled = []
        
        response = ShoppingBuddyResponse(
            item=item_analysis,
            compatibility=compatibility,
            potentialOutfits=potential_outfits,  # Empty for now, keeping for compatibility
            similarOwned=[item_to_dict(item) for item in similar_items],
            recommendation=recommendation,
            reasoning=reasoning,
            outfitCount=len(pairable_items),  # Count of pairable items instead
            gapsFilled=gaps_filled,
            pairableItems=pairable_items,  # Already converted to dicts in the AI agent
            pairableItemsByCategory=pairable_by_category  # New AI-ranked structure
        )
        
        print(f"[ShoppingBuddy] Analysis complete - Score: {compatibility['score']}, "
              f"Recommendation: {recommendation}, Outfits: {len(potential_outfits)}")
        
        return response
        
    except Exception as e:
        print(f"[ShoppingBuddy] Unexpected error: {e}")
        import traceback
        print(f"[ShoppingBuddy] Traceback:")
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))

async def analyze_potential_purchase(photo_url: str, price: Optional[float] = None) -> dict:
    """Analyze a photographed item using the same 3-stage pipeline as regular items"""
    
    if not photo_url:
        raise ValueError("Photo URL is required")
    
    print(f"[ShoppingBuddy] Starting combined analysis for potential purchase (saves ~1-2 seconds)")
    
    # Combined Stage: Category, Color, and Attribute Analysis in ONE call
    print("[ShoppingBuddy] Combined analysis: Category + Color + Attributes...")
    
    # Single prompt that gets everything we need
    combined_prompt = f"""
    COMPREHENSIVE CLOTHING ITEM ANALYSIS:
    
    Please analyze this clothing item and provide a complete breakdown including:
    
    1. CATEGORY CLASSIFICATION:
       - Primary category (top, bottom, dress, outerwear, shoes, accessory)
       - Subcategory if applicable (e.g., t-shirt, jeans, sneakers, hat)
    
    2. COLOR ANALYSIS:
       - List ALL colors visible on the item in order of prominence
       - Primary/dominant color
       - Secondary colors
       - Pattern type (solid, striped, floral, plaid, etc.)
       - Color intensity (muted, medium, vibrant, neon)
    
    3. DETAILED ATTRIBUTES:
       - Detailed description (2-3 sentences)
       - Formality level (MUST be one of: casual, smart-casual, business-casual, business, formal, athleisure, loungewear)
       - Style descriptors (trendy, classic, minimalist, etc.)
       - Best seasons for wearing
       - Estimated price range: {f'${price}' if price else 'provide estimate based on quality/brand'}
       - Material/fabric if visible
    
    Return as JSON with these exact keys:
    {{
        "category": "primary_category",
        "subcategory": "subcategory_or_null", 
        "colors": ["color1", "color2", "color3"],
        "primaryColor": "dominant_color",
        "pattern": "pattern_type",
        "colorIntensity": "intensity_level",
        "description": "detailed_description",
        "formality": "formality_level",
        "style": "style_descriptor", 
        "season": ["season1", "season2"],
        "estimatedPrice": "price_estimate",
        "material": "material_type"
    }}
    
    CRITICAL: Formality MUST be one of the exact values listed above. 
    For flip-flops, sandals, or very casual items, use "casual".
    For athletic/gym wear, use "athleisure".
    For pajamas/robes, use "loungewear".
    """
    
    messages = [
        {
            "role": "system",
            "content": "You are a fashion expert analyzing clothing for wardrobe compatibility. Provide accurate, detailed analysis in the exact JSON format requested."
        },
        {
            "role": "user",
            "content": [
                {"type": "text", "text": combined_prompt},
                {"type": "image_url", "image_url": {"url": photo_url}}
            ]
        }
    ]
    
    try:
        response = await openai_client.chat.completions.create(
            model="gpt-4o",
            messages=messages,
            max_tokens=500,
            response_format={"type": "json_object"}
        )
        
        if not response.choices or not response.choices[0].message.content:
            raise ValueError("Empty response from OpenAI")
        
        result = json.loads(response.choices[0].message.content)
        
        # Use the combined analysis results directly
        final_result = {
            "category": result.get('category', 'unknown'),
            "subcategory": result.get('subcategory'),
            "description": result.get('description', ''),
            "colors": result.get('colors', []),
            "primaryColor": result.get('primaryColor', ''),
            "pattern": result.get('pattern', 'solid'),
            "colorIntensity": result.get('colorIntensity', 'medium'),
            "formality": normalize_formality(result.get('formality', 'casual')),
            "style": result.get('style', ''),
            "season": result.get('season', []),
            "estimatedPrice": result.get('estimatedPrice', 'Unknown'),
            "material": result.get('material', '')
        }
        
        print(f"[ShoppingBuddy] Combined analysis complete: category={final_result['category']}, "
              f"subcategory={final_result['subcategory']}, formality={final_result['formality']}, "
              f"colors={final_result['colors']}")
        return final_result
        
    except Exception as e:
        print(f"[ShoppingBuddy] Error in combined analysis: {e}")
        import traceback
        traceback.print_exc()
        # Fallback with basic analysis
        return {
            "category": "unknown",
            "subcategory": None,
            "description": "Unable to analyze item",
            "colors": [],
            "primaryColor": "",
            "pattern": "solid",
            "colorIntensity": "medium",
            "formality": "casual",  # Safe default
            "style": "classic",
            "season": ["all-season"],
            "estimatedPrice": str(price) if price else "Unknown",
            "material": ""
        }

def normalize_formality(formality: str) -> str:
    """Normalize formality to valid values"""
    if not formality:
        return "casual"
    
    formality_lower = formality.lower()
    
    # Map common variations to valid formalities
    formality_map = {
        'informal': 'casual',
        'relaxed': 'casual',
        'everyday': 'casual',
        'weekend': 'casual',
        'dressy': 'smart-casual',
        'semi-formal': 'smart-casual',
        'business casual': 'business-casual',
        'office': 'business-casual',
        'professional': 'business',
        'suit': 'business',
        'black tie': 'formal',
        'cocktail': 'formal',
        'evening': 'formal',
        'athletic': 'athleisure',
        'gym': 'athleisure',
        'sporty': 'athleisure',
        'sleepwear': 'loungewear',
        'pajamas': 'loungewear'
    }
    
    # Check if it's already a valid formality
    valid_formalities = ['casual', 'smart-casual', 'business-casual', 'business', 'formal', 'athleisure', 'loungewear']
    if formality_lower in valid_formalities:
        return formality_lower
    
    # Try to map it
    return formality_map.get(formality_lower, 'casual')  # Default to casual if unknown

async def analyze_similarity_with_ai(
    new_item: dict,
    candidates: List[ClosetItem],
    new_item_photo_url: str
) -> List[ClosetItem]:
    """
    Use AI to determine which candidate items are truly similar and interchangeable
    Follows the exact pattern from rank_items_with_ai
    """
    if not candidates:
        return []
    
    print(f"[SimilarityAgent] Analyzing {len(candidates)} candidate items with AI")
    
    # Collect photo URLs for all candidates (already signed from Next.js)
    item_photo_urls = {}
    print(f"[SimilarityAgent] PHOTO URL ANALYSIS:")
    print(f"[SimilarityAgent]   New item photo URL: {new_item_photo_url[:100] if new_item_photo_url else 'NONE'}{'...' if new_item_photo_url and len(new_item_photo_url) > 100 else ''}")
    
    for item in candidates:
        # Get the primary photo URL (already signed)
        photo_url = None
        if item.photo_url:
            photo_url = item.photo_url
            print(f"[SimilarityAgent]   ✓ {item.name} has photo_url: {photo_url[:80]}...")
        elif item.photo_urls and len(item.photo_urls) > 0:
            photo_url = item.photo_urls[0]
            print(f"[SimilarityAgent]   ✓ {item.name} has photo_urls[0]: {photo_url[:80]}...")
        else:
            print(f"[SimilarityAgent]   ✗ {item.name} has NO photos")
        
        if photo_url:
            item_photo_urls[item.id] = photo_url
    
    print(f"[SimilarityAgent] PHOTO SUMMARY: {len(item_photo_urls)} of {len(candidates)} candidates have photos")
    
    # Format candidate items with full metadata (like pairing agent)
    def format_candidates(items: List[ClosetItem]) -> str:
        formatted = ""
        for i, item in enumerate(items, 1):
            formatted += f"  {i}. ID: {item.id}\n"
            formatted += f"     Name: {item.name}\n"
            if item.description:
                formatted += f"     Description: {item.description}\n"
            formatted += f"     Colors: {', '.join(item.colors or ['unknown'])}\n"
            formatted += f"     Formality: {item.formality or 'casual'}\n"
            if item.styleTags:
                formatted += f"     Style Tags: {', '.join(item.styleTags)}\n"
            if item.season:
                formatted += f"     Season: {', '.join(item.season)}\n"
            if item.stylingNotes:
                formatted += f"     Styling Notes: {item.stylingNotes}\n"
            if item.id in item_photo_urls:
                formatted += f"     Photo: {item_photo_urls[item.id]}\n"
            formatted += "\n"
        return formatted
    
    candidates_text = format_candidates(candidates)
    
    prompt = f"""You are an expert fashion analyst with access to visual analysis. Looking at the FIRST IMAGE (the item being considered for purchase), determine which of the wardrobe items are truly SIMILAR and INTERCHANGEABLE.

NEW ITEM (shown in first image):
- Description: {new_item.get('description', 'Unknown item')}
- Category: {new_item.get('category', 'unknown')}
- Formality: {new_item.get('formality', 'unknown')}  
- Colors: {', '.join(new_item.get('colors', []))}
- Style: {new_item.get('style', 'classic')}

WARDROBE CANDIDATES (same type and formality):
{candidates_text}

ANALYSIS CRITERIA:
1. **VISUAL SIMILARITY**: Do the items look similar in style, cut, design, and overall aesthetic?
2. **FUNCTIONAL INTERCHANGEABILITY**: Could these items serve the same purpose and be used in the same contexts?
3. **STYLE COHERENCE**: Do they have the same visual impact and styling versatility?
4. **TRUE REPLACEABILITY**: Would owning both items be redundant, or do they serve different purposes?

CRITICAL REQUIREMENTS:
- Only include items that are genuinely similar and would make the new item redundant
- Focus on visual analysis of the photos over text descriptions
- Consider if items truly serve the same purpose and styling function
- Be selective - items must be very similar, not just in the same category

Return JSON in this exact format:
{{
  "similar_items": [
    {{
      "item_id": "exact_id_from_above",
      "similarity_reason": "Specific reason why this item is similar and interchangeable"
    }}
  ]
}}

Only include items that are genuinely similar based on visual analysis. If no items are truly similar, return an empty array."""

    print(f"[SimilarityAgent] DEBUG PROMPT:")
    print(f"[SimilarityAgent] ==================== START PROMPT ====================")
    print(f"{prompt}")
    print(f"[SimilarityAgent] ==================== END PROMPT ====================")

    try:
        print("[SimilarityAgent] Calling GPT-4o for similarity analysis...")
        
        # Prepare message content with text and images (exactly like pairing agent)
        message_content = [
            {
                "type": "text",
                "text": prompt
            }
        ]
        
        # Add the new item's photo FIRST (most important)
        image_count = 0
        max_images = 10
        
        if new_item_photo_url:
            message_content.append({
                "type": "image_url",
                "image_url": {"url": new_item_photo_url}
            })
            image_count += 1
            print(f"[SimilarityAgent] Added new item photo as first image")
        
        # Add candidate photos (up to max limit)
        for item in candidates:
            if image_count >= max_images:
                print(f"[SimilarityAgent]   ✗ Skipping {item.name} - reached max images ({max_images})")
                break
            
            if item.id in item_photo_urls:
                message_content.append({
                    "type": "image_url",
                    "image_url": {"url": item_photo_urls[item.id]}
                })
                image_count += 1
                print(f"[SimilarityAgent]   ✓ Added image #{image_count}: {item.name} ({item_photo_urls[item.id][:80]}...)")
            else:
                print(f"[SimilarityAgent]   ✗ Skipping {item.name} - no photo URL")
        
        print(f"[SimilarityAgent] IMAGE SUMMARY: Including {image_count} total images in AI analysis (1 new item + {image_count-1} candidates)")

        response = await openai_client.chat.completions.create(
            model="gpt-4o",
            messages=[{
                "role": "system",
                "content": "You are an expert fashion analyst specializing in item similarity and replaceability. Focus on visual analysis to determine true interchangeability."
            }, {
                "role": "user",
                "content": message_content
            }],
            temperature=0.3,
            max_tokens=1000
        )

        # Parse AI response
        response_text = response.choices[0].message.content.strip()
        print(f"[SimilarityAgent] AI response received: {len(response_text)} characters")
        print(f"[SimilarityAgent] FULL AI RESPONSE:")
        print(f"[SimilarityAgent] {response_text}")
        print(f"[SimilarityAgent] END AI RESPONSE")
        
        try:
            import json
            import re
            
            # Extract JSON from markdown code blocks if present (like color analysis)
            json_match = re.search(r'```(?:json)?\s*(\{.*?\})\s*```', response_text, re.DOTALL)
            if json_match:
                json_str = json_match.group(1)
                print(f"[SimilarityAgent] Extracted JSON from markdown blocks")
            else:
                json_str = response_text
                print(f"[SimilarityAgent] Using raw response as JSON")
            
            ai_result = json.loads(json_str)
            print(f"[SimilarityAgent] PARSED AI RESULT: {ai_result}")
            
            similar_item_ids = [item['item_id'] for item in ai_result.get('similar_items', [])]
            print(f"[SimilarityAgent] SIMILAR ITEM IDs: {similar_item_ids}")
            
            # Return the actual ClosetItem objects for the similar items
            similar_items = [item for item in candidates if item.id in similar_item_ids]
            print(f"[SimilarityAgent] MATCHED ITEMS:")
            for item in similar_items:
                print(f"[SimilarityAgent]   ✓ {item.name} (id: {item.id})")
            
            print(f"[SimilarityAgent] Found {len(similar_items)} truly similar items")
            return similar_items
            
        except json.JSONDecodeError as e:
            print(f"[SimilarityAgent] Failed to parse AI response as JSON: {e}")
            print(f"[SimilarityAgent] Raw response that failed: '{response_text}'")
            return []
            
    except Exception as e:
        print(f"[SimilarityAgent] Error in AI similarity analysis: {e}")
        return []

async def find_similar_items_with_ai(
    new_item: dict,
    wardrobe: List[ClosetItem],
    new_item_photo_url: str
) -> List[ClosetItem]:
    """
    Two-stage similar item detection:
    Stage 1: Filter by strict criteria (same type + formality)
    Stage 2: AI visual analysis for true interchangeability
    """
    print(f"[SimilarityAgent] ====== STARTING AI SIMILARITY ANALYSIS ======")
    print(f"[SimilarityAgent] Analyzing {new_item.get('category', 'unknown')} against {len(wardrobe)} wardrobe items")
    
    # Stage 1: Get candidates with strict filtering (same category AND same formality)
    candidates = []
    new_category = new_item.get('category', '').lower()
    new_formality = new_item.get('formality', '').lower()
    
    print(f"[SimilarityAgent] NEW ITEM CRITERIA:")
    print(f"[SimilarityAgent]   Category: '{new_category}' (original: '{new_item.get('category', '')}')")
    print(f"[SimilarityAgent]   Formality: '{new_formality}' (original: '{new_item.get('formality', '')}')")
    print(f"[SimilarityAgent] FILTERING {len(wardrobe)} WARDROBE ITEMS:")
    
    filtered_count = 0
    for item in wardrobe:
        item_category = (item.category or '').lower()
        item_formality = (item.formality or '').lower()
        
        # Must be exact same category AND formality
        if item_category == new_category and item_formality == new_formality:
            candidates.append(item)
            print(f"[SimilarityAgent]   ✓ MATCH: {item.name} (cat:'{item_category}', form:'{item_formality}', id:{item.id})")
        else:
            # Show why it didn't match
            if item_category != new_category:
                print(f"[SimilarityAgent]   ✗ Category mismatch: {item.name} - '{item_category}' != '{new_category}'")
            elif item_formality != new_formality:
                print(f"[SimilarityAgent]   ✗ Formality mismatch: {item.name} - '{item_formality}' != '{new_formality}'")
        
        filtered_count += 1
        if filtered_count >= 10:  # Limit verbose logging to first 10 items
            remaining = len(wardrobe) - filtered_count
            if remaining > 0:
                print(f"[SimilarityAgent]   ... and {remaining} more items checked")
            break
    
    print(f"[SimilarityAgent] FILTERING COMPLETE: Found {len(candidates)} candidates with same type and formality")
    
    if not candidates:
        print("[SimilarityAgent] No candidates found - returning empty result")
        return []
    
    # Stage 2: Use AI to determine which candidates are truly similar
    if new_item_photo_url:
        similar_items = await analyze_similarity_with_ai(new_item, candidates, new_item_photo_url)
        print(f"[SimilarityAgent] ====== AI SIMILARITY ANALYSIS COMPLETE ======")
        return similar_items
    else:
        print("[SimilarityAgent] No photo available for new item - falling back to basic filtering")
        return candidates[:3]  # Return first 3 candidates if no AI analysis possible

def find_similar_items(new_item: dict, wardrobe: List[ClosetItem]) -> List[ClosetItem]:
    """Legacy function - now uses stricter filtering (same type + formality only)"""
    similar = []
    new_category = new_item.get('category', '').lower()
    new_formality = new_item.get('formality', '').lower()
    
    for item in wardrobe:
        item_category = (item.category or '').lower()
        item_formality = (item.formality or '').lower()
        
        # Must be exact same category AND formality
        if item_category == new_category and item_formality == new_formality:
            similar.append(item)
    
    return similar[:5]  # Return top 5 candidates

def calculate_compatibility(new_item: dict, wardrobe: List[ClosetItem], similar_items: List[ClosetItem] = None) -> dict:
    """Calculate how well this item fits with the existing wardrobe"""
    
    versatility_score = 0
    uniqueness_score = 0
    style_coherence = 0
    
    # Calculate versatility - how many items it can pair with (original simple method)
    pairable_items = 0
    for item in wardrobe:
        if can_pair_together(new_item, item):
            pairable_items += 1
    
    versatility_score = min(100, (pairable_items / max(len(wardrobe), 1)) * 170)
    
    print(f"[Versatility] Simple calculation: {pairable_items} pairable items out of {len(wardrobe)} total = {versatility_score:.1f}% versatility")
    
    # Calculate uniqueness - use provided similar items or fallback to basic calculation
    if similar_items is not None:
        # Use AI-determined similar items for more accurate uniqueness
        similar_count = len(similar_items)
        print(f"[Compatibility] Using AI-determined similar items count: {similar_count}")
    else:
        # Fallback to basic similarity calculation
        similar_count = len(find_similar_items(new_item, wardrobe))
        print(f"[Compatibility] Using basic similar items count: {similar_count}")
    
    uniqueness_score = max(0, 100 - (similar_count * 20))
    
    # Calculate style coherence
    style_match_count = sum(1 for item in wardrobe 
                           if item.formality == new_item.get('formality'))
    style_coherence = min(100, (style_match_count / max(len(wardrobe), 1)) * 150)
    
    # Overall score is weighted average
    overall_score = int(
        versatility_score * 0.4 +
        uniqueness_score * 0.3 +
        style_coherence * 0.3
    )
    
    return {
        "score": overall_score,
        "versatilityScore": int(versatility_score),
        "uniquenessScore": int(uniqueness_score),
        "styleCoherence": int(style_coherence)
    }

def check_color_compatibility(colors1: list, colors2: list) -> tuple[bool, str]:
    """
    Check if two sets of colors are compatible
    Returns (is_compatible, reason)
    """
    if not colors1 or not colors2:
        return True, "No colors to check"
    
    # Normalize colors to lowercase
    colors1 = [c.lower() for c in colors1 if c]
    colors2 = [c.lower() for c in colors2 if c]
    
    # Define neutral colors that go with everything
    neutrals = {'black', 'white', 'gray', 'grey', 'beige', 'tan', 'cream', 'navy', 'brown', 'khaki'}
    
    # Define color clashes to avoid
    color_clashes = [
        {'red', 'pink'},
        {'orange', 'red'},
        {'purple', 'pink'},
        {'orange', 'pink'},
        {'green', 'magenta'},
        {'yellow', 'pink'}
    ]
    
    # Define complementary color pairs
    complementary = [
        {'blue', 'orange'},
        {'red', 'green'},
        {'yellow', 'purple'},
        {'teal', 'coral'}
    ]
    
    # Check if all colors are neutrals (always compatible)
    if all(c in neutrals for c in colors1) or all(c in neutrals for c in colors2):
        return True, "Neutral colors pair with everything"
    
    # Check for color clashes
    for color1 in colors1:
        for color2 in colors2:
            for clash_set in color_clashes:
                if color1 in clash_set and color2 in clash_set and color1 != color2:
                    return False, f"Color clash: {color1} and {color2} don't pair well"
    
    # Check for good color combinations
    has_neutral1 = any(c in neutrals for c in colors1)
    has_neutral2 = any(c in neutrals for c in colors2)
    
    # If one item is mostly neutral, it pairs well
    if has_neutral1 or has_neutral2:
        return True, "Contains neutral colors"
    
    # Check for complementary colors
    for color1 in colors1:
        for color2 in colors2:
            for comp_set in complementary:
                if color1 in comp_set and color2 in comp_set and color1 != color2:
                    return True, f"Complementary colors: {color1} and {color2}"
    
    # Check for monochromatic (same color family)
    if any(c in colors2 for c in colors1):
        return True, "Monochromatic color scheme"
    
    # Default: if no specific rules apply, consider compatible with caution
    return True, "No specific color rules apply"

def can_pair_together(item1: dict, item2: Union[dict, ClosetItem]) -> bool:
    """
    Check if two items can be paired together based on:
    - Category compatibility
    - Formality matching
    - Color harmony
    """
    # Handle both dict and ClosetItem types for item2
    if isinstance(item2, ClosetItem):
        cat2 = item2.category
        formality2 = item2.formality
        colors2 = item2.colors or []
        name2 = item2.name
    else:
        cat2 = item2.get('category')
        formality2 = item2.get('formality')
        colors2 = item2.get('colors', [])
        name2 = item2.get('name', 'Unknown')
    
    cat1 = item1.get('category')
    colors1 = item1.get('colors', [])
    name1 = item1.get('description', 'New item')
    
    # Debug logging
    global debug_logged
    debug_count = globals().get('debug_count', 0)
    if debug_count < 5:  # Log first 5 pairing attempts in detail
        print(f"\n[Pairing Check #{debug_count + 1}]")
        print(f"  Item1: {name1}")
        print(f"    Category: {cat1}, Formality: {item1.get('formality')}, Colors: {colors1}")
        print(f"  Item2: {name2}")
        print(f"    Category: {cat2}, Formality: {formality2}, Colors: {colors2}")
        globals()['debug_count'] = debug_count + 1
    
    # RULE 1: Handle None/unknown categories
    if not cat1 or not cat2 or cat1 == 'unknown' or cat2 == 'unknown':
        if debug_count <= 5:
            print(f"  ❌ Rejected: Unknown category (cat1={cat1}, cat2={cat2})")
        return False
    
    # RULE 2: Can't pair same categories (except accessories)
    if cat1 == cat2 and cat1 != 'accessory':
        if debug_count <= 5:
            print(f"  ❌ Rejected: Same category ({cat1})")
        return False
    
    # RULE 3: Check if categories complement each other
    valid_pairs = {
        'top': ['bottom', 'dress', 'outerwear', 'shoes', 'accessory'],
        'bottom': ['top', 'outerwear', 'shoes', 'accessory'],
        'dress': ['outerwear', 'shoes', 'accessory'],
        'outerwear': ['top', 'bottom', 'dress', 'shoes', 'accessory'],
        'shoes': ['top', 'bottom', 'dress', 'outerwear', 'accessory'],
        'accessory': ['top', 'bottom', 'dress', 'outerwear', 'shoes', 'accessory']
    }
    
    if cat1 not in valid_pairs:
        if debug_count <= 5:
            print(f"  ❌ Rejected: Invalid category {cat1}")
        return False
    
    if cat2 not in valid_pairs.get(cat1, []):
        if debug_count <= 5:
            print(f"  ❌ Rejected: Categories don't complement ({cat1} + {cat2})")
        return False
    
    # RULE 4: Check color compatibility
    color_compatible, color_reason = check_color_compatibility(colors1, colors2)
    if not color_compatible:
        if debug_count <= 5:
            print(f"  ❌ Rejected: {color_reason}")
        return False
    
    # RULE 5: Check formality matching
    formality1 = item1.get('formality', '').lower() if item1.get('formality') else 'casual'
    formality2 = formality2.lower() if formality2 else 'casual'
    
    # Group formalities into compatible sets (including common variations)
    casual_group = ['casual', 'very casual', 'athleisure', 'relaxed', 'sporty', 'informal', 'loungewear']
    smart_casual_group = ['smart-casual', 'smart casual', 'business casual', 'business-casual', 'semi-formal']
    formal_group = ['formal', 'business', 'professional', 'black tie', 'cocktail', 'business-formal']
    
    # Determine formality groups
    form1_group = None
    form2_group = None
    if formality1 in casual_group:
        form1_group = 'casual'
    elif formality1 in smart_casual_group:
        form1_group = 'smart-casual'
    elif formality1 in formal_group:
        form1_group = 'formal'
    
    if formality2 in casual_group:
        form2_group = 'casual'
    elif formality2 in smart_casual_group:
        form2_group = 'smart-casual'
    elif formality2 in formal_group:
        form2_group = 'formal'
    
    # Check formality compatibility
    formality_compatible = False
    formality_reason = ""
    
    if form1_group == form2_group:
        formality_compatible = True
        formality_reason = f"Same formality group ({form1_group})"
    elif (form1_group == 'casual' and form2_group == 'smart-casual') or \
         (form1_group == 'smart-casual' and form2_group == 'casual'):
        formality_compatible = True
        formality_reason = "Adjacent formality levels (casual/smart-casual)"
    elif (form1_group == 'smart-casual' and form2_group == 'formal') or \
         (form1_group == 'formal' and form2_group == 'smart-casual'):
        formality_compatible = True
        formality_reason = "Adjacent formality levels (smart-casual/formal)"
    elif not formality1 or not formality2:
        formality_compatible = True
        formality_reason = "Formality unclear, allowing pairing"
    else:
        formality_reason = f"Formality mismatch ({formality1} vs {formality2})"
    
    if not formality_compatible:
        if debug_count <= 5:
            print(f"  ❌ Rejected: {formality_reason}")
        return False
    
    # All checks passed!
    if debug_count <= 5:
        print(f"  ✅ PAIRED! Categories: {cat1}+{cat2}, {formality_reason}, {color_reason}")
    
    return True

def find_pairable_items(new_item: dict, wardrobe: List[ClosetItem]) -> List[ClosetItem]:
    """Find all items in wardrobe that can be paired with the new item"""
    pairable = []
    rejected_by_category = 0
    rejected_by_color = 0
    rejected_by_formality = 0
    
    print(f"\n[PairableFinder] ====== STARTING PAIRING ANALYSIS ======")
    print(f"[PairableFinder] New item: {new_item.get('description', 'Unknown')}")
    print(f"[PairableFinder]   Category: {new_item.get('category', 'unknown')}")
    print(f"[PairableFinder]   Formality: {new_item.get('formality', 'unknown')}")
    print(f"[PairableFinder]   Colors: {new_item.get('colors', [])}")
    print(f"[PairableFinder] Wardrobe size: {len(wardrobe)} items")
    
    # Reset debug counter for detailed logging
    globals()['debug_count'] = 0
    
    # Debug first few items in wardrobe
    print(f"\n[PairableFinder] Sample wardrobe items:")
    for i, item in enumerate(wardrobe[:3]):
        print(f"  Item {i+1}: {item.name}")
        print(f"    Category: {item.category}, Formality: {item.formality}, Colors: {item.colors}")
    
    # Check each wardrobe item
    for idx, item in enumerate(wardrobe):
        paired = can_pair_together(new_item, item)
        if paired:
            pairable.append(item)
            if len(pairable) <= 5:  # Log first few matches
                print(f"\n  ✅ Match #{len(pairable)}: {item.name}")
                print(f"     Category: {item.category}, Formality: {item.formality}")
        elif globals().get('debug_count', 0) <= 5:
            # Track rejection reasons for summary
            if item.category == new_item.get('category') and item.category != 'accessory':
                rejected_by_category += 1
    
    # Summary
    print(f"\n[PairableFinder] ====== PAIRING RESULTS ======")
    print(f"[PairableFinder] Found {len(pairable)} pairable items out of {len(wardrobe)} total")
    print(f"[PairableFinder] Pairing rate: {(len(pairable)/len(wardrobe)*100):.1f}%" if wardrobe else "N/A")
    
    # Show category distribution of pairable items
    if pairable:
        category_counts = {}
        for item in pairable:
            cat = item.category or 'unknown'
            category_counts[cat] = category_counts.get(cat, 0) + 1
        print(f"[PairableFinder] Pairable items by category:")
        for cat, count in sorted(category_counts.items()):
            print(f"  - {cat}: {count} items")
    
    return pairable

def group_pairable_by_category(pairable_items: List[ClosetItem]) -> Dict[str, List[ClosetItem]]:
    """
    Group pairable items by category, handling accessory subcategories properly
    Same logic as visual-outfit-builder.tsx but in Python
    """
    grouped = {
        'headwear': [],
        'eyewear': [],
        'tops': [],
        'bottoms': [],
        'dresses': [],
        'outerwear': [],
        'shoes': [],
        'accessories': []
    }
    
    for item in pairable_items:
        category = (item.category or '').lower()
        subcategory = (item.subcategory or '').lower()
        name = (item.name or '').lower()
        
        # For accessories, use subcategory to determine specific position
        if category == 'accessory':
            # Check subcategory first for proper positioning
            if subcategory in ['hat', 'cap', 'beanie', 'headband', 'headwear']:
                grouped['headwear'].append(item)
            elif subcategory in ['sunglasses', 'glasses', 'eyewear']:
                grouped['eyewear'].append(item)
            else:
                # Other accessories (belts, scarves, ties, bags, watches, etc.)
                grouped['accessories'].append(item)
        # Handle non-accessory categories normally
        elif category == 'top':
            grouped['tops'].append(item)
        elif category == 'bottom':
            grouped['bottoms'].append(item)
        elif category == 'dress':
            grouped['dresses'].append(item)
        elif category == 'outerwear':
            grouped['outerwear'].append(item)
        elif category == 'shoes':
            grouped['shoes'].append(item)
        # Fallback: check name for items that might be miscategorized
        elif not category or category == 'other':
            if any(term in name for term in ['hat', 'cap', 'beanie']):
                grouped['headwear'].append(item)
            elif any(term in name for term in ['sunglasses', 'glasses']):
                grouped['eyewear'].append(item)
    
    # Remove empty categories for cleaner processing
    return {k: v for k, v in grouped.items() if v}

async def rank_items_with_ai(
    analyzed_item: dict,
    grouped_items: Dict[str, List[ClosetItem]],
    top_n: int = 3,
    analyzed_item_photo_url: Optional[str] = None
) -> PairableItemsByCategory:
    """
    Single API call to rank pre-filtered valid pairings
    Only processes categories that have items to rank
    """
    if not grouped_items:
        print("[PairingAgent] No items to rank")
        return PairableItemsByCategory()
    
    print(f"[PairingAgent] Ranking items in {len(grouped_items)} categories")
    for category, items in grouped_items.items():
        print(f"  - {category}: {len(items)} items")
    
    # Collect photo URLs for text prompt metadata (URLs are already signed from Next.js)
    item_signed_urls = {}
    for category, items in grouped_items.items():
        for item in items:
            # Get the primary photo URL (already signed)
            photo_url = None
            if item.photo_url:
                photo_url = item.photo_url
            elif item.photo_urls and len(item.photo_urls) > 0:
                photo_url = item.photo_urls[0]
            
            if photo_url:
                item_signed_urls[item.id] = photo_url

    # Format wardrobe items for the AI prompt with full metadata and signed URLs
    def format_category_items(category: str, items: List[ClosetItem]) -> str:
        formatted = f"\n{category.upper()}:\n"
        for i, item in enumerate(items, 1):
            formatted += f"  {i}. ID: {item.id}\n"
            formatted += f"     Name: {item.name}\n"
            if item.description:
                formatted += f"     Description: {item.description}\n"
            formatted += f"     Colors: {', '.join(item.colors or ['unknown'])}\n"
            formatted += f"     Formality: {item.formality or 'casual'}\n"
            if item.styleTags:
                formatted += f"     Style Tags: {', '.join(item.styleTags)}\n"
            if item.season:
                formatted += f"     Season: {', '.join(item.season)}\n"
            if item.stylingNotes:
                formatted += f"     Styling Notes: {item.stylingNotes}\n"
            if item.colorCoordinationNotes:
                formatted += f"     Color Notes: {item.colorCoordinationNotes}\n"
            if item.id in item_signed_urls:
                formatted += f"     Photo: {item_signed_urls[item.id]}\n"
            formatted += "\n"
        return formatted
    
    # Build the complete prompt
    categories_text = ""
    for category, items in grouped_items.items():
        categories_text += format_category_items(category, items)
    
    analyzed_item_visual_ref = ""
    if analyzed_item_photo_url:
        analyzed_item_visual_ref = " Looking at the FIRST IMAGE (the item being considered for purchase),"
    
    prompt = f"""You are an expert fashion stylist with access to visual analysis.{analyzed_item_visual_ref} I have a {analyzed_item.get('category', 'item')} with these characteristics:

ANALYZED ITEM (shown in first image):
- Description: {analyzed_item.get('description', 'Unknown item')}
- Colors: {', '.join(analyzed_item.get('colors', []))}
- Formality: {analyzed_item.get('formality', 'unknown')}
- Style: {analyzed_item.get('style', 'classic')}

From these PRE-VALIDATED pairable items (they already pass basic compatibility), select the TOP {top_n} items for each category. You have access to both photos and metadata for each item, but PRIORITIZE VISUAL ASSESSMENT over text descriptions.

SELECTION CRITERIA (in order of importance):
1. **VISUAL COHESION**: Analyze the actual photos - how do colors, textures, and silhouettes work together visually? This is your primary consideration.
2. **IMAGE-BASED COLOR HARMONY**: Look at the actual colors in the photos, not just the color tags. Assess real-world color coordination.
3. **VISUAL TEXTURE & PATTERN BALANCE**: Examine fabric textures, patterns, and finishes in the images to create compelling visual contrasts or harmonies.
4. **PHOTOGRAPHIC STYLE CONSISTENCY**: Consider how the items would look together in real life based on their visual appearance.
5. **METADATA VALIDATION**: Use text descriptions only to confirm what you see in the images, not as the primary decision factor.

{categories_text}

CRITICAL REQUIREMENTS:
- You MUST select exactly {top_n} items from each category (or all if fewer than {top_n})
- Use the exact item IDs provided above
- PRIORITIZE visual analysis of the photos over text metadata - your decisions should be based primarily on what you see in the images
- Focus on how the items will actually look together in real life based on their visual appearance
- Provide styling insights that reference specific visual elements you observed in the photos

Return JSON in this exact format:
{{
  "category_name": [
    {{
      "item_id": "exact_id_from_above",
      "rank": 1,
      "styling_note": "Specific reason why this creates a great look"
    }}
  ]
}}

Categories to analyze: {', '.join(grouped_items.keys())}"""

    try:
        print("[PairingAgent] Calling GPT-4o for item ranking...")
        
        # Prepare message content with text and images
        message_content = [
            {
                "type": "text",
                "text": prompt
            }
        ]
        
        # Add the analyzed item's photo FIRST (most important)
        image_count = 0
        max_images = 6  # Reduced from 10 to prevent timeout issues
        
        if analyzed_item_photo_url:
            message_content.append({
                "type": "image_url",
                "image_url": {"url": analyzed_item_photo_url}
            })
            image_count += 1
            print(f"[PairingAgent] Added analyzed item photo as first image")
        
        for category, items in grouped_items.items():
            if image_count >= max_images:
                break
            for item in items:
                if image_count >= max_images:
                    break
                
                # Get photo URL (already signed from Next.js) 
                photo_url = None
                if item.photo_url:
                    photo_url = item.photo_url
                elif item.photo_urls and len(item.photo_urls) > 0:
                    photo_url = item.photo_urls[0]
                
                if photo_url:
                    try:
                        message_content.append({
                            "type": "image_url",
                            "image_url": {"url": photo_url}
                        })
                        image_count += 1
                        print(f"[PairingAgent] Added image {image_count} for item {item.id[:8]}")
                    except Exception as e:
                        print(f"[PairingAgent] Failed to add image for item {item.id}: {e}")
                        continue

        print(f"[PairingAgent] Including {image_count} images in AI analysis")

        try:
            response = await openai_client.chat.completions.create(
                model="gpt-4o",
                messages=[{
                    "role": "system",
                    "content": "You are an expert fashion stylist with deep knowledge of color theory, style harmony, and outfit coordination. Always provide practical, stylish advice."
                }, {
                    "role": "user",
                    "content": message_content
                }],
                max_tokens=1500,
                temperature=0.3,  # Lower for consistency in rankings
                response_format={"type": "json_object"},
                timeout=30  # 30 second timeout
            )
        except Exception as api_error:
            print(f"[PairingAgent] OpenAI API error: {api_error}")
            if "timeout" in str(api_error).lower():
                print(f"[PairingAgent] API timeout with {image_count} images - falling back to simple ranking")
            raise api_error
        
        if not response.choices or not response.choices[0].message.content:
            raise ValueError("Empty response from OpenAI")
        
        ai_rankings = json.loads(response.choices[0].message.content)
        print(f"[PairingAgent] AI response received: {len(ai_rankings)} categories processed")
        
        # Convert AI response to our data structure
        result = PairableItemsByCategory()
        
        # Create lookup map for items by ID
        items_by_id = {}
        for category, items in grouped_items.items():
            for item in items:
                items_by_id[item.id] = item
        
        # Process each category from AI response
        for category, ranked_items in ai_rankings.items():
            if category not in grouped_items:
                continue
                
            category_results = []
            for ranked_item in ranked_items:
                item_id = ranked_item.get('item_id')
                if item_id in items_by_id:
                    category_results.append(RankedPairableItem(
                        item=item_to_dict(items_by_id[item_id]),
                        rank=ranked_item.get('rank', 1),
                        styling_note=ranked_item.get('styling_note', 'Great styling choice')
                    ))
            
            # Set the results on the appropriate category
            if category == 'headwear':
                result.headwear = category_results
            elif category == 'eyewear':
                result.eyewear = category_results
            elif category == 'tops':
                result.tops = category_results
            elif category == 'bottoms':
                result.bottoms = category_results
            elif category == 'dresses':
                result.dresses = category_results
            elif category == 'outerwear':
                result.outerwear = category_results
            elif category == 'shoes':
                result.shoes = category_results
            elif category == 'accessories':
                result.accessories = category_results
        
        print(f"[PairingAgent] Successfully ranked items across {len([c for c in [result.headwear, result.eyewear, result.tops, result.bottoms, result.dresses, result.outerwear, result.shoes, result.accessories] if c])} categories")
        return result
        
    except Exception as e:
        error_type = type(e).__name__
        print(f"[PairingAgent] Error in AI ranking ({error_type}): {e}")
        
        if "timeout" in str(e).lower() or error_type == "TimeoutError":
            print(f"[PairingAgent] Timeout error with {image_count} images - consider using fewer images")
        elif "400" in str(e) and "image" in str(e).lower():
            print(f"[PairingAgent] Image processing error - some images may be invalid or inaccessible")
        elif "429" in str(e):
            print(f"[PairingAgent] Rate limit error - API calls too frequent")
        
        print(f"[PairingAgent] Falling back to simple ranking")
        
        # Fallback: simple ranking by keeping first N items
        result = PairableItemsByCategory()
        for category, items in grouped_items.items():
            ranked_items = []
            for i, item in enumerate(items[:top_n], 1):
                ranked_items.append(RankedPairableItem(
                    item=item_to_dict(item),
                    rank=i,
                    styling_note=""
                ))
            
            # Set results based on category name
            if category == 'headwear':
                result.headwear = ranked_items
            elif category == 'eyewear':
                result.eyewear = ranked_items
            elif category == 'tops':
                result.tops = ranked_items
            elif category == 'bottoms':
                result.bottoms = ranked_items
            elif category == 'dresses':
                result.dresses = ranked_items
            elif category == 'outerwear':
                result.outerwear = ranked_items
            elif category == 'shoes':
                result.shoes = ranked_items
            elif category == 'accessories':
                result.accessories = ranked_items
        
        return result

def simple_rank_items(items: List[ClosetItem], analyzed_item: dict, max_items: int = 3) -> List[RankedPairableItem]:
    """Simple ranking - just take first N items and convert to ranked structure"""
    ranked_items = []
    for i, item in enumerate(items[:max_items], 1):
        ranked_items.append(RankedPairableItem(
            item=item_to_dict(item),
            rank=i,
            styling_note=""
        ))
    return ranked_items

async def find_best_pairings_with_ai(
    analyzed_item: dict,
    wardrobe_items: List[ClosetItem],
    analyzed_item_photo_url: Optional[str] = None
) -> PairableItemsByCategory:
    """
    Step 1: Use existing find_pairable_items() to get valid pairings
    Step 2: Use AI to rank and select top 3 per category (only if >3 items)
    Step 3: Always return exactly 3 items per category (or all if fewer)
    """
    print("[PairingAgent] ====== STARTING AI PAIRING ANALYSIS ======")
    print(f"[PairingAgent] Analyzing {analyzed_item.get('category', 'unknown')} against {len(wardrobe_items)} wardrobe items")
    
    # Step 1: Get all valid pairings using existing compatibility rules
    pairable_items = find_pairable_items(analyzed_item, wardrobe_items)
    
    print(f"[PairingAgent] Found {len(pairable_items)} valid pairable items")
    if not pairable_items:
        print("[PairingAgent] No valid pairings found - returning empty result")
        return PairableItemsByCategory()
    
    # Step 2: Group pairable items by category (including subcategory logic for accessories)
    grouped = group_pairable_by_category(pairable_items)
    
    print(f"[PairingAgent] Grouped into {len(grouped)} categories:")
    for category, items in grouped.items():
        print(f"  - {category}: {len(items)} items")
    
    if not grouped:
        print("[PairingAgent] No items after grouping - returning empty result")
        return PairableItemsByCategory()
    
    # Step 3: Process each category - use AI only if >3 items
    result = PairableItemsByCategory()
    
    for category, items in grouped.items():
        print(f"[PairingAgent] Processing {category}: {len(items)} items")
        
        if len(items) <= 3:
            # No AI needed - just use all items
            print(f"[PairingAgent] {category}: Using all {len(items)} items (≤3)")
            ranked_items = simple_rank_items(items, analyzed_item, max_items=3)
        else:
            # Use AI to select best 3 from larger set
            print(f"[PairingAgent] {category}: Using AI to select 3 from {len(items)} items")
            try:
                # Create a single-category dict for AI ranking
                single_category = {category: items}
                ai_result = await rank_items_with_ai(analyzed_item, single_category, top_n=3, analyzed_item_photo_url=analyzed_item_photo_url)
                
                # Extract the ranked items from AI result
                if category == 'headwear':
                    ranked_items = ai_result.headwear
                elif category == 'eyewear':
                    ranked_items = ai_result.eyewear
                elif category == 'tops':
                    ranked_items = ai_result.tops
                elif category == 'bottoms':
                    ranked_items = ai_result.bottoms
                elif category == 'dresses':
                    ranked_items = ai_result.dresses
                elif category == 'outerwear':
                    ranked_items = ai_result.outerwear
                elif category == 'shoes':
                    ranked_items = ai_result.shoes
                elif category == 'accessories':
                    ranked_items = ai_result.accessories
                else:
                    ranked_items = []
                
                # Fallback if AI didn't return items
                if not ranked_items:
                    print(f"[PairingAgent] {category}: AI returned empty, using fallback")
                    ranked_items = simple_rank_items(items[:3], analyzed_item, max_items=3)
                
            except Exception as e:
                print(f"[PairingAgent] {category}: AI failed ({e}), using fallback")
                ranked_items = simple_rank_items(items[:3], analyzed_item, max_items=3)
        
        # Set results on the main result object
        if category == 'headwear':
            result.headwear = ranked_items
        elif category == 'eyewear':
            result.eyewear = ranked_items
        elif category == 'tops':
            result.tops = ranked_items
        elif category == 'bottoms':
            result.bottoms = ranked_items
        elif category == 'dresses':
            result.dresses = ranked_items
        elif category == 'outerwear':
            result.outerwear = ranked_items
        elif category == 'shoes':
            result.shoes = ranked_items
        elif category == 'accessories':
            result.accessories = ranked_items
        
        print(f"[PairingAgent] {category}: Set {len(ranked_items)} items on result")
    
    print("[PairingAgent] ====== AI PAIRING ANALYSIS COMPLETE ======")
    return result

def generate_outfit_combinations(
    new_item: dict, 
    wardrobe: List[ClosetItem],
    limit: int = 8
) -> List[dict]:
    """Generate potential outfit combinations with the new item"""
    
    outfits = []
    used_combinations = set()
    pairable_count = 0
    
    print(f"[OutfitGen] Starting with new item: {new_item.get('category', 'unknown')} - {new_item.get('formality', 'unknown')}")
    print(f"[OutfitGen] Checking {len(wardrobe)} wardrobe items")
    
    for item in wardrobe:
        if can_pair_together(new_item, item):
            pairable_count += 1
            # Try to build a complete outfit
            outfit_items = [new_item, item]
            # Safely get categories
            new_item_category = new_item.get('category', 'unknown')
            item_category = getattr(item, 'category', None) or 'unknown'
            outfit_categories = {new_item_category, item_category}
            
            # Add complementary pieces
            for other in wardrobe:
                other_category = getattr(other, 'category', None) or 'unknown'
                if (other.id != item.id and 
                    other_category not in outfit_categories and
                    can_pair_together(new_item, other) and
                    can_pair_together(item_to_dict(item), other)):
                    
                    outfit_items.append(other)
                    outfit_categories.add(other_category)
                    
                    if len(outfit_items) >= 3:  # Minimum viable outfit
                        break
            
            # Create outfit hash to avoid duplicates
            outfit_hash = tuple(sorted([
                i.get('id', i.get('description', '')) if isinstance(i, dict) 
                else i.id 
                for i in outfit_items
            ]))
            
            if outfit_hash not in used_combinations and len(outfit_items) >= 2:
                used_combinations.add(outfit_hash)
                
                # Determine occasion and season
                occasion = determine_occasion(outfit_items)
                season = determine_season(outfit_items)
                
                outfits.append({
                    "id": f"outfit_{len(outfits) + 1}",
                    "items": [item_to_dict(i) if isinstance(i, ClosetItem) else i 
                             for i in outfit_items],
                    "occasion": occasion,
                    "season": season
                })
                
                if len(outfits) >= limit:
                    break
    
    print(f"[OutfitGen] Found {pairable_count} pairable items, generated {len(outfits)} outfits")
    return outfits

def determine_occasion(items: List) -> str:
    """Determine the best occasion for an outfit"""
    formality_scores = {'casual': 0, 'smart-casual': 1, 'business': 2, 'formal': 3}
    
    avg_formality = sum(
        formality_scores.get(
            item.formality if hasattr(item, 'formality') else item.get('formality', 'casual'), 
            0
        ) 
        for item in items
    ) / len(items)
    
    if avg_formality >= 2.5:
        return "formal event"
    elif avg_formality >= 1.5:
        return "work"
    elif avg_formality >= 0.5:
        return "casual outing"
    else:
        return "weekend casual"

def determine_season(items: List) -> str:
    """Determine the best season for an outfit"""
    seasons = []
    for item in items:
        if hasattr(item, 'season'):
            seasons.extend(item.season or [])
        elif isinstance(item, dict):
            seasons.extend(item.get('season', []))
    
    if not seasons:
        return "all seasons"
    
    # Find most common season
    from collections import Counter
    season_counts = Counter(seasons)
    return season_counts.most_common(1)[0][0] if season_counts else "all seasons"

def determine_purchase_recommendation(
    new_item: dict,
    compatibility: dict,
    similar_items: List,
    potential_outfits: List,
    wardrobe: List
) -> tuple[str, dict]:
    """Determine whether to buy, skip, or consider the item"""
    
    pros = []
    cons = []
    
    # Analyze pros
    if compatibility['score'] >= 80:
        pros.append(f"Excellent wardrobe compatibility ({compatibility['score']}/100)")
    elif compatibility['score'] >= 60:
        pros.append(f"Good wardrobe compatibility ({compatibility['score']}/100)")
    
    if len(potential_outfits) >= 5:
        pros.append(f"Creates {len(potential_outfits)} new outfit combinations")
    
    if compatibility['uniquenessScore'] >= 70:
        pros.append("Fills a gap in your wardrobe")
    
    if compatibility['versatilityScore'] >= 70:
        pros.append(f"Highly versatile - pairs with {compatibility['versatilityScore']}% of wardrobe")
    
    # Analyze cons
    if len(similar_items) >= 3:
        cons.append(f"You already own {len(similar_items)} very similar items")
    elif len(similar_items) >= 1:
        cons.append(f"Similar to {len(similar_items)} items you already own")
    
    if compatibility['score'] < 50:
        cons.append("Poor compatibility with your current wardrobe")
    
    if len(potential_outfits) < 3:
        cons.append("Limited outfit potential")
    
    if compatibility['styleCoherence'] < 50:
        cons.append("Doesn't match your usual style")
    
    # Make recommendation
    if compatibility['score'] >= 70 and len(similar_items) < 2 and len(potential_outfits) >= 5:
        recommendation = "buy"
    elif compatibility['score'] < 50 or len(similar_items) >= 3:
        recommendation = "skip"
    else:
        recommendation = "consider"
    
    return recommendation, {
        "pros": pros,
        "cons": cons
    }

def identify_gaps_filled(new_item: dict, wardrobe: List[ClosetItem]) -> List[str]:
    """Identify which wardrobe gaps this item would fill"""
    gaps = []
    
    # Check category gaps
    categories = {item.category for item in wardrobe}
    if new_item['category'] not in categories:
        gaps.append(f"First {new_item['category']} in wardrobe")
    
    # Check formality gaps
    formalities = {item.formality for item in wardrobe if item.formality}
    if new_item.get('formality') and new_item['formality'] not in formalities:
        gaps.append(f"Adds {new_item['formality']} option")
    
    # Check seasonal gaps
    if new_item.get('season'):
        for season in new_item['season']:
            season_items = [i for i in wardrobe if i.season and season in i.season]
            if len(season_items) < 3:
                gaps.append(f"Strengthens {season} wardrobe")
                break
    
    # Check color diversity
    if new_item.get('colors'):
        primary_color = new_item['colors'][0]
        color_items = [i for i in wardrobe if i.colors and primary_color in i.colors]
        if len(color_items) == 0:
            gaps.append(f"Adds {primary_color} to color palette")
    
    return gaps[:3]  # Return top 3 gaps

def item_to_dict(item: ClosetItem) -> dict:
    """Convert ClosetItem to dictionary for response"""
    return {
        "id": item.id,
        "name": item.name,
        "category": item.category,
        "subcategory": item.subcategory,  # ADD THIS - critical for positioning accessories
        "colors": item.colors,
        "formality": item.formality,
        "season": item.season,
        "photoUrl": item.photo_url,  # Using camelCase for frontend compatibility
        "photoUrls": item.photo_urls
    }
