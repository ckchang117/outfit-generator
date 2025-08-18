"use client"

import { useEffect, useMemo, useState } from "react"
import { getSupabaseBrowser } from "./lib/supabase/browser-client"
import PrimaryButton from "./components/primary-button"
import TextInput from "./components/text-input"
import ItemCard from "./components/item-card"
import ItemForm from "./components/item-form"
import EditItemForm from "./components/edit-item-form"
import OutfitCard from "./components/outfit-card"
import Toast from "./components/toast"
import { fetchItemsFromSupabase, insertItemToSupabase, insertOutfitToSupabase, deleteItemFromSupabase, fetchOutfitsFromSupabase, deleteOutfitFromSupabase } from "./lib/supabase-data"
import { ClosetGrid, ClosetItemModal } from "./components/closet-grid"
import { OutfitsGrid } from "./components/outfits-grid"
import { OutfitDetailModal } from "./components/outfit-detail-modal"

export type ClothingItem = {
  id: string
  name: string
  notes?: string
  photoUrl?: string | null  // Keep for backward compatibility, will use first photo
  photoUrls?: string[]      // New field for multiple photos
  createdAt: string
  // Add new AI fields
  description?: string
  category?: string
  subcategory?: string
  colors?: string[]
  primaryColor?: string
  formality?: string
  styleTags?: string[]
  archived?: boolean
  favorite?: boolean
}

export type Outfit = {
  id: string
  itemIds: string[]
  rationale: string
  createdAt: string
  // Generation metadata
  request?: string
  occasion?: string
  weather?: string
  score?: number
  aiModel?: string
  generationTimeMs?: number
  title?: string
}

