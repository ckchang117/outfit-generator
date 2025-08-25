"""
Deterministic scoring functions for wardrobe analysis.
Provides consistent, explainable metrics for wardrobe evaluation.
"""

from typing import List, Dict, Set, Tuple, Any, Optional, Union
from collections import Counter
import math


def safe_get_list(item: Dict, field: str, default: Optional[List] = None) -> List:
    """Safely get a list field from an item, handling various data types."""
    value = item.get(field, default if default is not None else [])
    if value is None:
        return []
    if isinstance(value, list):
        return value
    if isinstance(value, str):
        return [value]  # Convert single string to list
    return []  # Return empty list for other types


def safe_get_string(item: Dict, field: str, default: str = "") -> str:
    """Safely get a string field from an item."""
    value = item.get(field, default)
    if value is None:
        return default
    return str(value)


def calculate_versatility_score(items: List[Dict]) -> Tuple[float, Dict]:
    """
    Calculate versatility score based on mix-and-match potential.
    
    Factors:
    - Color neutrality (neutrals mix with everything)
    - Formality range (items that work casual to formal)
    - Category balance (having complementary pieces)
    - Layering potential
    """
    if not items:
        return 0.0, {"reason": "No items to analyze"}
    
    # Color versatility: ratio of neutrals and versatile colors
    neutral_colors = {'black', 'white', 'gray', 'grey', 'navy', 'beige', 'cream', 'tan', 'brown'}
    versatile_colors = neutral_colors | {'denim', 'khaki', 'olive'}
    
    color_scores = []
    for item in items:
        colors = safe_get_list(item, 'colors')
        item_colors = set()
        for color in colors:
            if isinstance(color, str):
                item_colors.add(color.lower())
        
        if item_colors & versatile_colors:
            color_scores.append(1.0)
        elif item_colors:
            # Partial score for having some coordination potential
            color_scores.append(0.5)
        else:
            color_scores.append(0.3)
    
    avg_color_versatility = sum(color_scores) / len(color_scores) if color_scores else 0
    
    # Formality range: items that span multiple formality levels
    formality_scores = []
    for item in items:
        formality = safe_get_string(item, 'formality', 'casual')
        versatility = safe_get_string(item, 'versatility', 'moderate')
        
        if versatility == 'high':
            formality_scores.append(1.0)
        elif formality in ['smart-casual', 'business-casual']:
            formality_scores.append(0.8)  # These work across more occasions
        elif versatility == 'moderate':
            formality_scores.append(0.6)
        else:
            formality_scores.append(0.4)
    
    avg_formality_range = sum(formality_scores) / len(formality_scores) if formality_scores else 0
    
    # Category balance: having matching tops/bottoms, etc.
    categories = Counter(safe_get_string(item, 'category', 'other') for item in items)
    
    # Calculate pairing potential
    tops = categories.get('top', 0)
    bottoms = categories.get('bottom', 0)
    dresses = categories.get('dress', 0)
    outerwear = categories.get('outerwear', 0)
    
    # Ideal ratio is roughly 1:1 for tops:bottoms, with some dresses and outerwear
    # Fix division by zero issue
    if tops > 0 and bottoms > 0:
        balance_ratio = min(tops, bottoms) / max(tops, bottoms)
    elif tops > 0 or bottoms > 0:
        balance_ratio = 0.3  # Has one category but not both
    else:
        balance_ratio = 0.1  # No tops or bottoms
    
    # Bonus for having layering pieces
    layering_bonus = min(outerwear / max(tops + bottoms, 1) * 2, 0.2)  # Max 0.2 bonus, fixed denominator
    
    # Calculate final versatility score
    versatility_score = (
        avg_color_versatility * 0.35 +  # 35% weight on color mixing
        avg_formality_range * 0.35 +    # 35% weight on formality range
        balance_ratio * 0.25 +          # 25% weight on category balance
        layering_bonus * 0.05           # 5% weight on layering options
    )
    
    details = {
        "color_versatility": round(avg_color_versatility, 2),
        "formality_range": round(avg_formality_range, 2),
        "category_balance": round(balance_ratio, 2),
        "layering_bonus": round(layering_bonus, 2),
        "total_items": len(items),
        "explanation": f"Based on {round(avg_color_versatility*100)}% color mixing potential, "
                      f"{round(avg_formality_range*100)}% formality flexibility, "
                      f"and {round(balance_ratio*100)}% category balance"
    }
    
    return min(versatility_score, 1.0), details


