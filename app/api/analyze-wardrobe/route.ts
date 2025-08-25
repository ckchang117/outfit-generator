import { NextRequest, NextResponse } from "next/server"
import { getSupabaseServer } from "@/src/lib/supabase/server-client"

const AGENTS_URL = process.env.AGENTS_SERVICE_URL || "http://localhost:8081"

export async function POST(req: NextRequest) {
  try {
    const { 
      focus_areas = ["style", "color", "gaps", "seasonal"],
      user_preferences = {},
      userId: requestUserId 
    } = await req.json()
    
    console.log("[AnalyzeWardrobe] Start", { focusAreasCount: focus_areas?.length || 0 })

    const sb = await getSupabaseServer()
    if (!sb) {
      console.error("[AnalyzeWardrobe] No Supabase server client")
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
      console.log("[AnalyzeWardrobe] Auth user", { hasUser: Boolean(user), userId: user?.id })
    } catch (error) {
      console.log("[AnalyzeWardrobe] Auth error:", error)
    }
    
    if (!user) {
      console.log("[AnalyzeWardrobe] No authenticated user - trying service role fallback")
      
      // Create service role client for RLS bypass
      const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
      if (serviceKey) {
        const { createClient } = await import("@supabase/supabase-js")
        serviceClient = createClient(
          process.env.NEXT_PUBLIC_SUPABASE_URL!,
          serviceKey
        )
        console.log("[AnalyzeWardrobe] Service client created for RLS bypass")
      } else {
        return NextResponse.json(
          { error: "Authentication required" },
          { status: 401 }
        )
      }
    }

    // Determine which client to use and which user ID
    const finalClient = serviceClient || sb
    const finalUserId = requestUserId || user?.id

    if (!finalUserId) {
      console.log("[AnalyzeWardrobe] No user ID available", { 
        hasRequestUserId: Boolean(requestUserId), 
        hasAuthUser: Boolean(user), 
        hasServiceClient: Boolean(serviceClient) 
      })
      return NextResponse.json(
        { error: "Authentication required" },
        { status: 401 }
      )
    }

    console.log("[AnalyzeWardrobe] Fetching items for user:", finalUserId)

    // First, let's check if any items exist for this user (including archived)
    const { data: allItems, error: allItemsError } = await finalClient
      .from("clothing_items")
      .select("id, name, archived")
      .eq("user_id", finalUserId)

    console.log("[AnalyzeWardrobe] Total items for user:", {
      count: allItems?.length || 0,
      items: allItems?.map(item => ({ id: item.id, name: item.name, archived: item.archived })) || []
    })

    // Fetch all clothing items with metadata for the user
    // Handle NULL archived values by treating them as non-archived
    const { data: items, error: fetchError } = await finalClient
      .from("clothing_items")
      .select(`
        id,
        name,
        notes,
        category,
        subcategory,
        colors,
        primary_color,
        pattern,
        material,
        season,
        formality,
        style_tags,
        brand,
        fit,
        description,
        ai_attributes,
        created_at,
        archived
      `)
      .eq("user_id", finalUserId)
      .or('archived.is.null,archived.eq.false')
      .order("created_at", { ascending: false })

    if (fetchError) {
      console.error("[AnalyzeWardrobe] Fetch error:", fetchError)
      return NextResponse.json(
        { error: "Failed to fetch wardrobe items" },
        { status: 500 }
      )
    }

    console.log("[AnalyzeWardrobe] Non-archived items found:", items?.length || 0)

    if (!items || items.length === 0) {
      console.log("[AnalyzeWardrobe] No non-archived items found")
      
      // Provide helpful error message based on whether user has any items at all
      const totalItems = allItems?.length || 0
      const archivedItems = allItems?.filter(item => item.archived === true).length || 0
      const activeItems = totalItems - archivedItems
      
      console.log("[AnalyzeWardrobe] Item breakdown:", { 
        total: totalItems, 
        archived: archivedItems, 
        active: activeItems,
        nullArchived: allItems?.filter(item => item.archived === null).length || 0
      })
      
      let errorMessage = "No wardrobe items found. Please add some clothing items first."
      if (totalItems > 0) {
        if (archivedItems === totalItems) {
          errorMessage = `Found ${totalItems} items, but all ${archivedItems} are archived. Please unarchive some items or add new ones to analyze.`
        } else {
          errorMessage = `Found ${totalItems} items but unable to fetch them for analysis. This might be a database issue - please try again.`
        }
      }
      
      return NextResponse.json(
        { error: errorMessage },
        { status: 400 }
      )
    }

    console.log(`[AnalyzeWardrobe] Found ${items.length} items`)

    // Transform items for agents service
    const closetItems = items.map(item => ({
      id: item.id,
      name: item.name,
      category: item.category,
      subcategory: item.subcategory,
      colors: item.colors || [],
      season: item.season || [],
      formality: item.formality,
      styleTags: item.style_tags || [],
      description: item.description,
      // Extract additional fields from ai_attributes if available
      occasions: item.ai_attributes?.occasions || [],
      layeringRole: item.ai_attributes?.layeringRole || "standalone",
      bestPairedWith: item.ai_attributes?.bestPairedWith || [],
      avoidCombinations: item.ai_attributes?.avoidCombinations || [],
      stylingNotes: item.ai_attributes?.stylingNotes || "",
      colorCoordinationNotes: item.ai_attributes?.colorCoordinationNotes || "",
      weatherSuitability: item.ai_attributes?.weatherSuitability || [],
      temperatureRange: item.ai_attributes?.temperatureRange || "",
      stylingVersatility: item.ai_attributes?.stylingVersatility || "moderate",
      undertones: item.ai_attributes?.undertones || ""
    }))

    // Prepare request for agents service
    const analysisRequest = {
      closet_items: closetItems,
      user_preferences: user_preferences,
      focus_areas: focus_areas
    }

    console.log(`[AnalyzeWardrobe] Calling agents service with ${closetItems.length} items`)

    // Call agents service for wardrobe analysis
    const agentsResponse = await fetch(`${AGENTS_URL}/analyze-wardrobe`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(analysisRequest),
    })

    if (!agentsResponse.ok) {
      const errorText = await agentsResponse.text()
      console.error("[AnalyzeWardrobe] Agents service error:", {
        status: agentsResponse.status,
        error: errorText
      })
      
      return NextResponse.json(
        { error: "Wardrobe analysis failed. Please try again." },
        { status: 500 }
      )
    }

    const analysisResult = await agentsResponse.json()
    console.log("[AnalyzeWardrobe] Analysis complete", {
      insights: analysisResult.key_insights?.length || 0,
      recommendations: analysisResult.recommendations?.length || 0,
      versatilityScore: analysisResult.versatility_score,
      cohesionScore: analysisResult.cohesion_score
    })

    // Add some metadata to the response
    const response = {
      ...analysisResult,
      analyzed_at: new Date().toISOString(),
      items_analyzed: closetItems.length,
      focus_areas_requested: focus_areas
    }

    return NextResponse.json(response)

  } catch (error) {
    console.error("[AnalyzeWardrobe] Unexpected error:", error)
    return NextResponse.json(
      { error: "An unexpected error occurred during wardrobe analysis" },
      { status: 500 }
    )
  }
}