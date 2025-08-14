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
  const [photoPreview, setPhotoPreview] = useState<string | null>(null)
  const [file, setFile] = useState<File | null>(null)
  const [saving, setSaving] = useState(false)
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
      setFile(null)
      return
    }
    if (objectUrlRef.current) {
      URL.revokeObjectURL(objectUrlRef.current)
      objectUrlRef.current = null
    }
    const url = URL.createObjectURL(file)
    objectUrlRef.current = url
    setPhotoPreview(url)
    setFile(file)
  }

  const submit = async () => {
    if (saving) return
    const errs: { name?: string } = {}
    if (!name.trim()) {
      errs.name = "Name is required."
    }
    setErrors(errs)
    if (Object.keys(errs).length > 0) return

    setSaving(true)
    let uploadedPath: string | null = null
    try {
      const sb = getSupabaseBrowser()
      if (sb && file) {
        await ensureAuthReady(sb)
        // Helper to guard against hanging network calls
        const withTimeout = <T,>(p: Promise<T>, ms: number) =>
          new Promise<T | { error: any }>((resolve) => {
            const t = setTimeout(() => resolve({ error: new Error("timeout") }), ms)
            p.then((v: any) => {
              clearTimeout(t)
              resolve(v)
            }).catch((err) => {
              clearTimeout(t)
              resolve({ error: err })
            })
          })

        // Use persistent session cache for better reliability
        const session = await getCurrentSession()
        let userId = session?.user?.id
        
        console.log("[Upload] Session check:", { hasSession: Boolean(session), userId })
        
        if (!userId) {
          console.log("[Upload] No session found, trying getUser fallback")
          const gotUser = (await withTimeout(sb.auth.getUser(), 3000)) as
            | { data?: { user?: { id: string } | null } }
            | { error: any }
          userId = (gotUser as any)?.data?.user?.id
        }
        const folder = userId ?? "misc"
        {
          const ext = (file.name.split(".").pop() || "jpg").toLowerCase()
          const path = `${folder}/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`
          const uploadRes = (await withTimeout(
            sb.storage.from("item-photos").upload(path, file, {
              cacheControl: "3600",
              upsert: false,
              contentType: file.type,
            }),
            15000
          )) as { data?: any; error?: any }
          if (!uploadRes?.error) {
            uploadedPath = path
          } else {
            console.warn("Storage upload failed:", uploadRes.error)
          }
        }
      }
    } catch (e) {
      console.warn("Storage upload threw:", e)
    } finally {
      setSaving(false)
    }

    onSave({
      name: name.trim(),
      notes: notes.trim() || undefined,
      photoUrl: uploadedPath || null,
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