def calculate_cohesion_score(items: List[Dict]) -> Tuple[float, Dict]:
    """
    Calculate cohesion score based on style consistency.
    
    Factors:
    - Color palette harmony
    - Style tag consistency
    - Aesthetic coherence
    """
    if not items:
        return 0.0, {"reason": "No items to analyze"}
    
    # Color cohesion: how well colors work together
    all_colors = []
    for item in items:
        colors = safe_get_list(item, 'colors')
        for color in colors:
            if isinstance(color, str):
                all_colors.append(color.lower())
    
    if not all_colors:
        color_cohesion = 0.5
    else:
        color_counter = Counter(all_colors)
        total_colors = len(set(all_colors))
        
        # Fewer unique colors = more cohesive
        # Ideal is 3-10 colors for a versatile but cohesive wardrobe
        if total_colors <= 2:
            color_cohesion = 0.8  # Too limited but still good
        elif 3 <= total_colors <= 10:
            color_cohesion = 1.0  # Ideal range - more forgiving
        elif 11 <= total_colors <= 15:
            color_cohesion = 0.85  # Good variety
        elif 16 <= total_colors <= 20:
            color_cohesion = 0.7  # Getting scattered
        else:
            color_cohesion = max(0.5, 1.0 - (total_colors - 20) * 0.03)  # Decreases slowly with too many colors
    
    # Style consistency: how well style tags align
    all_styles = []
    for item in items:
        # Try both field names for compatibility
        styles = safe_get_list(item, 'styleTags')
        if not styles:
            styles = safe_get_list(item, 'style_tags')
        for style in styles:
            if isinstance(style, str):
                all_styles.append(style)
    
    if not all_styles:
        style_consistency = 0.5
    else:
        style_counter = Counter(all_styles)
        # Find dominant styles (appear in >15% of items) - more lenient
        dominant_styles = [style for style, count in style_counter.items() 
                          if count >= len(items) * 0.15]
        
        if dominant_styles:
            # Higher score for having clear dominant styles
            style_consistency = min(len(dominant_styles) / 3, 1.0) * 0.8 + 0.2
        else:
            style_consistency = 0.6  # No clear style direction - less harsh penalty
    
    # Formality coherence: not jumping between extremes
    formalities = [safe_get_string(item, 'formality', 'casual') for item in items]
    formality_counter = Counter(formalities)
    
    # Check for good distribution without extremes - more lenient
    has_very_formal = formality_counter.get('formal', 0) > len(items) * 0.3
    has_very_casual = formality_counter.get('athletic', 0) > len(items) * 0.3
    
    if has_very_formal and has_very_casual:
        formality_coherence = 0.75  # Split personality wardrobe - less harsh
    else:
        # Good coherence if most items are in adjacent formality levels
        formality_coherence = 0.95  # Better score for normal wardrobes
    
    # Calculate final cohesion score
    cohesion_score = (
        color_cohesion * 0.4 +        # 40% weight on color harmony
        style_consistency * 0.4 +     # 40% weight on style consistency
        formality_coherence * 0.2     # 20% weight on formality coherence
    )
    
    details = {
        "color_harmony": round(color_cohesion, 2),
        "style_consistency": round(style_consistency, 2),
        "formality_coherence": round(formality_coherence, 2),
        "unique_colors": len(set(all_colors)),
        "dominant_styles": dominant_styles if all_styles else [],
        "explanation": f"Color palette has {len(set(all_colors))} unique colors with "
                      f"{round(color_cohesion*100)}% harmony, "
                      f"{round(style_consistency*100)}% style consistency"
    }
    
    return min(cohesion_score, 1.0), details


