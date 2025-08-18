import { getSupabaseBrowser as getSupabase, getCurrentSession } from "./supabase/browser-client"
import { ensureAuthReady } from "./supabase/ensure-auth"

// Local shapes to avoid circular imports; must match your domain types in src/app.tsx.
type ClothingItemShape = {
  id: string
  name: string
  notes?: string
  photoUrl?: string | null
  photoUrls?: string[]
  createdAt: string
  // AI-analyzed fields from images
  description?: string
  category?: string
  subcategory?: string
  colors?: string[]
  primaryColor?: string
  pattern?: string
  material?: string[]
  season?: string[]
  formality?: string
  styleTags?: string[]
  brand?: string
  fit?: string
  aiAttributes?: Record<string, any>
  aiAnalysisVersion?: number
  analyzedAt?: string
  // User-managed fields
  size?: string
  favorite?: boolean
  archived?: boolean
  userMetadata?: Record<string, any>
}

type OutfitShape = {
  id: string
  itemIds: string[]
  rationale: string
  createdAt: string
  // New fields
  request?: string
  occasion?: string
  weather?: string
  temperatureRange?: [number, number]
  stylePreferences?: string[]
  excludedCategories?: string[]
  score?: number
  aiModel?: string
  generationTimeMs?: number
  worn?: boolean
  wornDate?: string
  rating?: number
  notes?: string
  title?: string
}

// Table row mappings (snake_case)
type ClothingItemRow = {
  id: string
  name: string
  notes: string | null
  photo_url: string | null
  photo_urls?: string[] | null  // New column for multiple photos
  created_at: string
  user_id?: string
  // AI-analyzed fields
  description?: string | null
  category?: string | null
  subcategory?: string | null
  colors?: string[] | null
  primary_color?: string | null
  pattern?: string | null
  material?: string[] | null
  season?: string[] | null
  formality?: string | null
  style_tags?: string[] | null
  brand?: string | null
  fit?: string | null
  ai_attributes?: any | null
  ai_analysis_version?: number | null
  analyzed_at?: string | null
  // User-managed fields
  size?: string | null
  favorite?: boolean | null
  archived?: boolean | null
  user_metadata?: any | null
}

type OutfitRow = {
  id: string
  item_ids: string[]
  rationale: string
  created_at: string
  user_id?: string
  // New fields
  request?: string | null
  occasion?: string | null
  weather?: string | null
  temperature_range?: any | null
  style_preferences?: string[] | null
  excluded_categories?: string[] | null
  score?: number | null
  ai_model?: string | null
  generation_time_ms?: number | null
  worn?: boolean | null
  worn_date?: string | null
  rating?: number | null
  notes?: string | null
  title?: string | null
}

function fromItemRow(r: ClothingItemRow): ClothingItemShape {
  return {
    id: r.id,
    name: r.name,
    notes: r.notes ?? undefined,
    photoUrl: r.photo_url ?? (r.photo_urls?.[0] || null),  // Use first photo as default
    photoUrls: r.photo_urls ?? undefined,
    createdAt: r.created_at,
    // AI-analyzed fields
    description: r.description ?? undefined,
    category: r.category ?? undefined,
    subcategory: r.subcategory ?? undefined,
    colors: r.colors ?? undefined,
    primaryColor: r.primary_color ?? undefined,
    pattern: r.pattern ?? undefined,
    material: r.material ?? undefined,
    season: r.season ?? undefined,
    formality: r.formality ?? undefined,
    styleTags: r.style_tags ?? undefined,
    brand: r.brand ?? undefined,
    fit: r.fit ?? undefined,
    aiAttributes: r.ai_attributes ?? undefined,
    aiAnalysisVersion: r.ai_analysis_version ?? undefined,
    analyzedAt: r.analyzed_at ?? undefined,
    // User-managed fields
    size: r.size ?? undefined,
    favorite: r.favorite ?? undefined,
    archived: r.archived ?? undefined,
    userMetadata: r.user_metadata ?? undefined,
  }
}

