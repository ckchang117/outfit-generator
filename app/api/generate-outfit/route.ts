import { NextRequest, NextResponse } from "next/server"
import { getSupabaseServer } from "@/src/lib/supabase/server-client"

const AGENTS_URL = process.env.AGENTS_SERVICE_URL || "http://localhost:8081"

export async function POST(req: NextRequest) {
  try {
    const { 
      prompt, 
      pieceCount = 3,
      occasion,
      weather,
      excludeCategories = [],
      userId: requestUserId,
      // New context parameters
      vibe,
      formality,
      timeOfDay
    } = await req.json()
    
    console.log("[GenerateOutfit] Start", { pieceCount, occasion, weather, excludeCategoriesCount: excludeCategories?.length || 0 })

    if (!prompt) {
      console.log("[GenerateOutfit] Missing prompt")
      return NextResponse.json(
        { error: "Prompt is required" },
        { status: 400 }
      )
    }

    const sb = await getSupabaseServer()
    if (!sb) {
      console.error("[GenerateOutfit] No Supabase server client")
      return NextResponse.json(
        { error: "Server configuration error" },
        { status: 500 }
      )
    }

    // Try to get current user - with fallback handling
    let user = null
    let serviceClient = null
    
    try {
      const { data: { user: authUser } } = await sb.auth.getUser()
      user = authUser
      console.log("[GenerateOutfit] Auth user", { hasUser: Boolean(user), userId: user?.id })
    } catch (error) {
      console.log("[GenerateOutfit] Auth error:", error)
    }
    
    if (!user) {
      console.log("[GenerateOutfit] No authenticated user - trying service role fallback")
      
      // Create service role client for RLS bypass
      const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
      if (serviceKey) {
        const { createClient } = await import("@supabase/supabase-js")
        serviceClient = createClient(
          process.env.NEXT_PUBLIC_SUPABASE_URL!,
          serviceKey
        )
        console.log("[GenerateOutfit] Service client created for RLS bypass")
      } else {
        return NextResponse.json(
          { error: "Authentication required" },
          { status: 401 }
        )
      }
    }

    const startTime = Date.now()

    // Use user ID from auth or request
    let userId = user?.id || requestUserId
    
    if (!userId) {
      console.log("[GenerateOutfit] No user ID available")
      return NextResponse.json(
        { error: "User authentication required for outfit generation" },
        { status: 401 }
      )
    }
    
    console.log("[GenerateOutfit] Using userId:", userId)

    // Fetch user's closet with ALL metadata fields
    const queryClient = serviceClient || sb
    console.log("[GenerateOutfit] Using client type:", serviceClient ? "service" : "auth")
    
    // First, let's check if we can see ANY items for debugging
    const { data: allItems, error: allError } = await queryClient
      .from("clothing_items")
      .select("id, user_id, name, category")
      .limit(10)
    
    console.log("[GenerateOutfit] All items check:", { count: allItems?.length || 0, sample: allItems?.slice(0, 2) })
    
    const { data: items, error: fetchError } = await queryClient
      .from("clothing_items")
      .select(`
        id, name, category, subcategory, colors, season, formality, style_tags, description, archived,
        occasions, layering_role, best_paired_with, avoid_combinations, styling_notes, 
        color_coordination_notes, weather_suitability, temperature_range, styling_versatility,
        undertones, color_intensity, neckline, sleeve_length, length, silhouette, texture,
        transparency, care_level, wrinkle_resistance, stretch_level, comfort_level,
        design_details, print_scale, vintage_era, trend_status, flattering_for, color_dominance
      `)
      .eq("user_id", userId)
      .or("archived.is.null,archived.eq.false")
      .order("favorite", { ascending: false })
      .limit(500)
      
    console.log("[GenerateOutfit] User-specific items:", { userId, count: items?.length || 0, sample: items?.slice(0, 2) })

    console.log("[GenerateOutfit] Closet fetch", { ok: !fetchError, count: items?.length || 0, error: fetchError?.message })

    if (fetchError) {
      return NextResponse.json(
        { error: "Failed to access closet" },
        { status: 500 }
      )
    }

    if (!items || items.length < 2) {
      console.log("[GenerateOutfit] Not enough items", { count: items?.length || 0 })
      return NextResponse.json(
        { error: "Not enough items in closet" },
        { status: 400 }
      )
    }

    // Filter out excluded categories
    const availableItems = items.filter(
      item => !excludeCategories.includes(item.category || '')
    )

    console.log("[GenerateOutfit] Available after filter", { count: availableItems.length })

    if (availableItems.length < 2) {
      return NextResponse.json(
        { error: "Not enough items after filtering" },
        { status: 400 }
      )
    }

    console.log("[GenerateOutfit] Calling Agents service", { url: `${AGENTS_URL}/generate-outfit` })
    const res = await fetch(`${AGENTS_URL}/generate-outfit`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        request: prompt,
        pieceCount,
        occasion,
        weather,
        excludeCategories,
        // New context parameters
        vibe,
        formality,
        timeOfDay,
        closet: availableItems.map(i => ({
          id: i.id,
          name: i.name,
          category: i.category,
          subcategory: i.subcategory,
          colors: i.colors,
          season: i.season,
          formality: i.formality,
          styleTags: i.style_tags,
          description: i.description,
          // New coordination fields
          occasions: i.occasions,
          layeringRole: i.layering_role,
          bestPairedWith: i.best_paired_with,
          avoidCombinations: i.avoid_combinations,
          stylingNotes: i.styling_notes,
          colorCoordinationNotes: i.color_coordination_notes,
          weatherSuitability: i.weather_suitability,
          temperatureRange: i.temperature_range,
          stylingVersatility: i.styling_versatility,
          undertones: i.undertones,
          colorIntensity: i.color_intensity,
        }))
      })
    })

    console.log("[GenerateOutfit] Agents response", { status: res.status })

    if (!res.ok) {
      const err = await res.json().catch(() => ({}))
      console.error("[GenerateOutfit] Agents service error", { status: res.status, err })
      return NextResponse.json({ error: err.detail || "Agent generation failed" }, { status: 500 })
    }

    const agentsResponse = await res.json()
    
    // Handle new multi-outfit response format
    let outfitSuggestions = []
    if (agentsResponse.outfits && Array.isArray(agentsResponse.outfits)) {
      outfitSuggestions = agentsResponse.outfits
      console.log("[GenerateOutfit] Received", agentsResponse.outfits.length, "outfit options")
    } else {
      // Fallback for old single-outfit format  
      outfitSuggestions = [agentsResponse]
    }

    // Validate and process all outfits
    const validIds = new Set(items.map(i => i.id))
    const validatedOutfits = []
    
    for (const suggestion of outfitSuggestions) {
      const validatedIds = suggestion.itemIds.filter((id: string) => validIds.has(id))
      
      if (validatedIds.length > 0) {
        const outfit = {
          id: crypto.randomUUID(),
          itemIds: validatedIds,
          rationale: suggestion.rationale,
          createdAt: new Date().toISOString(),
          score: suggestion.score,
          occasion: suggestion.occasion,
          title: suggestion.title,
        }
        validatedOutfits.push(outfit)
      }
    }

    if (validatedOutfits.length === 0) {
      console.log("[GenerateOutfit] No valid item IDs returned in any outfit")
      return NextResponse.json(
        { error: "No valid items in suggestions" },
        { status: 500 }
      )
    }

    const generationTime = Date.now() - startTime
    
    // Use first outfit as primary
    const primaryOutfit = validatedOutfits[0]

    console.log("[GenerateOutfit] Generation complete", { 
      outfitCount: validatedOutfits.length, 
      generationTimeMs: generationTime 
    })

    return NextResponse.json({
      success: true,
      outfit: primaryOutfit,
      alternates: validatedOutfits.slice(1), // Return other outfits as alternates
      shoppingRecommendations: agentsResponse.shopping_recommendations || [],
      generationTimeMs: generationTime,
      // Include generation context for potential saving
      generationMetadata: {
        request: prompt,
        occasion: occasion || primaryOutfit.occasion,
        weather,
        aiModel: "agents-sdk",
        generatedAt: new Date().toISOString(),
      }
    })

  } catch (error) {
    console.error("[GenerateOutfit] Exception", { error })
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Generation failed" },
      { status: 500 }
    )
  }
}