def detect_wardrobe_style(items: List[Dict]) -> Dict:
    """
    Detect the wardrobe's style profile based on existing items.
    Returns style type and relevant context for scoring.
    """
    if not items:
        return {
            "style": "neutral",
            "confidence": 0.0,
            "indicators": [],
            "description": "Empty wardrobe"
        }
    
    # Style indicators
    feminine_indicators = {
        'dress', 'skirt', 'blouse', 'heels', 'pumps', 'purse', 'handbag',
        'bra', 'lingerie', 'romper', 'bodysuit', 'leggings'
    }
    
    masculine_indicators = {
        'suit', 'tie', 'dress-shirt', 'boxers', 'briefs', 'blazer'
    }
    
    # Note: Many items are truly neutral (jeans, t-shirts, sneakers, etc.)
    
    # Count indicators
    fem_count = 0
    masc_count = 0
    total_gendered = 0
    
    categories_found = set()
    subcategories_found = set()
    
    for item in items:
        category = safe_get_string(item, 'category', '').lower()
        subcategory = safe_get_string(item, 'subcategory', '').lower()
        name = safe_get_string(item, 'name', '').lower()
        
        categories_found.add(category)
        if subcategory:
            subcategories_found.add(subcategory)
        
        # Check for feminine indicators
        if category in feminine_indicators or subcategory in feminine_indicators:
            fem_count += 1
            total_gendered += 1
        elif any(ind in name for ind in ['dress', 'skirt', 'blouse', 'heel', 'pump']):
            fem_count += 1
            total_gendered += 1
            
        # Check for masculine indicators (though these are often worn by all)
        if category in masculine_indicators or subcategory in masculine_indicators:
            masc_count += 1
            total_gendered += 1
        elif any(ind in name for ind in ['suit', 'tie', 'boxer', 'brief']):
            masc_count += 1
            total_gendered += 1
    
    # Determine style based on indicators
    has_dresses = 'dress' in categories_found
    has_skirts = 'skirt' in categories_found
    has_suits = 'suit' in categories_found or 'suit' in subcategories_found
    
    # Calculate confidence based on how many gendered items we found
    confidence = min(total_gendered / max(len(items) * 0.2, 1), 1.0)  # Expect ~20% to be gendered
    
    # Determine primary style
    if has_dresses or has_skirts or fem_count > masc_count * 2:
        style = "feminine"
        description = "Feminine-presenting wardrobe with dresses/skirts"
    elif masc_count > fem_count * 2 and not has_dresses:
        style = "masculine"
        description = "Masculine-presenting wardrobe without dresses/skirts"
    elif fem_count > 0 and masc_count > 0:
        style = "mixed"
        description = "Mixed-style wardrobe with diverse pieces"
    else:
        style = "neutral"
        description = "Neutral wardrobe with unisex pieces"
    
    # Detect lifestyle indicators
    lifestyle_indicators = []
    
    # Check for athletic wear
    athletic_keywords = ['athletic', 'sport', 'gym', 'yoga', 'running', 'workout']
    athletic_count = sum(1 for item in items 
                        if any(kw in safe_get_string(item, 'category', '').lower() or 
                              kw in safe_get_string(item, 'name', '').lower() 
                              for kw in athletic_keywords))
    if athletic_count > len(items) * 0.15:
        lifestyle_indicators.append("athletic")
    
    # Check for professional wear
    formal_count = sum(1 for item in items 
                      if safe_get_string(item, 'formality', '') in ['formal', 'business', 'professional'])
    if formal_count > len(items) * 0.2:
        lifestyle_indicators.append("professional")
    
    return {
        "style": style,
        "confidence": confidence,
        "has_dresses": has_dresses,
        "has_skirts": has_skirts,
        "lifestyle": lifestyle_indicators,
        "description": description,
        "feminine_count": fem_count,
        "masculine_count": masc_count
    }


