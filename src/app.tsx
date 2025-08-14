"use client"

import { useEffect, useMemo, useState } from "react"
import { getSupabaseBrowser } from "./lib/supabase/browser-client"
import PrimaryButton from "./components/primary-button"
import TextInput from "./components/text-input"
import ItemCard from "./components/item-card"
import ItemForm from "./components/item-form"
import OutfitCard from "./components/outfit-card"
import Toast from "./components/toast"
import { fetchItemsFromSupabase, insertItemToSupabase, insertOutfitToSupabase, deleteItemFromSupabase } from "./lib/supabase-data"
import { ClosetGrid, ClosetItemModal } from "./components/closet-grid"

export type ClothingItem = {
  id: string
  name: string
  notes?: string
  photoUrl?: string | null
  createdAt: string
}

export type Outfit = {
  id: string
  itemIds: string[]
  rationale: string
  createdAt: string
}

type Screen = "home" | "add" | "generate"

function uid() {
  return Math.random().toString(36).slice(2) + Date.now().toString(36)
}

function formatFriendlyDate(iso: string) {
  const d = new Date(iso)
  const now = new Date()
  const diffMs = now.getTime() - d.getTime()
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24))
  if (diffDays === 0) return "Today"
  if (diffDays === 1) return "Yesterday"
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" })
}

