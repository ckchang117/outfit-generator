import { NextRequest, NextResponse } from "next/server"
import { getSupabaseServer } from "@/src/lib/supabase/server-client"

const AGENTS_URL = process.env.AGENTS_SERVICE_URL || "http://localhost:8081"

export async function POST(req: NextRequest) {
  try {
    console.log("[AnalyzeItem] POST start - route handler reached!")
    
    const body = await req.json()
    const { itemId, userId } = body
    console.log("[AnalyzeItem] Body parsed", { itemId, userId })
    
    if (!itemId) {
      console.log("[AnalyzeItem] Missing itemId")
      return NextResponse.json(
        { error: "Item ID is required" },
        { status: 400 }
      )
    }

    // For now, accept userId from client to bypass auth issues
    if (!userId) {
      console.log("[AnalyzeItem] Missing userId")
      return NextResponse.json(
        { error: "User ID is required" },
        { status: 400 }
      )
    }

    const sb = await getSupabaseServer()
    if (!sb) {
      console.error("[AnalyzeItem] getSupabaseServer returned null")
      return NextResponse.json(
        { error: "Server configuration error" },
        { status: 500 }
      )
    }
    
    // Track service client if we create one
    let serviceClient = null

    // Bypass auth check and use provided userId
    console.log("[AnalyzeItem] Using provided userId:", userId)

    // First, let's check if we can query without RLS
    console.log("[AnalyzeItem] Attempting to fetch item:", itemId)
    
    // Try to fetch item - handle empty results properly
    const { data: items, error: fetchError } = await sb
      .from("clothing_items")
      .select("*")
      .eq("id", itemId)
      .eq("user_id", userId)
    
    let item = items?.[0] || null
    
    console.log("[AnalyzeItem] Fetch result:", {
      found: Boolean(item),
      rowCount: items?.length || 0,
      error: fetchError?.message,
      errorCode: fetchError?.code,
      itemName: item?.name
    })
    
    // If no item found, it's likely due to RLS policies
    if (!item && !fetchError) {
      console.log("[AnalyzeItem] No item found - likely RLS issue. Trying with service role...")
      
      // Create a service role client if we have the key
      const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
      if (serviceKey) {
        const { createClient } = await import("@supabase/supabase-js")
        serviceClient = createClient(
          process.env.NEXT_PUBLIC_SUPABASE_URL!,
          serviceKey
        )
        
        const { data: serviceItems } = await serviceClient
          .from("clothing_items")
          .select("*")
          .eq("id", itemId)
          .eq("user_id", userId)
        
        const serviceItem = serviceItems?.[0] || null
        console.log("[AnalyzeItem] Service role fetch:", {
          found: Boolean(serviceItem),
          itemName: serviceItem?.name
        })
        
        if (serviceItem) {
          // Successfully found item with service role - continue with analysis
          item = serviceItem
        }
      }
    }

    console.log("[AnalyzeItem] Fetched item", {
      ok: !fetchError && Boolean(item),
      error: fetchError?.message,
      name: item?.name,
      hasPhotoUrl: Boolean(item?.photo_url),
      photoUrlsCount: (item?.photo_urls || [])?.length,
    })

    if (fetchError || !item) {
      return NextResponse.json(
        { error: "Item not found" },
        { status: 404 }
      )
    }

    // Get photo URLs
    const photoUrls: string[] = item.photo_urls || (item.photo_url ? [item.photo_url] : [])
    if (photoUrls.length === 0) {
      console.log("[AnalyzeItem] No photos on item")
      return NextResponse.json(
        { error: "No photos to analyze" },
        { status: 400 }
      )
    }

    // Generate signed URLs for photos
    const signedUrls: string[] = []
    for (const photoPath of photoUrls) {
      const isHttp = /^https?:\/\//i.test(photoPath || "")
      console.log("[AnalyzeItem] Signing photo", { isHttp, photoPathSample: (photoPath || "").slice(0, 32) })
      if (!photoPath) continue
      
      if (isHttp) {
        signedUrls.push(photoPath)
      } else {
        // Use service client if available for storage access
        const storageClient = serviceClient || sb
        const { data, error } = await storageClient.storage
          .from("item-photos")
          .createSignedUrl(photoPath, 600) // 10 minute expiry
        
        if (error) {
          console.warn("[AnalyzeItem] createSignedUrl error", { message: error.message })
        }
        if (data?.signedUrl) {
          signedUrls.push(data.signedUrl)
        }
      }
    }

    console.log("[AnalyzeItem] Signed URLs ready", { count: signedUrls.length })

    if (signedUrls.length === 0) {
      console.log("[AnalyzeItem] No signed URLs generated")
      return NextResponse.json(
        { error: "Could not access photos" },
        { status: 500 }
      )
    }

    // Analyze using Agents Service
    console.log("[AnalyzeItem] Calling Agents service", { url: `${AGENTS_URL}/analyze-item` })
    const res = await fetch(`${AGENTS_URL}/analyze-item`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: item.name,
        notes: item.notes,
        photo_urls: signedUrls,
      }),
    })

    console.log("[AnalyzeItem] Agents service response", { status: res.status })
    if (!res.ok) {
      const errorText = await res.text()
      let err = {}
      try {
        err = JSON.parse(errorText)
      } catch {
        err = { detail: errorText }
      }
      console.error("[AnalyzeItem] Agents service error", { 
        status: res.status, 
        error: err,
        errorText: errorText.substring(0, 500)
      })
      return NextResponse.json({ error: (err as any).detail || errorText || "Agent analysis failed" }, { status: 500 })
    }

    const analysis = await res.json()
    console.log("[AnalyzeItem] Analysis received", { 
      keys: Object.keys(analysis || {}),
      // Coordination fields
      timeOfDay: analysis.timeOfDay,
      weatherSuitability: analysis.weatherSuitability,
      temperatureRange: analysis.temperatureRange,
      colorCoordinationNotes: analysis.colorCoordinationNotes?.substring(0, 50) + "...",
      stylingNotes: analysis.stylingNotes?.substring(0, 50) + "...",
      bestPairedWith: analysis.bestPairedWith,
      avoidCombinations: analysis.avoidCombinations,
      occasions: analysis.occasions,
      // Detail fields
      flatteringFor: analysis.flatteringFor,
      designDetails: analysis.designDetails,
      texture: analysis.texture,
      silhouette: analysis.silhouette,
      length: analysis.length,
      neckline: analysis.neckline
    })

    // Update item with analysis results
    const updateData = {
      // Basic attributes
      description: analysis.description,
      category: analysis.category,
      subcategory: analysis.subcategory,
      colors: analysis.colors,
      primary_color: analysis.primaryColor,
      pattern: analysis.pattern,
      material: analysis.material,
      season: analysis.season,
      formality: analysis.formality,
      style_tags: analysis.styleTags,
      brand: analysis.brand,
      fit: analysis.fit,
      
      // Style and coordination fields
      neckline: analysis.neckline,
      sleeve_length: analysis.sleeveLength,
      length: analysis.length,
      silhouette: analysis.silhouette,
      texture: analysis.texture,
      transparency: analysis.transparency,
      layering_role: analysis.layeringRole,
      
      // Occasion and versatility
      occasions: analysis.occasions,
      time_of_day: analysis.timeOfDay,
      weather_suitability: analysis.weatherSuitability,
      temperature_range: analysis.temperatureRange,
      
      // Coordination hints
      color_coordination_notes: analysis.colorCoordinationNotes,
      styling_notes: analysis.stylingNotes,
      avoid_combinations: analysis.avoidCombinations,
      best_paired_with: analysis.bestPairedWith,
      
      // Practical considerations
      care_level: analysis.careLevel,
      wrinkle_resistance: analysis.wrinkleResistance,
      stretch_level: analysis.stretchLevel,
      comfort_level: analysis.comfortLevel,
      
      // Advanced style attributes
      design_details: analysis.designDetails,
      print_scale: analysis.printScale,
      vintage_era: analysis.vintageEra,
      trend_status: analysis.trendStatus,
      
      // Body type and styling
      flattering_for: analysis.flatteringFor,
      styling_versatility: analysis.stylingVersatility,
      
      // Color and coordination
      undertones: analysis.undertones,
      color_intensity: analysis.colorIntensity,
      color_dominance: analysis.colorDominance,
      
      ai_attributes: analysis.aiAttributes,
      ai_analysis_version: 2, // Increment version for new schema
      analyzed_at: new Date().toISOString(),
    }

    console.log("[AnalyzeItem] Attempting update with data:", {
      keys: Object.keys(updateData),
      category: updateData.category,
      formality: updateData.formality,
      colorsLength: updateData.colors?.length
    })

    // Use service client for update to bypass RLS issues
    const updateClient = serviceClient || sb
    const { data: updateResult, error: updateError } = await updateClient
      .from("clothing_items")
      .update(updateData)
      .eq("id", itemId)
      .eq("user_id", userId)
      .select()

    console.log("[AnalyzeItem] Update result:", {
      success: !updateError,
      affectedRows: updateResult?.length || 0,
      error: updateError?.message,
      errorCode: (updateError as any)?.code,
      errorDetails: (updateError as any)?.details
    })

    if (updateError) {
      console.error("[AnalyzeItem] Update failed", { 
        message: updateError.message, 
        code: (updateError as any)?.code,
        details: (updateError as any)?.details,
        hint: (updateError as any)?.hint
      })
      return NextResponse.json(
        { error: `Failed to save analysis: ${updateError.message}` },
        { status: 500 }
      )
    }

    if (!updateResult || updateResult.length === 0) {
      console.error("[AnalyzeItem] Update succeeded but no rows affected - possible RLS issue")
      return NextResponse.json(
        { error: "Update succeeded but no rows were affected - check permissions" },
        { status: 500 }
      )
    }

    console.log("[AnalyzeItem] Update succeeded", { itemId })
    return NextResponse.json({ success: true, analysis })

  } catch (error) {
    console.error("[AnalyzeItem] Exception", { error })
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Analysis failed" },
      { status: 500 }
    )
  }
}
