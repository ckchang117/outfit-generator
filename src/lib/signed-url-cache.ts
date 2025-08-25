/**
 * SignedURLCache - Manages caching of Supabase Storage signed URLs
 * 
 * Reduces egress by reusing signed URLs that haven't expired yet.
 * URLs are cached with their expiration time and only regenerated when needed.
 */

interface CachedURL {
  url: string
  expiresAt: number // Unix timestamp in milliseconds
}

class SignedURLCache {
  private cache: Map<string, CachedURL> = new Map()
  private readonly BUFFER_TIME = 60000 // 1 minute buffer before expiration

  /**
   * Get a cached URL if it's still valid, otherwise return null
   */
  get(path: string): string | null {
    const cached = this.cache.get(path)
    if (!cached) return null

    const now = Date.now()
    const expiresWithBuffer = cached.expiresAt - this.BUFFER_TIME

    if (now >= expiresWithBuffer) {
      // URL is expired or about to expire
      this.cache.delete(path)
      return null
    }

    return cached.url
  }

  /**
   * Store a signed URL with its expiration time
   * @param path - The storage path
   * @param url - The signed URL
   * @param durationSeconds - How long the URL is valid for (in seconds)
   */
  set(path: string, url: string, durationSeconds: number): void {
    const expiresAt = Date.now() + (durationSeconds * 1000)
    this.cache.set(path, { url, expiresAt })
  }

  /**
   * Clear all cached URLs
   */
  clear(): void {
    this.cache.clear()
  }

  /**
   * Clear expired URLs from the cache
   */
  cleanExpired(): void {
    const now = Date.now()
    for (const [path, cached] of this.cache.entries()) {
      if (now >= cached.expiresAt) {
        this.cache.delete(path)
      }
    }
  }

  /**
   * Get the number of cached URLs
   */
  get size(): number {
    return this.cache.size
  }
}

// Create a singleton instance
export const urlCache = new SignedURLCache()

// Clean expired URLs every 5 minutes
if (typeof window !== 'undefined') {
  setInterval(() => {
    urlCache.cleanExpired()
  }, 5 * 60 * 1000)
}