def get_relevant_essentials(wardrobe_style: Dict) -> Dict[str, int]:
    """
    Get essential categories and quantities based on wardrobe style.
    """
    style = wardrobe_style.get("style", "neutral")
    lifestyle = wardrobe_style.get("lifestyle", [])
    
    # Base essentials that apply to everyone - higher requirements
    base_essentials = {
        'top': 10,       # Higher requirement for tops
        'bottom': 6,     # Higher requirement for bottoms
        'outerwear': 3,  # More outerwear variety expected
        'shoes': 5,      # More shoe variety expected
    }
    
    # Adjust based on style
    if style == "feminine":
        # Feminine wardrobes might have dresses replacing some tops/bottoms
        essentials = base_essentials.copy()
        if wardrobe_style.get("has_dresses", False):
            essentials['dress'] = 3  # Higher dress requirement
            essentials['bottom'] = 5  # Still need bottoms even with dresses
        essentials['shoes'] = 6  # Often more shoe variety
        
    elif style == "masculine":
        # Masculine wardrobes typically don't have dresses
        essentials = base_essentials.copy()
        # No dress requirement
        
    elif style == "mixed":
        # Mixed style might have everything
        essentials = base_essentials.copy()
        if wardrobe_style.get("has_dresses", False):
            essentials['dress'] = 1  # Some dresses optional
            
    else:  # neutral
        # Neutral wardrobes - stick to basics
        essentials = base_essentials.copy()
    
    # Adjust for lifestyle
    if "athletic" in lifestyle:
        essentials['activewear'] = 4  # Higher activewear requirement
        
    if "professional" in lifestyle:
        # Need more formal pieces
        essentials['top'] = 12  # Even more variety for work
        essentials['bottom'] = 7  # More professional bottoms
        
    return essentials


def calculate_completeness_score(items: List[Dict]) -> Tuple[float, Dict]:
    """
    Calculate completeness score based on wardrobe coverage.
    
    Factors:
    - Essential category coverage
    - Minimum quantities per category
    - Occasion readiness
    """
    if not items:
        return 0.0, {"reason": "No items to analyze"}
    
    # Detect wardrobe style first
    wardrobe_style = detect_wardrobe_style(items)
    
    categories = Counter(safe_get_string(item, 'category', 'other') for item in items)
    
    # Get context-aware essentials based on detected style
    essentials = get_relevant_essentials(wardrobe_style)
    
    # Calculate coverage for each essential category
    coverage_scores = []
    missing_categories = []
    well_covered = []
    
    for category, recommended in essentials.items():
        actual = categories.get(category, 0)
        if actual == 0:
            coverage_scores.append(0)
            missing_categories.append(category)
        elif actual >= recommended:
            coverage_scores.append(1.0)
            well_covered.append(category)
        else:
            # Exponential scaling for partial credit - much stricter
            # 50% of items = 25% score, 70% of items = 49% score
            partial_score = (actual / recommended) ** 1.5
            coverage_scores.append(partial_score)
            if actual < recommended * 0.7:  # Stricter threshold for "missing"
                missing_categories.append(f"{category} (only {actual}/{recommended})")
    
    avg_coverage = sum(coverage_scores) / len(coverage_scores) if coverage_scores else 0
    
    # Occasion readiness: check for formal, casual, athletic coverage
    occasions = set()
    for item in items:
        formality = safe_get_string(item, 'formality', 'casual')
        occasions.add(formality)
        # Also check occasions field if available
        item_occasions = safe_get_list(item, 'occasions')
        for occasion in item_occasions:
            if isinstance(occasion, str):
                occasions.add(occasion)
    
    # Score based on occasion variety - higher requirement
    occasion_coverage = len(occasions) / 6  # Assume 6 main occasion types (stricter)
    occasion_coverage = min(occasion_coverage, 1.0)
    
    # Check for seasonal coverage
    all_seasons = set()
    for item in items:
        seasons = safe_get_list(item, 'season')
        for season in seasons:
            if isinstance(season, str):
                all_seasons.add(season.lower())
    
    seasonal_coverage = len(all_seasons) / 4 if all_seasons else 0.5  # 4 seasons
    
    # Calculate final completeness score
    completeness_score = (
        avg_coverage * 0.5 +          # 50% weight on category coverage
        occasion_coverage * 0.3 +     # 30% weight on occasion readiness
        seasonal_coverage * 0.2       # 20% weight on seasonal coverage
    )
    
    details = {
        "category_coverage": round(avg_coverage, 2),
        "occasion_readiness": round(occasion_coverage, 2),
        "seasonal_coverage": round(seasonal_coverage, 2),
        "missing_essentials": missing_categories,
        "well_covered": well_covered,
        "total_categories": len(categories),
        "wardrobe_style": wardrobe_style["style"],
        "style_description": wardrobe_style["description"],
        "relevant_essentials": list(essentials.keys()),
        "explanation": f"{round(avg_coverage*100)}% essential category coverage for {wardrobe_style['style']} wardrobe, "
                      f"{round(occasion_coverage*100)}% occasion readiness"
    }
    
    return min(completeness_score, 1.0), details


