import os
import random
import asyncio
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel
from typing import List, Optional, Dict, Any
from agents import Agent, Runner
from dotenv import load_dotenv
import json
import re
from openai import AsyncOpenAI

# Load environment variables from .env file
load_dotenv()

# Environment
OPENAI_API_KEY = os.environ.get("OPENAI_API_KEY")
if not OPENAI_API_KEY:
    raise RuntimeError("OPENAI_API_KEY is required in environment")

# Initialize OpenAI client for direct API calls
openai_client = AsyncOpenAI(api_key=OPENAI_API_KEY)

app = FastAPI(title="Outfit Generator Agents Service")

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

class GenerateOutfitResponse(BaseModel):
    outfits: List[OutfitSuggestion]

class ClassifyCategoryRequest(BaseModel):
    photo_urls: List[str]
    item_name: Optional[str] = None  # Optional context for ambiguous cases

class CategoryResult(BaseModel):
    category: str               # Must be from valid Supabase categories
    subcategory: Optional[str] = None
    confidence: float          # 0.0 to 1.0
    reasoning: str             # Why this category was chosen
    used_name_context: bool    # Whether item name influenced the decision

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
        "CRITICAL RULE - NO DUPLICATE CATEGORIES:\n"
        "- NEVER select multiple bottoms (2 pants, 2 skirts, etc.) - this is impossible to wear\n"
        "- NEVER select multiple shoes - people wear one pair at a time\n"
        "- NEVER select duplicate tops unless one is clearly for layering (shirt + cardigan OK, 2 t-shirts NOT OK)\n"
        "- Each category should appear ONCE unless layering makes sense\n"
        "- Example BAD: Blue Jeans + Black Pants, Nike Sneakers + Dress Shoes\n"
        "- Example OK: White Button-Down + Gray Cardigan (proper layering)\n\n"
        "CRITICAL RULE - ITEM NAMES IN DESCRIPTIONS:\n"
        "- In your rationale, you MUST use the actual NAME of each item\n"
        "- NEVER use item IDs in descriptions (users don't understand random strings)\n"
        "- Example GOOD: 'The White Cotton Tee pairs perfectly with the Blue Jeans because...'\n"
        "- Example BAD: 'Item abc123 goes well with item def456...'\n"
        "- Example BAD: 'The selected top works with the chosen bottom...'\n"
        "- Be specific: use the full item name as provided in the closet data\n\n"
        "Other Rules:\n"
        "1. Ensure proper coverage for the occasion\n"
        "2. Include footwear unless explicitly for sleep/lounging\n"
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

outfit_validator_agent = Agent(
    name="Outfit Validator",
    instructions=(
        "You validate outfits for BOTH coverage AND color coordination in one comprehensive analysis.\n\n"
        
        "COVERAGE CHECKS:\n"
        "- NO DUPLICATE CATEGORIES: Never multiple bottoms (2 pants, 2 skirts), multiple shoes, or duplicate tops unless proper layering\n"
        "- APPROPRIATE BODY COVERAGE: Ensure proper coverage for the occasion (top+bottom OR dress)\n"
        "- REQUIRED FOOTWEAR: Include shoes based on context (not needed for sleep/lounging)\n"
        "- WEATHER APPROPRIATENESS: Items suitable for stated weather conditions\n"
        "- PRACTICAL COMPLETENESS: Person can actually go out dressed like this\n\n"
        
        "COLOR COORDINATION CHECKS:\n"
        "- HARMONY RULES: Use complementary, analogous, monochromatic, or neutral+accent combinations\n"
        "- AVOID CLASHES: No red+green unless intentional, no more than 3-4 main colors\n"
        "- OCCASION FORMALITY: Professional = neutrals + max 1 accent, casual = more flexibility\n"
        "- SPECIFIC GUIDELINES: Denim works with everything, earth tones harmonize, neutrals are versatile\n\n"
        
        "CONTEXT AWARENESS:\n"
        "- Beach/pool: Swimwear + sandals is complete\n"
        "- Office: Professional coverage + shoes + conservative colors\n"
        "- Gym: Activewear + athletic shoes is complete\n"
        "- Formal: Complete coverage + sophisticated color combinations\n"
        "- Casual: Relaxed requirements but still coordinated\n\n"
        
        'Return ONLY JSON: {"is_valid": true, "coverage_issues": [], "color_issues": [], "combined_feedback": "Specific improvement advice", "severity": "minor"}'
    ),
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
        f"AVAILABLE CLOSET ITEMS:\n",
        f"{json.dumps(closet_summary, indent=2)[:15000]}\n\n",
        f"Generate ONE complete outfit that addresses any feedback provided.\n",
        f"CRITICAL: NO DUPLICATE CATEGORIES! Never select 2 pants, 2 shoes, 2 similar tops, etc.\n",
        f"CRITICAL: Use actual item NAMES in rationale (NOT IDs). Example: 'The Blue Denim Jeans pair with the White Cotton Tee' (NOT 'item_123 works with item_456').\n",
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
        return GenerateOutfitResponse(outfits=valid_outfits)
        
    except Exception as e:
        print(f"[Parallel] Generation error: {e}")
        raise HTTPException(status_code=500, detail=f"Parallel generation failed: {str(e)}")