type Screen = "home" | "add" | "generate" | "edit" | "outfits"

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
  const [items, setItems] = useState<ClothingItem[]>([])
  const [outfits, setOutfits] = useState<Outfit[]>([])
  const [toast, setToast] = useState<{ message: string; open: boolean }>({ message: "", open: false })
  const [selectedItem, setSelectedItem] = useState<ClothingItem | null>(null)
  const [editingItem, setEditingItem] = useState<ClothingItem | null>(null)
  const [selectedOutfit, setSelectedOutfit] = useState<Outfit | null>(null)

  useEffect(() => {
    ;(async () => {
      try {
        const [remoteItems, remoteOutfits] = await Promise.all([
          fetchItemsFromSupabase(),
          fetchOutfitsFromSupabase()
        ])
        if (remoteItems && remoteItems.length > 0) {
          setItems(remoteItems)
        }
        if (remoteOutfits && remoteOutfits.length > 0) {
          setOutfits(remoteOutfits)
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
    let isFirstLoad = true
    
    const { data: sub } = sb.auth.onAuthStateChange(async (event) => {
      console.log("[App] Auth state change:", event)
      
      // Only fetch on initial load or actual sign in/out
      if ((event === 'INITIAL_SESSION' && isFirstLoad) || 
          event === 'SIGNED_IN' || 
          event === 'SIGNED_OUT') {
        isFirstLoad = false
        
        // Add a small delay to avoid race conditions with other operations
        setTimeout(async () => {
          console.log("[App] Fetching data after auth change...")
          try {
            const [remoteItems, remoteOutfits] = await Promise.all([
              fetchItemsFromSupabase(),
              fetchOutfitsFromSupabase()
            ])
            if (remoteItems && remoteItems.length > 0) {
              setItems(remoteItems)
            }
            if (remoteOutfits && remoteOutfits.length > 0) {
              setOutfits(remoteOutfits)
            }
          } catch (e) {
            console.log("[App] Failed to fetch data:", e)
          }
        }, 500)
      }
    })
    
    return () => {
      sub?.subscription.unsubscribe()
    }
  }, [])

  const handleAddItem = async (item: ClothingItem) => {
    // TODO: wire to Supabase insert
    setItems((prev) => [item, ...prev])
    setScreen("home")
    
    // First, ensure item is saved
    try {
      await insertItemToSupabase(item)
      console.log("Item saved to Supabase:", item.id)
    } catch (error) {
      console.error("Failed to save item:", error)
      return
    }
    
    // Trigger AI analysis in background after a delay
    if (item.photoUrls && item.photoUrls.length > 0) {
      setTimeout(async () => {
        try {
          // Get current user ID
          const sb = getSupabaseBrowser()
          let userId = null
          if (sb) {
            const { data: { user } } = await sb.auth.getUser()
            userId = user?.id
          }
          
          if (!userId) {
            console.error("No user ID available for analysis")
            return
          }
          
          console.log("Triggering AI analysis for item:", item.id, "user:", userId)
          
          const response = await fetch("/api/analyze-item", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
            },
            credentials: "include",
            body: JSON.stringify({
              itemId: item.id,
              userId: userId,
            }),
          })
          
          if (!response.ok) {
            const error = await response.text()
            console.error("Analysis failed:", response.status, error)
          } else {
            console.log("AI analysis triggered successfully")
          }
        } catch (error) {
          console.error("Failed to analyze item:", error)
        }
      }, 3000) // 3 second delay after confirmed save
    }
  }

  const handleEditItem = async (updates: { name: string; notes?: string; photoUrls?: string[]; newFiles?: File[]; removedPhotos?: string[] }) => {
    if (!editingItem) return

    try {
      // Upload new files if any
      let newPhotoUrls: string[] = []
      if (updates.newFiles && updates.newFiles.length > 0) {
        const sb = getSupabaseBrowser()
        if (sb) {
          const { data: { user } } = await sb.auth.getUser()
          if (user) {
            for (const file of updates.newFiles) {
              const fileExt = file.name.split('.').pop()
              const fileName = `${Date.now()}-${Math.floor(Math.random() * 1000)}-${Math.random().toString(36).slice(2, 8)}.${fileExt}`
              const filePath = `${user.id}/${fileName}`
              
              const { data, error } = await sb.storage
                .from("item-photos")
                .upload(filePath, file)
              
              if (!error && data?.path) {
                newPhotoUrls.push(data.path)
              }
            }
          }
        }
      }

      // Clean up removed photos from storage
      if (updates.removedPhotos && updates.removedPhotos.length > 0) {
        const sb = getSupabaseBrowser()
        if (sb) {
          try {
            await sb.storage.from("item-photos").remove(updates.removedPhotos)
          } catch (error) {
            console.warn("Failed to clean up removed photos:", error)
          }
        }
      }

      // Combine existing and new photo URLs
      const finalPhotoUrls = [...(updates.photoUrls || []), ...newPhotoUrls]

      // Update the item
      const updatedItem: ClothingItem = {
        ...editingItem,
        name: updates.name,
        notes: updates.notes,
        photoUrls: finalPhotoUrls,
        photoUrl: finalPhotoUrls[0] || null, // Keep for backward compatibility
      }

      // Update local state
      setItems(prev => prev.map(item => 
        item.id === editingItem.id ? updatedItem : item
      ))
      setScreen("home")
      setEditingItem(null)

      // Update in database
      const sb = getSupabaseBrowser()
      if (sb) {
        const { data: { user } } = await sb.auth.getUser()
        if (user) {
          const { error } = await sb
            .from("clothing_items")
            .update({
              name: updates.name,
              notes: updates.notes || null,
              photo_urls: finalPhotoUrls,
              photo_url: finalPhotoUrls[0] || null,
            })
            .eq("id", editingItem.id)
            .eq("user_id", user.id)

          if (error) {
            console.error("Failed to update item in database:", error)
            setToast({ message: "Failed to save changes", open: true })
            return
          }
        }
      }

      setToast({ message: "Item updated successfully", open: true })

      // Trigger AI re-analysis if there are photos
      if (finalPhotoUrls.length > 0) {
        setTimeout(async () => {
          try {
            const sb = getSupabaseBrowser()
            let userId = null
            if (sb) {
              const { data: { user } } = await sb.auth.getUser()
              userId = user?.id
            }
            
            if (!userId) {
              console.error("No user ID available for re-analysis")
              return
            }
            
            console.log("Triggering AI re-analysis for edited item:", editingItem.id)
            
            const response = await fetch("/api/analyze-item", {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
              },
              credentials: "include",
              body: JSON.stringify({
                itemId: editingItem.id,
                userId: userId,
              }),
            })
            
            if (!response.ok) {
              const error = await response.text()
              console.error("Re-analysis failed:", response.status, error)
            } else {
              console.log("AI re-analysis triggered successfully")
            }
          } catch (error) {
            console.error("Failed to trigger re-analysis:", error)
          }
        }, 3000)
      }

    } catch (error) {
      console.error("Failed to edit item:", error)
      setToast({ message: "Failed to update item", open: true })
    }
  }

  const handleGenerate = async (requestText: string, context?: {
    vibe?: string
    weather?: string
    formality?: number
    timeOfDay?: string
  }): Promise<Outfit[]> => {
    try {
      // Get current user ID
      const sb = getSupabaseBrowser()
      let userId = null
      if (sb) {
        const { data: { user } } = await sb.auth.getUser()
        userId = user?.id
      }
      
      if (!userId) {
        console.error("No user ID available for outfit generation")
        throw new Error("Authentication required")
      }
      
      console.log("[Generate] Starting outfit generation", { 
        userId, 
        itemCount: items.length,
        itemsWithCategory: items.filter(i => i.category).length,
        requestText 
      })
      
      const response = await fetch("/api/generate-outfit", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        credentials: "include",
        body: JSON.stringify({
          prompt: requestText,
          pieceCount: 3,
          userId: userId,
          // Include optional context
          vibe: context?.vibe,
          weather: context?.weather,
          formality: context?.formality,
          timeOfDay: context?.timeOfDay,
        }),
      })

      if (!response.ok) {
        const error = await response.json()
        console.error("Generation failed:", error)
        throw new Error(error.error || "Generation failed")
      }

      const data = await response.json()
      
      // Extract generation metadata
      const metadata = data.generationMetadata || {}
      
      // Convert to Outfit format with metadata
      const primaryOutfit: Outfit = {
        id: uid(),
        itemIds: data.outfit.itemIds,
        rationale: data.outfit.rationale,
        createdAt: new Date().toISOString(),
        // Include generation metadata
        request: metadata.request,
        occasion: metadata.occasion,
        weather: metadata.weather,
        score: data.outfit.score,
        aiModel: metadata.aiModel,
        generationTimeMs: data.generationTimeMs,
        title: data.outfit.title,
      }
      
      const outfits: Outfit[] = [primaryOutfit]
      
      // Add ALL alternates if available
      if (data.alternates && data.alternates.length > 0) {
        for (const alternate of data.alternates) {
          const altOutfit: Outfit = {
            id: uid(),
            itemIds: alternate.itemIds,
            rationale: alternate.rationale,
            createdAt: new Date().toISOString(),
            // Include generation metadata for alternates too
            request: metadata.request,
            occasion: metadata.occasion,
            weather: metadata.weather,
            score: alternate.score,
            aiModel: metadata.aiModel,
            generationTimeMs: data.generationTimeMs,
            title: alternate.title,
          }
          outfits.push(altOutfit)
        }
      }
      
      console.log("[Generate] Returning", outfits.length, "outfit options to user")
      return outfits
    } catch (error) {
      console.error("Failed to generate outfit:", error)
      setToast({ 
        message: "AI generation failed. Using random selection instead.", 
        open: true 
      })
      // Fallback to local generation
      return generateOutfits(items, requestText, 3)
    }
  }

  const handleSaveOutfit = async (outfit: Outfit): Promise<boolean> => {
    try {
      await insertOutfitToSupabase(outfit)
      setOutfits((prev) => [outfit, ...prev])
      setToast({ message: "Outfit saved.", open: true })
      return true
    } catch (error) {
      console.error("Failed to save outfit:", error)
      setToast({ message: "Failed to save outfit", open: true })
      return false
    }
  }

  const recentItems = useMemo(() => items.slice(0, 5), [items])

  return (
    <div className="min-h-dvh bg-white">
      <main className="mx-auto max-w-md lg:max-w-2xl px-4 py-4">
        {screen === "home" && (
          <section className="space-y-6">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <PrimaryButton onClick={() => setScreen("add")}>Add Item</PrimaryButton>
              <PrimaryButton onClick={() => setScreen("generate")} variant="primary">
                Generate Outfit
              </PrimaryButton>
              <PrimaryButton onClick={() => setScreen("outfits")}>
                Outfits
              </PrimaryButton>
            </div>

            <div className="space-y-3">
              <h2 className="text-sm font-medium text-neutral-700">Recent items</h2>
              {recentItems.length === 0 ? (
                <div className="flex items-center gap-3 p-6 border rounded-2xl bg-neutral-50">
                  <div className="h-12 w-12 rounded-xl border flex items-center justify-center text-xl" aria-hidden>
                    {"👕"}
                  </div>
                  <div className="text-neutral-600">
                    <div>No items in your closet yet.</div>
                    <div className="text-sm mt-1">Add your first piece with a photo to get started!</div>
                  </div>
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
              onEdit={(it) => {
                setEditingItem(it)
                setScreen("edit")
              }}
              onRemove={(it) => {
                console.log("[Delete] Grid onRemove START:", { id: it.id, name: it.name, timestamp: new Date().toISOString() })
                deleteItemFromSupabase(it.id, it.photoUrl ?? null, it.photoUrls)
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
                  photoUrls: draft.photoUrls,
                  createdAt: now,
                }
                handleAddItem(item)
              }}
              onCancel={() => setScreen("home")}
            />
          </section>
        )}

        {screen === "edit" && editingItem && (
          <section className="space-y-4">
            <EditItemForm
              item={editingItem}
              onSave={handleEditItem}
              onCancel={() => {
                setScreen("home")
                setEditingItem(null)
              }}
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

        {screen === "outfits" && (
          <section className="space-y-6">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold text-neutral-900">Saved Outfits</h2>
              <PrimaryButton variant="ghost" onClick={() => setScreen("home")}>
                Back
              </PrimaryButton>
            </div>
            <OutfitsGrid
              outfits={outfits}
              items={items}
              onSelect={(outfit) => {
                setSelectedOutfit(outfit)
              }}
              onRemove={async (outfit) => {
                console.log("[Delete] Outfit removal START:", { id: outfit.id })
                const success = await deleteOutfitFromSupabase(outfit.id)
                if (success) {
                  console.log("[Delete] Outfit removal: removing from local state")
                  setOutfits((prev) => prev.filter((o) => o.id !== outfit.id))
                  setToast({ message: "Outfit removed.", open: true })
                } else {
                  setToast({ message: "Failed to remove outfit.", open: true })
                }
                console.log("[Delete] Outfit removal COMPLETE:", { success })
              }}
            />
          </section>
        )}
      </main>

      <Toast open={toast.open} message={toast.message} onOpenChange={(open) => setToast((t) => ({ ...t, open }))} />
      <ClosetItemModal
        item={selectedItem}
        onClose={() => setSelectedItem(null)}
        onRemove={(it) => {
          console.log("[Delete] Modal onRemove START:", { id: it.id, name: it.name, timestamp: new Date().toISOString() })
          deleteItemFromSupabase(it.id, it.photoUrl ?? null, it.photoUrls)
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
      <OutfitDetailModal
        outfit={selectedOutfit}
        items={items}
        onClose={() => setSelectedOutfit(null)}
        onRemove={async (outfit) => {
          console.log("[Delete] Modal outfit removal START:", { id: outfit.id })
          const success = await deleteOutfitFromSupabase(outfit.id)
          if (success) {
            console.log("[Delete] Modal outfit removal: removing from local state")
            setOutfits((prev) => prev.filter((o) => o.id !== outfit.id))
            setToast({ message: "Outfit removed.", open: true })
          } else {
            setToast({ message: "Failed to remove outfit.", open: true })
          }
          console.log("[Delete] Modal outfit removal COMPLETE:", { success })
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
  onGenerate: (requestText: string, context?: {
    vibe?: string
    weather?: string
    formality?: number
    timeOfDay?: string
  }) => Promise<Outfit[]>
  onSaveOutfit: (outfit: Outfit) => Promise<boolean>
}) {
  const [request, setRequest] = useState("")
  const [vibe, setVibe] = useState("")
  const [weather, setWeather] = useState("")
  const [formality, setFormality] = useState("") // 1-5 scale, no default
  const [timeOfDay, setTimeOfDay] = useState("")
  
  // Custom input states
  const [customVibe, setCustomVibe] = useState("")
  const [customWeather, setCustomWeather] = useState("")
  const [customFormality, setCustomFormality] = useState("")
  const [customTimeOfDay, setCustomTimeOfDay] = useState("")
  
  // Track which "Other" options are active
  const [showCustomVibe, setShowCustomVibe] = useState(false)
  const [showCustomWeather, setShowCustomWeather] = useState(false)
  const [showCustomFormality, setShowCustomFormality] = useState(false)
  const [showCustomTimeOfDay, setShowCustomTimeOfDay] = useState(false)
  const [results, setResults] = useState<Outfit[]>([])
  const [isGenerating, setIsGenerating] = useState(false)
  const [savedOutfitIds, setSavedOutfitIds] = useState<Set<string>>(new Set())
  const [savingOutfitIds, setSavingOutfitIds] = useState<Set<string>>(new Set())

  const canGenerate = items.length >= 2 && !isGenerating && request.trim().length > 0

  const handleGenerateClick = async () => {
    setResults([]) // Clear previous results
    setSavedOutfitIds(new Set()) // Clear saved states
    setSavingOutfitIds(new Set()) // Clear saving states
    setIsGenerating(true)
    try {
      // Convert formality to number if it's a preset, otherwise pass as string
      const getFormalityValue = () => {
        if (showCustomFormality) {
          const parsed = parseInt(customFormality)
          return parsed || customFormality || undefined
        }
        if (!formality) return undefined
        // Convert preset names to numbers for backward compatibility
        const formalityMap: {[key: string]: number} = {
          "Very Casual": 1,
          "Casual": 2,
          "Business Casual": 3,
          "Formal": 4,
          "Black Tie": 5
        }
        return formalityMap[formality] || undefined
      }

      const context = {
        vibe: showCustomVibe ? customVibe : vibe || undefined,
        weather: showCustomWeather ? customWeather : weather || undefined,
        formality: getFormalityValue(),
        timeOfDay: showCustomTimeOfDay ? customTimeOfDay : timeOfDay || undefined,
      }
      const res = await onGenerate(request, context)
      setResults(res)
    } finally {
      setIsGenerating(false)
    }
  }

  const handleSaveOutfit = async (outfit: Outfit) => {
    setSavingOutfitIds(prev => new Set([...prev, outfit.id]))
    try {
      const success = await onSaveOutfit(outfit)
      if (success) {
        setSavedOutfitIds(prev => new Set([...prev, outfit.id]))
      }
    } finally {
      setSavingOutfitIds(prev => {
        const newSet = new Set(prev)
        newSet.delete(outfit.id)
        return newSet
      })
    }
  }

  return (
    <section className="space-y-6">
      <div className="grid grid-cols-1 gap-6">
        {/* Required Field */}
        <TextInput
          id="req"
          label="What do you need an outfit for? *"
          placeholder="e.g., Summer picnic, date night, office..."
          value={request}
          onChange={(e) => setRequest(e.target.value)}
          required
        />

        {/* Optional Context */}
        <div className="space-y-4">
          <h3 className="text-sm font-bold text-neutral-700">Optional</h3>
          <div className="space-y-4 p-4 border rounded-lg bg-neutral-50">
          
          {/* Vibe Selector */}
          <div>
            <label className="block text-sm font-medium text-neutral-700 mb-2">Vibe</label>
            <div className="flex flex-wrap gap-2">
              {["Casual", "Professional", "Edgy", "Romantic", "Sporty", "Elegant", "Minimalist", "Streetwear"].map((vibeOption) => (
                <button
                  key={vibeOption}
                  type="button"
                  onClick={() => {
                    setVibe(vibe === vibeOption ? "" : vibeOption)
                    setShowCustomVibe(false)
                  }}
                  className={`px-3 py-1 text-sm rounded-full border transition ${
                    vibe === vibeOption && !showCustomVibe
                      ? "bg-neutral-900 text-white border-neutral-900" 
                      : "bg-white text-neutral-700 border-neutral-300 hover:border-neutral-400"
                  }`}
                  disabled={isGenerating}
                >
                  {vibeOption}
                </button>
              ))}
              <button
                type="button"
                onClick={() => {
                  setShowCustomVibe(!showCustomVibe)
                  setVibe("")
                }}
                className={`px-3 py-1 text-sm rounded-full border transition ${
                  showCustomVibe
                    ? "bg-neutral-900 text-white border-neutral-900" 
                    : "bg-white text-neutral-700 border-neutral-300 hover:border-neutral-400"
                }`}
                disabled={isGenerating}
              >
                Other
              </button>
            </div>
            {showCustomVibe && (
              <input
                type="text"
                placeholder="Enter custom vibe..."
                value={customVibe}
                onChange={(e) => setCustomVibe(e.target.value)}
                className="mt-2 w-full px-3 py-2 text-sm border border-neutral-300 rounded-md focus:outline-none focus:ring-2 focus:ring-neutral-500 focus:border-neutral-500"
                disabled={isGenerating}
              />
            )}
          </div>

          {/* Weather Selector */}
          <div>
            <label className="block text-sm font-medium text-neutral-700 mb-2">Weather</label>
            <div className="flex flex-wrap gap-2">
              {["Hot", "Warm", "Cool", "Cold", "Rainy"].map((weatherOption) => (
                <button
                  key={weatherOption}
                  type="button"
                  onClick={() => {
                    setWeather(weather === weatherOption ? "" : weatherOption)
                    setShowCustomWeather(false)
                  }}
                  className={`px-3 py-1 text-sm rounded-full border transition ${
                    weather === weatherOption && !showCustomWeather
                      ? "bg-neutral-900 text-white border-neutral-900" 
                      : "bg-white text-neutral-700 border-neutral-300 hover:border-neutral-400"
                  }`}
                  disabled={isGenerating}
                >
                  {weatherOption}
                </button>
              ))}
              <button
                type="button"
                onClick={() => {
                  setShowCustomWeather(!showCustomWeather)
                  setWeather("")
                }}
                className={`px-3 py-1 text-sm rounded-full border transition ${
                  showCustomWeather
                    ? "bg-neutral-900 text-white border-neutral-900" 
                    : "bg-white text-neutral-700 border-neutral-300 hover:border-neutral-400"
                }`}
                disabled={isGenerating}
              >
                Other
              </button>
            </div>
            {showCustomWeather && (
              <input
                type="text"
                placeholder="Enter weather condition..."
                value={customWeather}
                onChange={(e) => setCustomWeather(e.target.value)}
                className="mt-2 w-full px-3 py-2 text-sm border border-neutral-300 rounded-md focus:outline-none focus:ring-2 focus:ring-neutral-500 focus:border-neutral-500"
                disabled={isGenerating}
              />
            )}
          </div>

          {/* Formality Selector */}
          <div>
            <label className="block text-sm font-medium text-neutral-700 mb-2">Formality Level</label>
            <div className="flex flex-wrap gap-2">
              {["Very Casual", "Casual", "Business Casual", "Formal", "Black Tie"].map((formalityOption, index) => (
                <button
                  key={formalityOption}
                  type="button"
                  onClick={() => {
                    setFormality(formalityOption)
                    setShowCustomFormality(false)
                  }}
                  className={`px-3 py-1 text-sm rounded-full border transition ${
                    formality === formalityOption && !showCustomFormality
                      ? "bg-neutral-900 text-white border-neutral-900" 
                      : "bg-white text-neutral-700 border-neutral-300 hover:border-neutral-400"
                  }`}
                  disabled={isGenerating}
                >
                  {formalityOption}
                </button>
              ))}
              <button
                type="button"
                onClick={() => {
                  setShowCustomFormality(!showCustomFormality)
                  setFormality("")
                }}
                className={`px-3 py-1 text-sm rounded-full border transition ${
                  showCustomFormality
                    ? "bg-neutral-900 text-white border-neutral-900" 
                    : "bg-white text-neutral-700 border-neutral-300 hover:border-neutral-400"
                }`}
                disabled={isGenerating}
              >
                Other
              </button>
            </div>
            {showCustomFormality && (
              <input
                type="text"
                placeholder="Enter formality description..."
                value={customFormality}
                onChange={(e) => setCustomFormality(e.target.value)}
                className="mt-2 w-full px-3 py-2 text-sm border border-neutral-300 rounded-md focus:outline-none focus:ring-2 focus:ring-neutral-500 focus:border-neutral-500"
                disabled={isGenerating}
              />
            )}
          </div>

          {/* Time of Day */}
          <div>
            <label className="block text-sm font-medium text-neutral-700 mb-2">Time of Day</label>
            <div className="flex flex-wrap gap-2">
              {["Morning", "Afternoon", "Evening", "Night"].map((timeOption) => (
                <button
                  key={timeOption}
                  type="button"
                  onClick={() => {
                    setTimeOfDay(timeOfDay === timeOption ? "" : timeOption)
                    setShowCustomTimeOfDay(false)
                  }}
                  className={`px-3 py-1 text-sm rounded-full border transition ${
                    timeOfDay === timeOption && !showCustomTimeOfDay
                      ? "bg-neutral-900 text-white border-neutral-900" 
                      : "bg-white text-neutral-700 border-neutral-300 hover:border-neutral-400"
                  }`}
                  disabled={isGenerating}
                >
                  {timeOption}
                </button>
              ))}
              <button
                type="button"
                onClick={() => {
                  setShowCustomTimeOfDay(!showCustomTimeOfDay)
                  setTimeOfDay("")
                }}
                className={`px-3 py-1 text-sm rounded-full border transition ${
                  showCustomTimeOfDay
                    ? "bg-neutral-900 text-white border-neutral-900" 
                    : "bg-white text-neutral-700 border-neutral-300 hover:border-neutral-400"
                }`}
                disabled={isGenerating}
              >
                Other
              </button>
            </div>
            {showCustomTimeOfDay && (
              <input
                type="text"
                placeholder="Enter time of day..."
                value={customTimeOfDay}
                onChange={(e) => setCustomTimeOfDay(e.target.value)}
                className="mt-2 w-full px-3 py-2 text-sm border border-neutral-300 rounded-md focus:outline-none focus:ring-2 focus:ring-neutral-500 focus:border-neutral-500"
                disabled={isGenerating}
              />
            )}
          </div>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <PrimaryButton onClick={handleGenerateClick} disabled={!canGenerate}>
            {isGenerating ? "Generating..." : "Generate"}
          </PrimaryButton>
          <PrimaryButton variant="ghost" onClick={onBack} disabled={isGenerating}>
            Back
          </PrimaryButton>
        </div>
      </div>

      {items.length < 2 && !isGenerating && (
        <div className="p-4 border rounded-2xl bg-neutral-50 text-neutral-700">Add a few items first.</div>
      )}

      {isGenerating && (
        <div className="flex flex-col items-center justify-center p-8 border rounded-2xl bg-neutral-50">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-neutral-600 mb-4"></div>
          <div className="text-neutral-700 font-medium">Creating your outfits...</div>
          <div className="text-neutral-500 text-sm mt-1">Analyzing colors, styles, and coordination</div>
        </div>
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
              isSaved={savedOutfitIds.has(o.id)}
              isSaving={savingOutfitIds.has(o.id)}
              onSave={() => {
                const outfit: Outfit = {
                  id: o.id, // Use the existing ID from the outfit
                  itemIds: chosen.map((c) => c.id),
                  rationale: o.rationale,
                  createdAt: new Date().toISOString(),
                  // Preserve all generation metadata
                  request: o.request,
                  occasion: o.occasion,
                  weather: o.weather,
                  score: o.score,
                  aiModel: o.aiModel,
                  generationTimeMs: o.generationTimeMs,
                  title: o.title,
                }
                handleSaveOutfit(outfit)
              }}
            />
          )
        })}
      </div>
    </section>
  )
}
