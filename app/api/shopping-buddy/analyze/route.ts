import { NextRequest, NextResponse } from "next/server"
import { getSupabaseServer } from "@/src/lib/supabase/server-client"

const AGENTS_URL = process.env.AGENTS_SERVICE_URL || "http://localhost:8081"

export async function POST(req: NextRequest) {
  try {
    console.log("[ShoppingBuddy] Analyze request received")
    
    const body = await req.json()
    const { photo_url, photo_urls, store_location, price, userId } = body
    
    // Support both single photo_url (legacy) and photo_urls array (new)
    const photos = photo_urls && Array.isArray(photo_urls) && photo_urls.length > 0 
      ? photo_urls 
      : (photo_url ? [photo_url] : [])
    
    if (photos.length === 0) {
      return NextResponse.json(
        { error: "At least one photo is required" },
        { status: 400 }
      )
    }

    if (!userId) {
      return NextResponse.json(
        { error: "User ID is required" },
        { status: 400 }
      )
    }

    // Get user's wardrobe items
    const sb = await getSupabaseServer()
    if (!sb) {
      return NextResponse.json(
        { error: "Server configuration error" },
        { status: 500 }
      )
    }

    // Try to get current user for auth context
    let user = null
    let serviceClient = null
    
    try {
      const { data: { user: authUser } } = await sb.auth.getUser()
      user = authUser
      console.log("[ShoppingBuddy] Auth user", { hasUser: Boolean(user), userId: user?.id })
    } catch (error) {
      console.log("[ShoppingBuddy] Auth error:", error)
    }
    
    // If no auth user, create service role client for RLS bypass
    if (!user) {
      console.log("[ShoppingBuddy] No authenticated user - using service role")
      const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
      if (serviceKey) {
        const { createClient } = await import("@supabase/supabase-js")
        serviceClient = createClient(
          process.env.NEXT_PUBLIC_SUPABASE_URL!,
          serviceKey
        )
        console.log("[ShoppingBuddy] Service client created for RLS bypass")
      }
    }

    // Use service client if available, otherwise use regular client
    const queryClient = serviceClient || sb
    console.log("[ShoppingBuddy] Using client type:", serviceClient ? "service" : "auth")

    // Fetch user's existing wardrobe
    const { data: wardrobeItems, error: fetchError } = await queryClient
      .from("clothing_items")
      .select("*")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })

    if (fetchError) {
      console.error("[ShoppingBuddy] Failed to fetch wardrobe:", fetchError)
      return NextResponse.json(
        { error: "Failed to fetch wardrobe" },
        { status: 500 }
      )
    }

    console.log(`[ShoppingBuddy] Analyzing against ${wardrobeItems?.length || 0} wardrobe items`)
    
    // Generate signed URLs for wardrobe item photos (following analyze-item pattern)
    console.log("[ShoppingBuddy] Generating signed URLs for wardrobe item photos...")
    const processedWardrobeItems = []
    
    for (const item of wardrobeItems || []) {
      const processedItem = { ...item }
      
      // Generate signed URL for photo_url if it exists and is a relative path
      if (item.photo_url && !item.photo_url.startsWith('http') && !item.photo_url.startsWith('data:')) {
        const { data, error } = await queryClient.storage
          .from("item-photos")
          .createSignedUrl(item.photo_url, 36000) // 10 hours expiry
        
        if (!error && data?.signedUrl) {
          processedItem.photo_url = data.signedUrl
          console.log(`[ShoppingBuddy] Generated signed URL for item ${item.id}`)
        } else {
          console.warn(`[ShoppingBuddy] Failed to generate signed URL for ${item.photo_url}:`, error)
        }
      }
      
      // Generate signed URLs for photo_urls array if it exists
      if (item.photo_urls && Array.isArray(item.photo_urls)) {
        const signedPhotoUrls = []
        for (const photoUrl of item.photo_urls) {
          if (photoUrl && !photoUrl.startsWith('http') && !photoUrl.startsWith('data:')) {
            const { data, error } = await queryClient.storage
              .from("item-photos")
              .createSignedUrl(photoUrl, 36000)
            
            if (!error && data?.signedUrl) {
              signedPhotoUrls.push(data.signedUrl)
            } else {
              console.warn(`[ShoppingBuddy] Failed to generate signed URL for ${photoUrl}:`, error)
              signedPhotoUrls.push(photoUrl) // Keep original if signing fails
            }
          } else {
            signedPhotoUrls.push(photoUrl) // Keep as-is if already valid URL
          }
        }
        processedItem.photo_urls = signedPhotoUrls
      }
      
      processedWardrobeItems.push(processedItem)
    }
    
    console.log(`[ShoppingBuddy] Generated signed URLs for ${processedWardrobeItems.length} wardrobe items`)

    // Call agents service for analysis (use first photo for now)
    const agentResponse = await fetch(`${AGENTS_URL}/shopping-buddy/analyze`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        photo_url: photos[0], // Use first photo for analysis
        wardrobe_items: processedWardrobeItems,
        store_location,
        price
      })
    })

    if (!agentResponse.ok) {
      const errorText = await agentResponse.text()
      console.error("[ShoppingBuddy] Agent analysis failed:", errorText)
      return NextResponse.json(
        { error: "Analysis failed" },
        { status: 500 }
      )
    }

    const analysisResult = await agentResponse.json()
    console.log("[ShoppingBuddy] Analysis complete:", {
      score: analysisResult.compatibility?.score,
      recommendation: analysisResult.recommendation,
      outfitCount: analysisResult.outfitCount
    })

    return NextResponse.json(analysisResult)

  } catch (error) {
    console.error("[ShoppingBuddy] Exception:", error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Analysis failed" },
      { status: 500 }
    )
  }
}