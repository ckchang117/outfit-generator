"use client"

import type React from "react"
import { useEffect, useRef, useState } from "react"
import TextInput from "./text-input"
import Select from "./select"
import PrimaryButton from "./primary-button"

type DraftItem = {
  name: string
  category: "top" | "bottom" | "dress" | "shoes" | "outerwear" | "accessory"
  color: string
  season: "all" | "spring" | "summer" | "fall" | "winter"
  notes?: string
  photoUrl?: string | null
}

export default function ItemForm({
  onSave,
  onCancel,
}: {
  onSave: (item: DraftItem) => void
  onCancel: () => void
}) {
  const [name, setName] = useState("")
  const [category, setCategory] = useState<DraftItem["category"]>("top")
  const [color, setColor] = useState("")
  const [season, setSeason] = useState<DraftItem["season"]>("all")
  const [notes, setNotes] = useState("")
  const [photoPreview, setPhotoPreview] = useState<string | null>(null)
  const [errors, setErrors] = useState<{ name?: string }>({})
  const objectUrlRef = useRef<string | null>(null)

  useEffect(() => {
    return () => {
      if (objectUrlRef.current) {
        URL.revokeObjectURL(objectUrlRef.current)
      }
    }
  }, [])

  const handleFileChange: React.ChangeEventHandler<HTMLInputElement> = (e) => {
    const file = e.target.files?.[0]
    if (!file) {
      setPhotoPreview(null)
      return
    }
    if (objectUrlRef.current) {
      URL.revokeObjectURL(objectUrlRef.current)
      objectUrlRef.current = null
    }
    const url = URL.createObjectURL(file)
    objectUrlRef.current = url
    setPhotoPreview(url)
  }

  const submit = () => {
    const errs: { name?: string } = {}
    if (!name.trim()) {
      errs.name = "Name is required."
    }
    setErrors(errs)
    if (Object.keys(errs).length > 0) return

    onSave({
      name: name.trim(),
      category,
      color: color.trim(),
      season,
      notes: notes.trim() || undefined,
      photoUrl: photoPreview || null,
    })
  }

  return (
    <div className="space-y-4">
      <div className="grid gap-2">
        <div className="flex items-center gap-3">
          <div className="h-16 w-16 md:h-20 md:w-20 rounded-xl border bg-neutral-100 overflow-hidden">
            {photoPreview ? (
              <img src={photoPreview || "/placeholder.svg"} alt="Preview" className="h-full w-full object-cover" />
            ) : (
              <div className="h-full w-full flex items-center justify-center text-neutral-400 text-xs">No photo</div>
            )}
          </div>
          <label className="text-sm">
            <span className="sr-only">Photo</span>
            <input
              type="file"
              accept="image/*"
              onChange={handleFileChange}
              className="block w-full text-xs text-neutral-700 file:mr-3 file:py-2 file:px-3 file:rounded-full file:border-0 file:text-sm file:font-medium file:bg-neutral-900 file:text-white hover:file:bg-neutral-800 focus:outline-none"
            />
          </label>
        </div>
      </div>

      <TextInput
        id="name"
        label="Name"
        placeholder="e.g., White Tee"
        value={name}
        onChange={(e) => setName(e.target.value)}
        error={errors.name}
      />

      <Select
        id="category"
        label="Category"
        value={category}
        onChange={(e) => setCategory(e.target.value as DraftItem["category"])}
        options={[
          { value: "top", label: "Top" },
          { value: "bottom", label: "Bottom" },
          { value: "dress", label: "Dress" },
          { value: "shoes", label: "Shoes" },
          { value: "outerwear", label: "Outerwear" },
          { value: "accessory", label: "Accessory" },
        ]}
      />

      <TextInput
        id="color"
        label="Color"
        placeholder="e.g., white, black, blue"
        value={color}
        onChange={(e) => setColor(e.target.value)}
      />

      <Select
        id="season"
        label="Season"
        value={season}
        onChange={(e) => setSeason(e.target.value as DraftItem["season"])}
        options={[
          { value: "all", label: "All" },
          { value: "spring", label: "Spring" },
          { value: "summer", label: "Summer" },
          { value: "fall", label: "Fall" },
          { value: "winter", label: "Winter" },
        ]}
      />

      <TextInput
        id="notes"
        label="Notes"
        placeholder="Optional notes"
        value={notes}
        onChange={(e) => setNotes(e.target.value)}
        multiline
        rows={3}
      />

      <div className="grid grid-cols-2 gap-3 pt-1">
        <PrimaryButton onClick={submit}>Save</PrimaryButton>
        <PrimaryButton variant="ghost" onClick={onCancel}>
          Cancel
        </PrimaryButton>
      </div>
    </div>
  )
}