function shuffle<T>(arr: T[]) {
  const a = [...arr]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

function generateOutfits(items: ClothingItem[], requestText: string, pieceCount: number): Outfit[] {
  // TODO: wire this to a backend /api/generate-outfit using an OpenAI Agent later
  if (items.length === 0) return []
  const pool = shuffle(items)
  const firstSet = pool.slice(0, Math.min(pieceCount, pool.length))
  const secondStart = Math.min(pieceCount, pool.length)
  const secondSet = pool.slice(secondStart, Math.min(secondStart + pieceCount, pool.length))

  const makeRationale = (setIndex: number) => {
    const tone = setIndex === 0 ? "Clean casual" : "Versatile layered"
    const ref = requestText?.trim() ? ` for ${requestText.trim()}` : ""
    return `${tone} look${ref}. Kept pieces cohesive and easy to wear.`
  }

  const now = new Date().toISOString()
  const o1: Outfit = {
    id: uid(),
    itemIds: firstSet.map((i) => i.id),
    rationale: makeRationale(0),
    createdAt: now,
  }
  const o2: Outfit = {
    id: uid(),
    itemIds: (secondSet.length > 0 ? secondSet : firstSet).map((i) => i.id),
    rationale: makeRationale(1),
    createdAt: now,
  }
  return [o1, o2]
}

export default function App() {
  const [screen, setScreen] = useState<Screen>("home")
  const [items, setItems] = useState<ClothingItem[]>(() => {
    const now = new Date().toISOString()
    // Seed closet with demo items (no photos so placeholders render)
    return [
      { id: uid(), name: "White Tee", notes: "Crew neck", photoUrl: null, createdAt: now },
      { id: uid(), name: "Blue Jeans", photoUrl: null, createdAt: now },
      { id: uid(), name: "Black Sneakers", photoUrl: null, createdAt: now },
      { id: uid(), name: "Denim Jacket", notes: "Light wash", photoUrl: null, createdAt: now },
    ]
  })
  const [outfits, setOutfits] = useState<Outfit[]>([])
  const [toast, setToast] = useState<{ message: string; open: boolean }>({ message: "", open: false })
  const [selectedItem, setSelectedItem] = useState<ClothingItem | null>(null)

  useEffect(() => {
    ;(async () => {
      try {
        const remote = await fetchItemsFromSupabase()
        if (remote && remote.length > 0) {
          setItems(remote)
        }
      } catch {
        // Silent fallback to local seed
      }
    })()
  }, [])

  // Re-fetch after auth state changes so RLS-backed data appears post-login
  useEffect(() => {
    const sb = getSupabaseBrowser()
    if (!sb) return
    const { data: sub } = sb.auth.onAuthStateChange(async (event) => {
      console.log("[App] Auth state change:", event)
      // Temporarily disable auto-fetch to test if it's causing connection issues
      // TODO: Re-enable once delete issue is resolved
      /*
      if (event === 'SIGNED_IN' || event === 'SIGNED_OUT') {
        console.log("[App] Significant auth change, re-fetching items...")
        try {
          const remote = await fetchItemsFromSupabase()
          if (remote && remote.length > 0) {
            setItems(remote)
          }
        } catch {}
      }
      */
    })
    return () => {
      sub?.subscription.unsubscribe()
    }
  }, [])

  const handleAddItem = (item: ClothingItem) => {
    // TODO: wire to Supabase insert
    setItems((prev) => [item, ...prev])
    setScreen("home")
    insertItemToSupabase(item).catch(() => {})
  }

  const handleGenerate = (requestText: string): Outfit[] => {
    return generateOutfits(items, requestText, 3)
  }

  const handleSaveOutfit = (outfit: Outfit) => {
    // TODO: wire to Supabase insert later
    setOutfits((prev) => [outfit, ...prev])
    setToast({ message: "Outfit saved.", open: true })
    insertOutfitToSupabase(outfit).catch(() => {})
  }

  const recentItems = useMemo(() => items.slice(0, 50), [items])

  return (
    <div className="min-h-dvh bg-white">
      <main className="mx-auto max-w-md lg:max-w-2xl px-4 py-4">
        {screen === "home" && (
          <section className="space-y-6">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <PrimaryButton onClick={() => setScreen("add")}>Add Item</PrimaryButton>
              <PrimaryButton onClick={() => setScreen("generate")} variant="primary">
                Generate Outfit
              </PrimaryButton>
            </div>

            <div className="space-y-3">
              <h2 className="text-sm font-medium text-neutral-700">Recent items</h2>
              {recentItems.length === 0 ? (
                <div className="flex items-center gap-3 p-6 border rounded-2xl bg-neutral-50">
                  <div className="h-12 w-12 rounded-xl border flex items-center justify-center text-xl" aria-hidden>
                    {"👕"}
                  </div>
                  <div className="text-neutral-600">No items yet—add your first piece.</div>
                </div>
              ) : (
                <ul className="space-y-3">
                  {recentItems.map((item) => (
                    <li key={item.id}>
                      <ItemCard item={item} friendlyDate={formatFriendlyDate(item.createdAt)} />
                    </li>
                  ))}
                </ul>
              )}
            </div>

            {/* Closet grid */}
            <ClosetGrid
              items={items}
              onSelect={(it) => setSelectedItem(it)}
              onRemove={(it) => {
                console.log("[Delete] Grid onRemove START:", { id: it.id, name: it.name, timestamp: new Date().toISOString() })
                deleteItemFromSupabase(it.id, it.photoUrl ?? null)
                  .then((ok) => {
                    console.log("[Delete] Grid onRemove: deleteItemFromSupabase returned:", ok)
                    if (ok) {
                      console.log("[Delete] Grid onRemove: removing from local state")
                      setItems((prev) => prev.filter((p) => p.id !== it.id))
                    }
                    setToast({ message: ok ? "Item removed." : "Failed to remove item.", open: true })
                    console.log("[Delete] Grid onRemove COMPLETE:", { success: ok })
                  })
                  .catch((error) => {
                    console.log("[Delete] Grid onRemove ERROR:", error)
                    setToast({ message: "Failed to remove item.", open: true })
                  })
              }}
            />
          </section>
        )}

        {screen === "add" && (
          <section className="space-y-4">
            <ItemForm
              onSave={(draft) => {
                const now = new Date().toISOString()
                const item: ClothingItem = {
                  id: uid(),
                  name: draft.name,
                  notes: draft.notes,
                  photoUrl: draft.photoUrl ?? null,
                  createdAt: now,
                }
                handleAddItem(item)
              }}
              onCancel={() => setScreen("home")}
            />
          </section>
        )}

        {screen === "generate" && (
          <GenerateScreen
            items={items}
            onBack={() => setScreen("home")}
            onGenerate={handleGenerate}
            onSaveOutfit={handleSaveOutfit}
          />
        )}
      </main>

      <Toast open={toast.open} message={toast.message} onOpenChange={(open) => setToast((t) => ({ ...t, open }))} />
      <ClosetItemModal
        item={selectedItem}
        onClose={() => setSelectedItem(null)}
        onRemove={(it) => {
          console.log("[Delete] Modal onRemove START:", { id: it.id, name: it.name, timestamp: new Date().toISOString() })
          deleteItemFromSupabase(it.id, it.photoUrl ?? null)
            .then((ok) => {
              console.log("[Delete] Modal onRemove: deleteItemFromSupabase returned:", ok)
              setSelectedItem(null)
              if (ok) {
                console.log("[Delete] Modal onRemove: removing from local state")
                setItems((prev) => prev.filter((p) => p.id !== it.id))
              }
              setToast({ message: ok ? "Item removed." : "Failed to remove item.", open: true })
              console.log("[Delete] Modal onRemove COMPLETE:", { success: ok })
            })
            .catch((error) => {
              console.log("[Delete] Modal onRemove ERROR:", error)
              setToast({ message: "Failed to remove item.", open: true })
            })
        }}
      />
    </div>
  )
}

function GenerateScreen({
  items,
  onBack,
  onGenerate,
  onSaveOutfit,
}: {
  items: ClothingItem[]
  onBack: () => void
  onGenerate: (requestText: string) => Outfit[]
  onSaveOutfit: (outfit: Outfit) => void
}) {
  const [request, setRequest] = useState("")
  const [results, setResults] = useState<Outfit[]>([])

  const canGenerate = items.length >= 2

  const handleGenerateClick = () => {
    const res = onGenerate(request)
    setResults(res)
  }

  return (
    <section className="space-y-6">
      <div className="grid grid-cols-1 gap-4">
        <TextInput
          id="req"
          label="What do you need an outfit for?"
          placeholder="e.g., Summer picnic, date night, office..."
          value={request}
          onChange={(e) => setRequest(e.target.value)}
        />
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <PrimaryButton onClick={handleGenerateClick} disabled={!canGenerate}>
            Generate
          </PrimaryButton>
          <PrimaryButton variant="ghost" onClick={onBack}>
            Back
          </PrimaryButton>
        </div>
      </div>

      {!canGenerate && (
        <div className="p-4 border rounded-2xl bg-neutral-50 text-neutral-700">Add a few items first.</div>
      )}

      <div className="space-y-3">
        {results.length > 0 && <h2 className="text-sm font-medium text-neutral-700">Results</h2>}
        {results.map((o) => {
          const chosen = o.itemIds.map((id) => items.find((it) => it.id === id)).filter(Boolean) as ClothingItem[]
          return (
            <OutfitCard
              key={o.id}
              items={chosen}
              rationale={o.rationale}
              onSave={() => {
                const outfit: Outfit = {
                  id: uid(),
                  itemIds: chosen.map((c) => c.id),
                  rationale: o.rationale,
                  createdAt: new Date().toISOString(),
                }
                onSaveOutfit(outfit)
              }}
            />
          )
        })}
      </div>
    </section>
  )
}
