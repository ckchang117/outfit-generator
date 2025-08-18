"use client"

import type React from "react"
import { useEffect, useRef, useState } from "react"
import TextInput from "./text-input"
import PrimaryButton from "./primary-button"
import { getSupabaseBrowser, getCurrentSession } from "../lib/supabase/browser-client"
import { ensureAuthReady } from "../lib/supabase/ensure-auth"

type DraftItem = {
  name: string
  notes?: string
  photoUrl?: string | null
  photoUrls?: string[]
}

export default function ItemForm({
  onSave,
  onCancel,
}: {
  onSave: (item: DraftItem) => void
  onCancel: () => void
}) {
  const [name, setName] = useState("")
  const [notes, setNotes] = useState("")
  const [photoPreviews, setPhotoPreviews] = useState<string[]>([])
  const [files, setFiles] = useState<File[]>([])
  const [saving, setSaving] = useState(false)
  const [errors, setErrors] = useState<{ name?: string; photo?: string }>({})
  const objectUrlsRef = useRef<string[]>([])

  useEffect(() => {
    return () => {
      objectUrlsRef.current.forEach(url => URL.revokeObjectURL(url))
    }
  }, [])

  const handleFileChange: React.ChangeEventHandler<HTMLInputElement> = (e) => {
    const fileList = e.target.files
    if (!fileList || fileList.length === 0) return
    
    const newFiles = Array.from(fileList)
    const newPreviews = newFiles.map(file => {
      const url = URL.createObjectURL(file)
      objectUrlsRef.current.push(url)
      return url
    })
    
    // Append to existing files instead of replacing
    setFiles(prev => [...prev, ...newFiles])
    setPhotoPreviews(prev => [...prev, ...newPreviews])
    
    // Clear photo error when files are selected
    if (errors.photo) {
      setErrors({ ...errors, photo: undefined })
    }
    
    // Reset the input value so the same file can be selected again
    e.target.value = ''
  }
  
  const removePhoto = (index: number) => {
    // Clean up the object URL
    const urlToRemove = photoPreviews[index]
    if (urlToRemove) {
      URL.revokeObjectURL(urlToRemove)
      objectUrlsRef.current = objectUrlsRef.current.filter(url => url !== urlToRemove)
    }
    
    // Remove from both arrays
    setFiles(prev => prev.filter((_, i) => i !== index))
    setPhotoPreviews(prev => prev.filter((_, i) => i !== index))
  }

  const submit = async () => {
    if (saving) return
    const errs: { name?: string; photo?: string } = {}
    if (!name.trim()) {
      errs.name = "Name is required."
    }
    if (files.length === 0) {
      errs.photo = "At least one photo is required."
    }
    setErrors(errs)
    if (Object.keys(errs).length > 0) return

    setSaving(true)
    const uploadedPaths: string[] = []
    
    try {
      const sb = getSupabaseBrowser()
      if (sb && files.length > 0) {
        await ensureAuthReady(sb)
        
        // Use persistent session cache for better reliability
        const session = await getCurrentSession()
        let userId = session?.user?.id
        
        console.log("[Upload] Session check:", { hasSession: Boolean(session), userId })
        
        if (!userId) {
          console.log("[Upload] No session found, trying getUser fallback")
          const { data } = await sb.auth.getUser()
          userId = data?.user?.id
        }
        
        const folder = userId ?? "misc"
        
        // Upload all files
        const timestamp = Date.now()
        for (let i = 0; i < files.length; i++) {
          const file = files[i]
          const ext = (file.name.split(".").pop() || "jpg").toLowerCase()
          // Ensure unique filename with timestamp, random string, and index
          const uniqueId = `${timestamp}-${i}-${Math.random().toString(36).slice(2, 8)}`
          const path = `${folder}/${uniqueId}.${ext}`
          
          console.log(`[Upload] Uploading file ${i + 1}/${files.length}: ${path}`)
          
          try {
            const { data, error } = await sb.storage.from("item-photos").upload(path, file, {
              cacheControl: "3600",
              upsert: false,
              contentType: file.type,
            })
            
            if (!error && data) {
              uploadedPaths.push(path)
              console.log(`[Upload] Successfully uploaded file ${i + 1}: ${path}`)
            } else {
              console.warn(`[Upload] Storage upload failed for file ${i + 1}:`, error)
            }
          } catch (e) {
            console.warn(`[Upload] Storage upload threw for file ${i + 1}:`, e)
          }
          
          // Small delay between uploads to avoid any potential race conditions
          if (i < files.length - 1) {
            await new Promise(resolve => setTimeout(resolve, 100))
          }
        }
        
        console.log(`[Upload] Uploaded ${uploadedPaths.length}/${files.length} files successfully`)
      }
    } catch (e) {
      console.warn("Storage upload threw:", e)
    } finally {
      setSaving(false)
    }

    const itemToSave = {
      name: name.trim(),
      notes: notes.trim() || undefined,
      photoUrl: uploadedPaths[0] || null,  // First photo as primary
      photoUrls: uploadedPaths.length > 0 ? uploadedPaths : undefined,
    }
    
    console.log("[Upload] Saving item with photos:", {
      photoCount: uploadedPaths.length,
      photoUrl: itemToSave.photoUrl,
      photoUrls: itemToSave.photoUrls
    })
    
    onSave(itemToSave)
  }

  return (
    <div className="space-y-4">
      <div className="grid gap-4">
        <div>
          <div className="flex items-center justify-between mb-2">
            <label className="text-sm font-medium">
              Photos {photoPreviews.length > 0 && <span className="text-neutral-500 font-normal">({photoPreviews.length} selected)</span>}
            </label>
          </div>
          <input
            type="file"
            accept="image/*"
            multiple
            onChange={handleFileChange}
            className="block w-full text-xs text-neutral-700 file:mr-3 file:py-2 file:px-3 file:rounded-full file:border-0 file:text-sm file:font-medium file:bg-neutral-900 file:text-white hover:file:bg-neutral-800 focus:outline-none"
          />
          <p className="text-xs text-neutral-500 mt-1">
            {photoPreviews.length === 0 
              ? "Select one or more photos." 
              : "Click to add more photos to this item."}
          </p>
          {errors.photo && (
            <p className="text-xs text-red-600 mt-1">{errors.photo}</p>
          )}
        </div>
        
        {photoPreviews.length > 0 ? (
          <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
            {photoPreviews.map((preview, idx) => (
              <div key={idx} className="relative group">
                <img 
                  src={preview} 
                  alt={`Preview ${idx + 1}`} 
                  className="w-full aspect-square object-cover rounded-lg border"
                />
                <div className="absolute top-1 right-1 opacity-100 transition">
                  <button
                    type="button"
                    onClick={() => removePhoto(idx)}
                    className="inline-flex items-center justify-center h-6 w-6 rounded-full bg-white/90 text-red-600 border border-red-200 hover:bg-white focus:outline-none"
                    aria-label={`Remove photo ${idx + 1}`}
                  >
                    ×
                  </button>
                </div>
                <span className="absolute bottom-1 left-1 bg-black/50 text-white text-xs px-1.5 py-0.5 rounded">
                  {idx + 1}
                </span>
              </div>
            ))}
          </div>
        ) : (
          <div className={`p-8 border-2 border-dashed rounded-xl text-center ${errors.photo ? 'border-red-300' : 'border-neutral-200'}`}>
            <div className="text-neutral-400 text-sm">
              No photos selected
              <div className="text-xs mt-1">Click above to add photos</div>
            </div>
          </div>
        )}
      </div>

      <TextInput
        id="name"
        label="Name"
        placeholder="e.g., White Tee"
        value={name}
        onChange={(e) => setName(e.target.value)}
        error={errors.name}
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
        <PrimaryButton onClick={submit} loading={saving} disabled={saving}>
          Save
        </PrimaryButton>
        <PrimaryButton variant="ghost" onClick={onCancel}>
          Cancel
        </PrimaryButton>
      </div>
    </div>
  )
}
