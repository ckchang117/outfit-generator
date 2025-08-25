import { useEffect, useState } from "react"
import { getSupabaseBrowser, getCurrentSession } from "../lib/supabase/browser-client"
import { urlCache } from "../lib/signed-url-cache"

/**
 * Hook to get a signed URL for a storage path with caching
 * 
 * @param path - The storage path (can be null/undefined)
 * @param bucket - The storage bucket name (default: "item-photos")
 * @returns The signed URL or null if not available
 */
export function useSignedUrl(
  path: string | null | undefined,
  bucket: string = "item-photos"
): string | null {
  const [url, setUrl] = useState<string | null>(null)

  useEffect(() => {
    let isMounted = true

    const getSignedUrl = async () => {
      if (!path) {
        setUrl(null)
        return
      }

      // If it's already an HTTP URL, use it directly
      if (/^https?:\/\//i.test(path)) {
        if (isMounted) setUrl(path)
        return
      }

      // Check cache first
      const cachedUrl = urlCache.get(path)
      if (cachedUrl) {
        if (isMounted) setUrl(cachedUrl)
        return
      }

      // Generate new signed URL
      const sb = getSupabaseBrowser()
      if (!sb) return

      // Check if user has valid session
      const session = await getCurrentSession()
      if (!session) return

      try {
        const duration = 36000 // 10 hours
        const { data, error } = await sb.storage
          .from(bucket)
          .createSignedUrl(path, duration)

        if (!error && data?.signedUrl && isMounted) {
          // Cache the URL
          urlCache.set(path, data.signedUrl, duration)
          setUrl(data.signedUrl)
        } else if (error) {
          console.warn(`createSignedUrl error for ${path}:`, error)
        }
      } catch (err) {
        console.warn(`Failed to get signed URL for ${path}:`, err)
      }
    }

    getSignedUrl()

    return () => {
      isMounted = false
    }
  }, [path, bucket])

  return url
}