function fromOutfitRow(r: OutfitRow): OutfitShape {
  return {
    id: r.id,
    itemIds: r.item_ids,
    rationale: r.rationale,
    createdAt: r.created_at,
    // Extended fields
    request: r.request ?? undefined,
    occasion: r.occasion ?? undefined,
    weather: r.weather ?? undefined,
    temperatureRange: r.temperature_range ? JSON.parse(r.temperature_range) : undefined,
    stylePreferences: r.style_preferences ?? undefined,
    excludedCategories: r.excluded_categories ?? undefined,
    score: r.score ?? undefined,
    aiModel: r.ai_model ?? undefined,
    generationTimeMs: r.generation_time_ms ?? undefined,
    worn: r.worn ?? undefined,
    wornDate: r.worn_date ?? undefined,
    rating: r.rating ?? undefined,
    notes: r.notes ?? undefined,
    title: r.title ?? undefined,
  }
}

function toItemRow(i: ClothingItemShape): ClothingItemRow {
  return {
    id: i.id,
    name: i.name,
    notes: i.notes ?? null,
    photo_url: i.photoUrl ?? null,
    photo_urls: i.photoUrls ?? null,
    created_at: i.createdAt,
    // AI-analyzed fields
    description: i.description ?? null,
    category: i.category ?? null,
    subcategory: i.subcategory ?? null,
    colors: i.colors ?? null,
    primary_color: i.primaryColor ?? null,
    pattern: i.pattern ?? null,
    material: i.material ?? null,
    season: i.season ?? null,
    formality: i.formality ?? null,
    style_tags: i.styleTags ?? null,
    brand: i.brand ?? null,
    fit: i.fit ?? null,
    ai_attributes: i.aiAttributes ?? null,
    ai_analysis_version: i.aiAnalysisVersion ?? null,
    analyzed_at: i.analyzedAt ?? null,
    // User-managed fields
    size: i.size ?? null,
    favorite: i.favorite ?? null,
    archived: i.archived ?? null,
    user_metadata: i.userMetadata ?? null,
  }
}

function toOutfitRow(o: OutfitShape): OutfitRow {
  return {
    id: o.id,
    item_ids: o.itemIds,
    rationale: o.rationale,
    created_at: o.createdAt,
    // New fields
    request: o.request ?? null,
    occasion: o.occasion ?? null,
    weather: o.weather ?? null,
    temperature_range: o.temperatureRange ? `[${o.temperatureRange[0]},${o.temperatureRange[1]})` : null,
    style_preferences: o.stylePreferences ?? null,
    excluded_categories: o.excludedCategories ?? null,
    score: o.score ?? null,
    ai_model: o.aiModel ?? null,
    generation_time_ms: o.generationTimeMs ?? null,
    worn: o.worn ?? null,
    worn_date: o.wornDate ?? null,
    rating: o.rating ?? null,
    notes: o.notes ?? null,
    title: o.title ?? null,
  }
}

// Keep per-table disable flags so a missing table doesn't disable everything
let itemsTableDisabled = false
let outfitsTableDisabled = false

function isMissingTableError(err: unknown): boolean {
  const anyErr = err as any
  const msg = (anyErr?.message || "").toString().toLowerCase()
  const code = (anyErr?.code || "").toString().toUpperCase()
  return msg.includes("could not find the table") || msg.includes("schema cache") || code === "42P01"
}

// Fetch latest outfits from Supabase (if env present). Returns [] on any failure.
export async function fetchOutfitsFromSupabase(): Promise<OutfitShape[]> {
  const sb = getSupabase()
  if (!sb || outfitsTableDisabled) return []

  try {
    console.log("[Fetch] Getting outfits from Supabase...")
    const { data, error } = await sb
      .from("outfits")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(50)

    console.log("[Fetch] Raw outfits fetch result:", { data, error, outfitCount: data?.length })

    if (error) {
      if (isMissingTableError(error)) {
        outfitsTableDisabled = true
        console.info("Supabase disabled: outfits table not found. Using local data.")
        return []
      }
      console.info("Supabase outfits select failed. Using local data.", error)
      return []
    }

    const outfits = (data as OutfitRow[]).map(fromOutfitRow)
    console.log("[Fetch] Mapped outfits:", outfits.map(o => ({ id: o.id, request: o.request })))
    return outfits
  } catch (e) {
    if (isMissingTableError(e)) {
      outfitsTableDisabled = true
      console.info("Supabase disabled: outfits table not found. Using local data.")
      return []
    }
    console.info("Supabase outfits fetch threw; using local data.", e)
    return []
  }
}

