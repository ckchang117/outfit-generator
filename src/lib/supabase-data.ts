import { getSupabase } from "./supabase-client"

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

let supabaseDisabled = false

function isMissingTableError(err: unknown): boolean {
  const anyErr = err as any
  const msg = (anyErr?.message || "").toString().toLowerCase()
  const code = (anyErr?.code || "").toString().toUpperCase()
  return msg.includes("could not find the table") || msg.includes("schema cache") || code === "42P01"
}

// Fetch latest items from Supabase (if env present). Returns [] on any failure.
export async function fetchItemsFromSupabase(): Promise<ClothingItemShape[]> {
  const sb = getSupabase()
  if (!sb || supabaseDisabled) return []

  try {
    const { data, error } = await sb
      .from("clothing_items")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(200)

    if (error) {
      if (isMissingTableError(error)) {
        supabaseDisabled = true
        console.info("Supabase disabled: clothing_items table not found. Using local data.")
        return []
      }
      console.info("Supabase select failed. Using local data.", error)
      return []
    }

    return (data as ClothingItemRow[]).map(fromItemRow)
  } catch (e) {
    if (isMissingTableError(e)) {
      supabaseDisabled = true
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
  if (!sb || supabaseDisabled) return
  const { error } = await sb.from("clothing_items").insert([toItemRow(item)])
  if (error) {
    if (isMissingTableError(error)) {
      supabaseDisabled = true
      console.info("Supabase disabled: clothing_items table not found. Inserts skipped.")
      return
    }
    console.info("Supabase insert item error (non-fatal):", error)
  }
}

// Insert outfit into Supabase (no-throw; logs errors). Safe to call without env.
export async function insertOutfitToSupabase(outfit: OutfitShape): Promise<void> {
  const sb = getSupabase()
  if (!sb || supabaseDisabled) return
  const { error } = await sb.from("outfits").insert([toOutfitRow(outfit)])
  if (error) {
    if (isMissingTableError(error)) {
      supabaseDisabled = true
      console.info("Supabase disabled: outfits table not found. Inserts skipped.")
      return
    }
    console.info("Supabase insert outfit error (non-fatal):", error)
  }
}

/*
Schema notes (create these in your Supabase project):

create table public.clothing_items (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  notes text,
  photo_url text,
  created_at timestamptz not null default now()
);

create table public.outfits (
  id uuid primary key default gen_random_uuid(),
  item_ids jsonb not null, -- or text[]
  rationale text not null,
  created_at timestamptz not null default now()
);
*/
