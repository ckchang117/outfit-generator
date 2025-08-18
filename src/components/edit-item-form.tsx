"use client"

import type React from "react"
import { useEffect, useRef, useState } from "react"
import TextInput from "./text-input"
import PrimaryButton from "./primary-button"
import { getSupabaseBrowser, getCurrentSession } from "../lib/supabase/browser-client"
import { ensureAuthReady } from "../lib/supabase/ensure-auth"
import type { ClothingItem } from "../app"

type EditDraftItem = {
  name: string
  notes?: string
  photoUrls?: string[]
  newFiles?: File[]
  removedPhotos?: string[]
}

export default function EditItemForm({
  item,
  onSave,
  onCancel,
}: {
  item: ClothingItem
  onSave: (updates: EditDraftItem) => void
  onCancel: () => void
}) {
  const [name, setName] = useState(item.name || "")
  const [notes, setNotes] = useState(item.notes || "")
  const [existingPhotos, setExistingPhotos] = useState<string[]>(item.photoUrls || [])
  const [newPhotoPreviews, setNewPhotoPreviews] = useState<string[]>([])
  const [newFiles, setNewFiles] = useState<File[]>([])
  const [removedPhotos, setRemovedPhotos] = useState<string[]>([])
  const [existingPhotoUrls, setExistingPhotoUrls] = useState<Record<string, string>>({})
  const [saving, setSaving] = useState(false)
  const [errors, setErrors] = useState<{ name?: string; photo?: string }>({})
  const objectUrlsRef = useRef<string[]>([])

  // Load signed URLs for existing photos
  useEffect(() => {
    const loadExistingPhotos = async () => {
      const sb = getSupabaseBrowser()
      if (!sb) return

      const urls: Record<string, string> = {}
      for (const photoPath of existingPhotos) {
        try {
          if (/^https?:\/\//i.test(photoPath)) {
            urls[photoPath] = photoPath
          } else {
            const { data } = await sb.storage.from("item-photos").createSignedUrl(photoPath, 600)
            if (data?.signedUrl) {
              urls[photoPath] = data.signedUrl
            }
          }
        } catch (error) {
          console.warn("Failed to load photo:", photoPath, error)
        }
      }
      setExistingPhotoUrls(urls)
    }

    loadExistingPhotos()
  }, [existingPhotos])

  useEffect(() => {
    return () => {
      objectUrlsRef.current.forEach(url => URL.revokeObjectURL(url))
    }
  }, [])

  const handleFileChange: React.ChangeEventHandler<HTMLInputElement> = (e) => {
    const fileList = e.target.files
    if (!fileList || fileList.length === 0) return
    
    const newFilesArray = Array.from(fileList)
    const newPreviews = newFilesArray.map(file => {
      const url = URL.createObjectURL(file)
      objectUrlsRef.current.push(url)
      return url
    })
    
    setNewFiles(prev => [...prev, ...newFilesArray])
    setNewPhotoPreviews(prev => [...prev, ...newPreviews])
    setErrors(prev => ({ ...prev, photo: undefined }))
  }

  const removeExistingPhoto = (photoPath: string) => {
    setExistingPhotos(prev => prev.filter(p => p !== photoPath))
    setRemovedPhotos(prev => [...prev, photoPath])
  }

  const removeNewPhoto = (index: number) => {
    const urlToRevoke = newPhotoPreviews[index]
    URL.revokeObjectURL(urlToRevoke)
    
    setNewFiles(prev => prev.filter((_, i) => i !== index))
    setNewPhotoPreviews(prev => prev.filter((_, i) => i !== index))
    objectUrlsRef.current = objectUrlsRef.current.filter(url => url !== urlToRevoke)
  }

  const totalPhotos = existingPhotos.length + newFiles.length

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (saving) return

    // Validation
    const newErrors: { name?: string; photo?: string } = {}
    if (!name.trim()) newErrors.name = "Name is required"
    if (totalPhotos === 0) newErrors.photo = "At least one photo is required"

    if (Object.keys(newErrors).length > 0) {
      setErrors(newErrors)
      return
    }

    setSaving(true)
    try {
      await onSave({
        name: name.trim(),
        notes: notes.trim() || undefined,
        photoUrls: existingPhotos,
        newFiles: newFiles.length > 0 ? newFiles : undefined,
        removedPhotos: removedPhotos.length > 0 ? removedPhotos : undefined,
      })
    } catch (error) {
      console.error("Edit failed:", error)
      setErrors({ name: "Failed to save changes" })
    } finally {
      setSaving(false)
    }
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">Edit Item</h2>
      </div>

      <TextInput
        id="name"
        label="Name"
        placeholder="e.g., Blue polo shirt"
        value={name}
        onChange={(e) => {
          setName(e.target.value)
          setErrors(prev => ({ ...prev, name: undefined }))
        }}
        error={errors.name}
        required
      />

      <TextInput
        id="notes"
        label="Description (optional)"
        placeholder="Additional details, size, brand, etc."
        value={notes}
        onChange={(e) => setNotes(e.target.value)}
        multiline
        rows={3}
      />

      <div className="space-y-2">
        <label className="block text-sm font-medium text-neutral-700">
          Photos {totalPhotos > 0 && <span className="text-neutral-500">({totalPhotos})</span>}
        </label>
        
        {/* Existing Photos */}
        {existingPhotos.length > 0 && (
          <div className="space-y-2">
            <div className="text-xs text-neutral-600">Current photos:</div>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              {existingPhotos.map((photoPath, index) => {
                const signedUrl = existingPhotoUrls[photoPath]
                return (
                  <div key={photoPath} className="relative group">
                    {signedUrl ? (
                      <img
                        src={signedUrl}
                        alt={`Existing photo ${index + 1}`}
                        className="w-full aspect-square object-cover rounded border"
                      />
                    ) : (
                      <div className="w-full aspect-square bg-neutral-100 rounded border flex items-center justify-center text-neutral-400 text-xs">
                        Loading...
                      </div>
                    )}
                    <button
                      type="button"
                      onClick={() => removeExistingPhoto(photoPath)}
                      className="absolute top-1 right-1 bg-red-500 text-white rounded-full w-5 h-5 flex items-center justify-center text-xs opacity-0 group-hover:opacity-100 transition-opacity"
                    >
                      ×
                    </button>
                  </div>
                )
              })}
            </div>
          </div>
        )}

        {/* New Photos */}
        {newFiles.length > 0 && (
          <div className="space-y-2">
            <div className="text-xs text-neutral-600">New photos to add:</div>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              {newPhotoPreviews.map((preview, index) => (
                <div key={index} className="relative group">
                  <img
                    src={preview}
                    alt={`New photo ${index + 1}`}
                    className="w-full aspect-square object-cover rounded border"
                  />
                  <button
                    type="button"
                    onClick={() => removeNewPhoto(index)}
                    className="absolute top-1 right-1 bg-red-500 text-white rounded-full w-5 h-5 flex items-center justify-center text-xs opacity-0 group-hover:opacity-100 transition-opacity"
                  >
                    ×
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Add Photos Input */}
        <div>
          <input
            type="file"
            id="photos"
            accept="image/*"
            multiple
            onChange={handleFileChange}
            className="block w-full text-sm text-neutral-500 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-neutral-50 file:text-neutral-700 hover:file:bg-neutral-100"
          />
          <div className="text-xs text-neutral-500 mt-1">
            Add more photos (JPG, PNG, HEIC, WebP)
          </div>
        </div>

        {errors.photo && (
          <div className="text-sm text-red-600">{errors.photo}</div>
        )}
      </div>

      <div className="flex gap-3 pt-2">
        <PrimaryButton type="submit" disabled={saving}>
          {saving ? "Saving..." : "Save Changes"}
        </PrimaryButton>
        <PrimaryButton variant="ghost" onClick={onCancel} disabled={saving}>
          Cancel
        </PrimaryButton>
      </div>
    </form>
  )
}