// Fetch latest items from Supabase (if env present). Returns [] on any failure.
export async function fetchItemsFromSupabase(): Promise<ClothingItemShape[]> {
  const sb = getSupabase()
  if (!sb || itemsTableDisabled) return []

  try {
    console.log("[Fetch] Getting items from Supabase...")
    const { data, error } = await sb
      .from("clothing_items")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(200)

    console.log("[Fetch] Raw fetch result:", { data, error, itemCount: data?.length })
    
    // Debug: Check first item's category data
    if (data && data.length > 0) {
      console.log("[Fetch] Sample item categories:", data.slice(0, 3).map(item => ({ 
        id: item.id, 
        name: item.name, 
        category: item.category 
      })))
    }

    if (error) {
      if (isMissingTableError(error)) {
        itemsTableDisabled = true
        console.info("Supabase disabled: clothing_items table not found. Using local data.")
        return []
      }
      console.info("Supabase select failed. Using local data.", error)
      return []
    }

    const items = (data as ClothingItemRow[]).map(fromItemRow)
    console.log("[Fetch] Mapped items:", items.map(i => ({ id: i.id, name: i.name })))
    return items
  } catch (e) {
    if (isMissingTableError(e)) {
      itemsTableDisabled = true
      console.info("Supabase disabled: clothing_items table not found. Using local data.")
      return []
    }
    console.info("Supabase fetch threw; using local data.", e)
    return []
  }
}

// Insert item into Supabase (no-throw; logs errors). Safe to call without env.
export async function insertItemToSupabase(item: ClothingItemShape): Promise<void> {
  const sb = getSupabase()
  if (!sb || itemsTableDisabled) return
  
  console.log("[Insert] Starting item insert:", { id: item.id, name: item.name })
  
  await ensureAuthReady(sb)
  
  let userId: string | null = null
  try {
    // Use persistent session cache for better reliability
    const session = await getCurrentSession()
    userId = session?.user?.id ?? null
    
    console.log("[Insert] Session check:", { 
      hasSession: Boolean(session), 
      userId,
      tokenExists: Boolean(session?.access_token),
      tokenLength: session?.access_token?.length
    })
    
    if (!userId) {
      console.log("[Insert] No session found, trying getUser fallback")
      const { data } = await sb.auth.getUser()
      userId = data.user?.id ?? null
    }
  } catch (e) {
    console.log("[Insert] Auth error:", e)
  }
  
  if (!userId) {
    console.log("[Insert] No user ID available, skipping insert")
    return
  }
  
  const row: ClothingItemRow = { ...toItemRow(item), user_id: userId }
  
  console.log("[Insert] Inserting item with userId:", userId)
  console.log("[Insert] Item data:", {
    name: row.name,
    photoUrl: row.photo_url,
    photoUrls: row.photo_urls,
    photoUrlsCount: row.photo_urls?.length
  })
  
  const { error } = await sb.from("clothing_items").insert([row])
  if (error) {
    if (isMissingTableError(error)) {
      itemsTableDisabled = true
      console.info("Supabase disabled: clothing_items table not found. Inserts skipped.")
      return
    }
    console.info("Supabase insert item error (non-fatal):", error)
  } else {
    console.log("[Insert] Item inserted successfully")
    // Small delay to allow database to settle
    await new Promise(resolve => setTimeout(resolve, 100))
  }
}

