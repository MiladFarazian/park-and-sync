
# Fix Flashing in OptimizedImage Component

## Problem

The `OptimizedImage` component has a skeleton placeholder with `animate-pulse` that creates a flashing effect during image loading. This pulsing animation continuously alternates the opacity of the placeholder, causing visual distraction.

**Root cause:** Line 59 in `src/components/ui/optimized-image.tsx`:
```tsx
'absolute inset-0 bg-muted animate-pulse transition-opacity duration-300'
```

The `animate-pulse` Tailwind class applies a keyframe animation that oscillates opacity between 1 and 0.5 repeatedly, creating the "flash" effect.

---

## Solution

Remove the `animate-pulse` animation and use a static skeleton placeholder instead. This provides a cleaner loading state without the distracting flash.

---

## Change Required

**File:** `src/components/ui/optimized-image.tsx`
**Line:** 59

**Current:**
```tsx
'absolute inset-0 bg-muted animate-pulse transition-opacity duration-300',
```

**New:**
```tsx
'absolute inset-0 bg-muted transition-opacity duration-300',
```

---

## Result

- The placeholder will remain a static muted background color
- Once the image loads, it will smoothly fade in (opacity transition still works)
- No more visual flashing/pulsing during load
- Maintains the lazy loading and fade-in animation benefits

---

## Technical Notes

The component will still:
- Lazy load images when they enter the viewport
- Show a clean static placeholder while loading
- Fade in smoothly when the image is ready
- Handle errors with a fallback "No image" state