def calculate_seasonal_distribution(items: List[Dict]) -> Dict:
    """
    Calculate seasonal distribution using weighted contributions.
    Items contribute fractionally based on how many seasons they cover.
    
    Returns percentages that sum to 100% and versatility metrics.
    """
    if not items:
        return {
            "spring_percentage": 0.25,
            "summer_percentage": 0.25,
            "fall_percentage": 0.25,
            "winter_percentage": 0.25,
            "versatility_metric": 0.0,
            "primary_season": "balanced",
            "distribution_description": "No items to analyze"
        }
    
    # Initialize weighted season counts
    weighted_counts = {
        'spring': 0.0,
        'summer': 0.0,
        'fall': 0.0,
        'winter': 0.0
    }
    
    versatile_items = 0  # Count of items working 3+ seasons
    
    for item in items:
        seasons_raw = safe_get_list(item, 'season')
        # Normalize seasons to lowercase
        seasons = []
        for s in seasons_raw:
            if isinstance(s, str):
                s_lower = s.lower()
                if s_lower in ['spring', 'summer', 'fall', 'winter']:
                    seasons.append(s_lower)
                elif s_lower == 'all-season':
                    seasons = ['spring', 'summer', 'fall', 'winter']
                    break
        
        # If no season data, assume all-season
        if not seasons:
            seasons = ['spring', 'summer', 'fall', 'winter']
        
        # Count versatile items (3+ seasons)
        if len(seasons) >= 3:
            versatile_items += 1
        
        # Calculate weighted contribution
        if seasons:
            weight = 1.0 / len(seasons)
            for season in seasons:
                if season in weighted_counts:
                    weighted_counts[season] += weight
    
    # Convert to percentages
    total_weight = sum(weighted_counts.values())
    if total_weight > 0:
        percentages = {
            season: (count / total_weight) for season, count in weighted_counts.items()
        }
    else:
        # Equal distribution if no valid data
        percentages = {season: 0.25 for season in weighted_counts}
    
    # Find primary season
    primary_season = max(percentages.items(), key=lambda x: x[1])[0]
    max_percentage = percentages[primary_season]
    
    # Generate description
    if max_percentage > 0.35:
        description = f"{primary_season.capitalize()}-focused wardrobe"
    elif max_percentage < 0.28 and min(percentages.values()) > 0.22:
        description = "Well-balanced seasonal distribution"
    else:
        # Find top two seasons
        sorted_seasons = sorted(percentages.items(), key=lambda x: x[1], reverse=True)
        description = f"{sorted_seasons[0][0].capitalize()}/{sorted_seasons[1][0].capitalize()}-leaning wardrobe"
    
    # Calculate versatility metric
    versatility_metric = versatile_items / len(items) if items else 0
    
    return {
        "spring_percentage": round(percentages['spring'], 3),
        "summer_percentage": round(percentages['summer'], 3),
        "fall_percentage": round(percentages['fall'], 3),
        "winter_percentage": round(percentages['winter'], 3),
        "versatility_metric": round(versatility_metric, 3),
        "primary_season": primary_season,
        "distribution_description": description
    }