// Insert outfit into Supabase (no-throw; logs errors). Safe to call without env.
export async function insertOutfitToSupabase(outfit: OutfitShape): Promise<void> {
  const sb = getSupabase()
  if (!sb || outfitsTableDisabled) return
  
  console.log("[Insert] Starting outfit insert:", { id: outfit.id, itemCount: outfit.itemIds.length })
  
  await ensureAuthReady(sb)
  
  let userId: string | null = null
  try {
    // Use persistent session cache for better reliability
    const session = await getCurrentSession()
    userId = session?.user?.id ?? null
    
    console.log("[Insert] Outfit session check:", { 
      hasSession: Boolean(session), 
      userId,
      tokenExists: Boolean(session?.access_token)
    })
    
    if (!userId) {
      console.log("[Insert] No session found, trying getUser fallback")
      const { data } = await sb.auth.getUser()
      userId = data.user?.id ?? null
    }
  } catch (e) {
    console.log("[Insert] Auth error:", e)
  }
  
  if (!userId) {
    console.log("[Insert] No user ID available, skipping outfit insert")
    return
  }
  
  const row: OutfitRow = { ...toOutfitRow(outfit), user_id: userId }
  
  console.log("[Insert] Inserting outfit with userId:", userId)
  
  const { error } = await sb.from("outfits").insert([row])
  if (error) {
    if (isMissingTableError(error)) {
      outfitsTableDisabled = true
      console.info("Supabase disabled: outfits table not found. Inserts skipped.")
      return
    }
    console.info("Supabase insert outfit error (non-fatal):", error)
  } else {
    console.log("[Insert] Outfit inserted successfully")
  }
}

// Delete outfit from Supabase. Safe to call without env.
export async function deleteOutfitFromSupabase(id: string): Promise<boolean> {
  const sb = getSupabase()
  if (!sb || outfitsTableDisabled) return false
  
  console.log("[Delete] Starting delete for outfit:", id)
  
  // Get user ID from session
  try {
    const session = await getCurrentSession()
    const userId = session?.user?.id
    
    if (!userId) {
      console.log("[Delete] No user session found")
      return false
    }
    
    console.log("[Delete] Executing outfit delete for user:", userId)
    
    const { error } = await sb.from("outfits").delete().eq("id", id).eq("user_id", userId)
    
    if (error) {
      console.log("[Delete] Outfit delete error:", error)
      return false
    }
    
    console.log("[Delete] Outfit deleted successfully")
    return true
  } catch (e) {
    console.log("[Delete] Outfit delete operation failed:", e)
    return false
  }
}

// Delete item (and best-effort delete its photos) from Supabase. Safe to call without env.
export async function deleteItemFromSupabase(id: string, photoPath?: string | null, photoUrls?: string[]): Promise<boolean> {
  const sb = getSupabase()
  if (!sb || itemsTableDisabled) return false
  
  console.log("[Delete] Starting delete for item:", id)
  
  // Get user ID from session
  try {
    const session = await getCurrentSession()
    const userId = session?.user?.id
    
    if (!userId) {
      console.log("[Delete] No user session found")
      return false
    }
    
    console.log("[Delete] Executing delete for user:", userId)
    
    // Simple delete with built-in timeout from global fetch config
    const { error } = await sb.from("clothing_items").delete().eq("id", id).eq("user_id", userId)
    
    if (error) {
      console.log("[Delete] Delete error:", error)
      return false
    }
    
    console.log("[Delete] Item deleted successfully")
  
    // Best-effort storage cleanup for all photos
    const photosToDelete: string[] = []
    
    // Add single photo if exists
    if (photoPath && !photoPath.startsWith('http') && photoPath.includes(userId)) {
      photosToDelete.push(photoPath)
    }
    
    // Add multiple photos if exist
    if (photoUrls && photoUrls.length > 0) {
      photoUrls.forEach(url => {
        if (url && !url.startsWith('http') && url.includes(userId)) {
          photosToDelete.push(url)
        }
      })
    }
    
    // Delete all photos in one batch
    if (photosToDelete.length > 0) {
      await sb.storage.from("item-photos").remove(photosToDelete).catch(() => {})
    }
    
    return true
  } catch (e) {
    console.log("[Delete] Delete operation failed:", e)
    return false
  }
}
