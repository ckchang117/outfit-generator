import { getSupabaseBrowser as getSupabase, getCurrentSession } from "./supabase/browser-client"
import { ensureAuthReady } from "./supabase/ensure-auth"

// Local shapes to avoid circular imports; must match your domain types in src/app.tsx.
type ClothingItemShape = {
  id: string
  name: string
  notes?: string
  photoUrl?: string | null
  createdAt: string
}

type OutfitShape = {
  id: string
  itemIds: string[]
  rationale: string
  createdAt: string
}

// Table row mappings (snake_case)
type ClothingItemRow = {
  id: string
  name: string
  notes: string | null
  photo_url: string | null
  created_at: string
  user_id?: string
}

type OutfitRow = {
  id: string
  item_ids: string[]
  rationale: string
  created_at: string
}

function fromItemRow(r: ClothingItemRow): ClothingItemShape {
  return {
    id: r.id,
    name: r.name,
    notes: r.notes ?? undefined,
    photoUrl: r.photo_url ?? null,
    createdAt: r.created_at,
  }
}

function toItemRow(i: ClothingItemShape): ClothingItemRow {
  return {
    id: i.id,
    name: i.name,
    notes: i.notes ?? null,
    photo_url: i.photoUrl ?? null,
    created_at: i.createdAt,
  }
}

function toOutfitRow(o: OutfitShape): OutfitRow {
  return {
    id: o.id,
    item_ids: o.itemIds,
    rationale: o.rationale,
    created_at: o.createdAt,
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
  await ensureAuthReady(sb)
  const { error } = await sb.from("outfits").insert([toOutfitRow(outfit)])
  if (error) {
    if (isMissingTableError(error)) {
      outfitsTableDisabled = true
      console.info("Supabase disabled: outfits table not found. Inserts skipped.")
      return
    }
    console.info("Supabase insert outfit error (non-fatal):", error)
  }
}

// Track concurrent operations and prevent duplicates
let activeOperations = 0
const activeDeleteOperations = new Map<string, Promise<boolean>>()

// Delete item (and best-effort delete its photo) from Supabase. Safe to call without env.
export async function deleteItemFromSupabase(id: string, photoPath?: string | null): Promise<boolean> {
  const sb = getSupabase()
  if (!sb || itemsTableDisabled) return false
  
  // Prevent duplicate delete operations for the same item - return existing promise if already running
  if (activeDeleteOperations.has(id)) {
    console.log("[Delete] Delete already in progress for item, returning existing promise:", id)
    return activeDeleteOperations.get(id)!
  }
  
  // Create the delete operation promise and store it immediately
  const deletePromise = performDelete(id, photoPath, sb)
  activeDeleteOperations.set(id, deletePromise)
  
  try {
    const result = await deletePromise
    return result
  } finally {
    // Clean up the promise from active operations when done
    activeDeleteOperations.delete(id)
  }
}

// Internal function that performs the actual delete
async function performDelete(id: string, photoPath: string | null | undefined, sb: any): Promise<boolean> {
  activeOperations++
  const operationId = `del-${Date.now()}-${Math.random().toString(36).slice(2)}`
  
  console.log("[Delete] Starting item delete:", { 
    id, 
    photoPath, 
    operationId,
    activeOperations,
    activeDeletions: Array.from(activeDeleteOperations.keys()),
    timestamp: new Date().toISOString()
  })
  
  // Try with a fresh client instance to avoid connection state issues
  console.log("[Delete] Creating fresh client for delete operation...")
  const freshClient = getSupabase()
  if (!freshClient) {
    console.log("[Delete] Failed to get fresh client")
    activeOperations--
    return false
  }
  
  console.log("[Delete] Ensuring auth is ready...")
  await ensureAuthReady(freshClient)
  
  // Ensure we have a user to satisfy RLS using persistent session cache
  let userId: string | null = null
  let session = null
  try {
    session = await getCurrentSession()
    userId = session?.user?.id ?? null
    
    console.log("[Delete] Session check:", { 
      hasSession: Boolean(session), 
      userId,
      tokenExists: Boolean(session?.access_token),
      tokenLength: session?.access_token?.length
    })
    
    // Only refresh session if the token seems expired (simple heuristic)
    // Skip refresh if we have a valid token to avoid unnecessary delays
    if (session && session.access_token) {
      console.log("[Delete] Using existing session with valid token")
      // Optional: Only refresh if token is close to expiring
      // For now, skip refresh entirely to avoid delays
    }
    
    if (!userId) {
      console.log("[Delete] No session found, trying getUser fallback")
      const { data } = await sb.auth.getUser()
      userId = data.user?.id ?? null
    }
  } catch (e) {
    console.log("[Delete] Auth error:", e)
  }
  
  console.log("[Delete] supabase-data: preflight", { id, photoPath, itemsTableDisabled, hasClient: Boolean(sb), userId })
  
  if (!userId) {
    console.info("Delete aborted: no signed-in user")
    return false
  }
  
  try {
    console.log("[Delete] supabase-data: issuing delete with userId:", userId)
    console.log("[Delete] About to execute query: DELETE FROM clothing_items WHERE id =", id, "AND user_id =", userId)
    
    // Skip pre-check and go straight to delete with a reasonable timeout
    console.log("[Delete] Proceeding directly with delete operation using fresh client...")
    
    const deletePromise = freshClient.from("clothing_items").delete().eq("id", id).eq("user_id", userId)
    const timeoutPromise = new Promise((_, reject) => 
      setTimeout(() => reject(new Error("Delete operation timed out")), 8000)
    )
    
    const deleteResult = await Promise.race([deletePromise, timeoutPromise])
    console.log("[Delete] Raw delete result:", deleteResult)
    
    const { error, data, status, statusText } = deleteResult as any
    
    console.log("[Delete] Delete response details:", { 
      error, 
      data, 
      status, 
      statusText,
      hasError: Boolean(error)
    })
    
    if (error) {
      console.log("[Delete] Error details:", {
        message: error.message,
        code: error.code,
        details: error.details,
        hint: error.hint
      })
      
      if (isMissingTableError(error)) {
        itemsTableDisabled = true
        console.info("Supabase disabled: clothing_items table not found. Deletes skipped.")
        return false
      }
      console.info("Supabase delete item error (non-fatal):", error)
      return false
    } else {
      console.log("[Delete] Item deleted successfully from database")
    }
  } catch (e) {
    console.info("Supabase delete threw (non-fatal):", e)
    console.log("[Delete] Exception details:", e)
    
    // Check if it's a timeout
    if (e instanceof Error && e.message.includes("timed out")) {
      console.log("[Delete] Operation timed out - possible network or RLS issue")
    }
    
    activeOperations--
    return false
  }
  
  // Best-effort storage cleanup if path looks like a bucket key (not an absolute URL)
  try {
    if (photoPath && !/^https?:\/\//i.test(photoPath)) {
      // Only attempt if it belongs to the current user folder to satisfy common bucket policies
      if (photoPath.startsWith(`${userId}/`)) {
        console.log("[Delete] supabase-data: removing storage object", photoPath)
        const { error } = await freshClient.storage.from("item-photos").remove([photoPath])
        if (error) {
          console.info("Supabase storage remove error (non-fatal):", error)
        } else {
          console.log("[Delete] Storage object removed successfully")
        }
      } else {
        console.log("[Delete] Skipping storage removal - not user's file:", photoPath)
      }
    }
  } catch (e) {
    console.info("Supabase storage remove threw (non-fatal):", e)
  }
  
  console.log("[Delete] supabase-data: done", { operationId, activeOperations })
  activeOperations--
  return true
}