def calculate_seasonal_scores(items: List[Dict]) -> Dict:
    """
    Calculate seasonal coverage scores.
    
    Returns scores for each season plus all-season percentage.
    """
    if not items:
        return {
            "spring_coverage": 0.0,
            "summer_coverage": 0.0,
            "fall_coverage": 0.0,
            "winter_coverage": 0.0,
            "all_season_percentage": 0.0,
            "seasonal_gaps": {},
            "details": {"reason": "No items to analyze"}
        }
    
    # Count items per season
    season_counts = {
        'spring': 0,
        'summer': 0,
        'fall': 0,
        'winter': 0,
        'all-season': 0
    }
    
    valid_seasons = {'spring', 'summer', 'fall', 'winter', 'all-season'}
    
    for item in items:
        seasons_raw = safe_get_list(item, 'season')
        # Normalize seasons to lowercase
        seasons = []
        for s in seasons_raw:
            if isinstance(s, str):
                seasons.append(s.lower())
        
        # Check if truly all-season (explicitly marked or has all 4 seasons)
        season_set = set(seasons) & {'spring', 'summer', 'fall', 'winter'}
        is_all_season = 'all-season' in seasons or len(season_set) == 4
        
        if is_all_season:
            # Count as all-season and for each individual season
            season_counts['all-season'] += 1
            for season in ['spring', 'summer', 'fall', 'winter']:
                season_counts[season] += 1
        elif seasons:
            # Only count for explicitly listed seasons
            for season in seasons:
                if season in valid_seasons and season != 'all-season':
                    season_counts[season] += 1
        else:
            # No season data - assume it's basic/all-season
            season_counts['all-season'] += 1
            for season in ['spring', 'summer', 'fall', 'winter']:
                season_counts[season] += 1
    
    # Calculate minimum items needed per season (based on total wardrobe size)
    total_items = len(items)
    if total_items < 20:
        min_per_season = 5  # Small wardrobe
    elif total_items < 50:
        min_per_season = 10  # Medium wardrobe
    else:
        min_per_season = 15  # Large wardrobe
    
    # Calculate coverage scores
    seasonal_scores = {}
    seasonal_gaps = {}
    
    for season in ['spring', 'summer', 'fall', 'winter']:
        count = season_counts[season]
        score = min(count / min_per_season, 1.0)
        seasonal_scores[f"{season}_coverage"] = score
        
        if score < 0.7:  # Less than 70% coverage is a gap
            needed = max(0, min_per_season - count)
            seasonal_gaps[season] = f"Need {needed} more {season} items"
    
    # Calculate all-season percentage
    all_season_pct = season_counts['all-season'] / total_items if total_items > 0 else 0
    
    return {
        "spring_coverage": round(seasonal_scores['spring_coverage'], 2),
        "summer_coverage": round(seasonal_scores['summer_coverage'], 2),
        "fall_coverage": round(seasonal_scores['fall_coverage'], 2),
        "winter_coverage": round(seasonal_scores['winter_coverage'], 2),
        "all_season_percentage": round(all_season_pct, 2),
        "seasonal_gaps": seasonal_gaps,
        "details": {
            "items_per_season": {k: v for k, v in season_counts.items()},
            "minimum_recommended": min_per_season,
            "total_items": total_items
        }
    }


def calculate_all_scores(items: List[Dict]) -> Dict:
    """
    Calculate all wardrobe scores and return comprehensive metrics.
    """
    versatility, versatility_details = calculate_versatility_score(items)
    cohesion, cohesion_details = calculate_cohesion_score(items)
    completeness, completeness_details = calculate_completeness_score(items)
    seasonal_dist = calculate_seasonal_distribution(items)
    
    return {
        "versatility_score": round(versatility, 2),
        "versatility_details": versatility_details,
        "cohesion_score": round(cohesion, 2),
        "cohesion_details": cohesion_details,
        "completeness_score": round(completeness, 2),
        "completeness_details": completeness_details,
        "seasonal_distribution": seasonal_dist
    }