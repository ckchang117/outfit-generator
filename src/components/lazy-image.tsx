import { useEffect, useRef, useState } from "react"

interface LazyImageProps {
  src: string
  alt: string
  className?: string
  placeholder?: React.ReactNode
  onError?: () => void
}

/**
 * LazyImage component that loads images only when they're visible in the viewport
 * Uses Intersection Observer API for efficient lazy loading
 */
export function LazyImage({ 
  src, 
  alt, 
  className = "", 
  placeholder,
  onError 
}: LazyImageProps) {
  const [isInView, setIsInView] = useState(false)
  const [hasLoaded, setHasLoaded] = useState(false)
  const [hasError, setHasError] = useState(false)
  const imgRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const element = imgRef.current
    if (!element) return

    // Create intersection observer
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            setIsInView(true)
            observer.unobserve(element)
          }
        })
      },
      {
        // Start loading when image is 100px away from viewport
        rootMargin: "100px",
        threshold: 0.01
      }
    )

    observer.observe(element)

    return () => {
      observer.disconnect()
    }
  }, [])

  const handleLoad = () => {
    setHasLoaded(true)
  }

  const handleError = () => {
    setHasError(true)
    onError?.()
  }

  return (
    <div ref={imgRef} className={className}>
      {/* Show placeholder until image is in view and loaded */}
      {(!isInView || !hasLoaded) && !hasError && placeholder}
      
      {/* Load image when in view */}
      {isInView && !hasError && (
        <img
          src={src}
          alt={alt}
          className={className}
          onLoad={handleLoad}
          onError={handleError}
          style={{
            display: hasLoaded ? "block" : "none"
          }}
        />
      )}
      
      {/* Show error state */}
      {hasError && placeholder}
    </div>
  )
}