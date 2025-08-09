"use client"

import { useMemo, useState } from "react"
import Header from "./components/header"
import PrimaryButton from "./components/primary-button"
import TextInput from "./components/text-input"
import Select from "./components/select"
import ItemCard from "./components/item-card"
import ItemForm from "./components/item-form"
import OutfitCard from "./components/outfit-card"
import Toast from "./components/toast"

export type ClothingItem = {
  id: string
  name: string
  category: "top" | "bottom" | "dress" | "shoes" | "outerwear" | "accessory"
  color: string
  season: "all" | "spring" | "summer" | "fall" | "winter"
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
    const seasonHints = setIndex === 0 ? "breathable layers" : "textures and balance"
    const ref = requestText?.trim() ? ` for ${requestText.trim()}` : ""
    return `${tone} look${ref}. Focus on ${seasonHints} with cohesive tones.`
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
    // Seed closet with 4 demo items (no photos so placeholders render)
    return [
      {
        id: uid(),
        name: "White Tee",
        category: "top",
        color: "white",
        season: "all",
        notes: "Crew neck",
        photoUrl: null,
        createdAt: now,
      },
      {
        id: uid(),
        name: "Blue Jeans",
        category: "bottom",
        color: "blue",
        season: "all",
        photoUrl: null,
        createdAt: now,
      },
      {
        id: uid(),
        name: "Black Sneakers",
        category: "shoes",
        color: "black",
        season: "all",
        photoUrl: null,
        createdAt: now,
      },
      {
        id: uid(),
        name: "Denim Jacket",
        category: "outerwear",
        color: "denim",
        season: "spring",
        photoUrl: null,
        createdAt: now,
      },
    ]
  })
  const [outfits, setOutfits] = useState<Outfit[]>([])
  const [toast, setToast] = useState<{ message: string; open: boolean }>({ message: "", open: false })

  const handleAddItem = (item: ClothingItem) => {
    // TODO: wire to Supabase insert
    setItems((prev) => [item, ...prev])
    setScreen("home")
  }

  const handleGenerate = (requestText: string, pieceCount: number): Outfit[] => {
    return generateOutfits(items, requestText, pieceCount)
  }

  const handleSaveOutfit = (outfit: Outfit) => {
    // TODO: wire to Supabase insert later
    setOutfits((prev) => [outfit, ...prev])
    setToast({ message: "Outfit saved.", open: true })
  }

  const recentItems = useMemo(() => items.slice(0, 50), [items])

  return (
    <div className="min-h-dvh bg-white">
      <header className="border-b bg-white sticky top-0 z-10">
        <div className="mx-auto max-w-md lg:max-w-2xl px-4">
          <Header title="Outfit Generator" subtitle="Build your closet and spin up looks" />
        </div>
      </header>

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

            <p className="text-xs text-neutral-500">
              {/* TODO: wire to Supabase select later */}
              All data is local for now; will sync to Supabase later.
            </p>
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
                  category: draft.category,
                  color: draft.color,
                  season: draft.season,
                  notes: draft.notes,
                  photoUrl: draft.photoUrl ?? null,
                  createdAt: now,
                }
                handleAddItem(item)
              }}
              onCancel={() => setScreen("home")}
            />
            <div className="grid grid-cols-2 gap-3">
              <PrimaryButton variant="ghost" onClick={() => setScreen("home")}>
                Cancel
              </PrimaryButton>
              <div />
            </div>
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
  onGenerate: (requestText: string, pieceCount: number) => Outfit[]
  onSaveOutfit: (outfit: Outfit) => void
}) {
  const [request, setRequest] = useState("")
  const [count, setCount] = useState<number>(3)
  const [results, setResults] = useState<Outfit[]>([])

  const canGenerate = items.length >= 2

  const handleGenerateClick = () => {
    const res = onGenerate(request, count)
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
        <Select
          id="pieces"
          label="How many pieces?"
          value={String(count)}
          onChange={(e) => setCount(Number(e.target.value))}
          options={[
            { value: "2", label: "2" },
            { value: "3", label: "3" },
            { value: "4", label: "4" },
            { value: "5", label: "5" },
          ]}
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
