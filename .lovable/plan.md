

# Multi-Space Listings: Terminology & Availability Display Fix

## Problem Summary

The user wants to ensure:
1. **Terminology consistency**: "Spot" = listing, "Space" = individual parking space within a listing
2. **Quantity is editable**: When listing/editing, hosts should be able to set/change the number of spaces
3. **Dynamic availability display**: Show "X of Y spaces available" in Explore when some spaces are booked

## Current State Analysis

### What's Already Working
- **Quantity is editable** in both ListSpot.tsx and EditSpot.tsx - the field exists and saves correctly
- **Search returns availability**: `search-spots-lite` calculates and returns `available_quantity` dynamically
- **DesktopSpotList** already shows "X of Y available" badge for multi-space listings

### Issues Found

| Location | Current Text | Issue |
|----------|-------------|-------|
| ListSpot.tsx | "spots" | Should say "spaces" |
| EditSpot.tsx | "spots" | Should say "spaces" |
| SpotDetail.tsx | "X spots available" (static) | Should show "X of Y spaces available" (dynamic) |
| DesktopSpotList.tsx | "X of Y available" | Should say "X of Y spaces available" |
| Dashboard.tsx | "X spots" | Should say "X spaces" |

---

## Implementation Plan

### 1. Update ListSpot.tsx Terminology

**File**: `src/pages/ListSpot.tsx`

Change the quantity field labels from "spots" to "spaces":

```
Current:
- "How many identical parking spots?"
- "All spots share the same price..."
- "X spots will share one listing"
- "spots" (suffix after input)

New:
- "How many identical parking spaces?"
- "All spaces share the same listing, price, schedule, and rules"
- "This listing will have X spaces"
- "spaces" (suffix after input)
```

### 2. Update EditSpot.tsx Terminology

**File**: `src/pages/EditSpot.tsx`

Same changes as ListSpot:
- "Number of Identical Spaces" (was "Spots")
- "All spaces share the same listing..." (was "spots")
- "X spaces share one listing" (was "spots")

### 3. Update SpotDetail.tsx to Show Dynamic Availability

**File**: `src/pages/SpotDetail.tsx`

Currently shows static total quantity. Need to:
1. Fetch `available_quantity` for the spot dynamically based on search time range
2. Display "X of Y spaces available" instead of "X spots available"

This requires calling a function to get the current available quantity. The database has a function `get_spot_available_quantity` that can be used.

```typescript
// Add state for available quantity
const [availableQuantity, setAvailableQuantity] = useState<number | null>(null);

// Fetch available quantity when spot loads or time changes
useEffect(() => {
  if (spot?.quantity > 1 && startTime && endTime) {
    supabase.rpc('get_spot_available_quantity', {
      p_spot_id: spot.id,
      p_start_at: startTime.toISOString(),
      p_end_at: endTime.toISOString(),
      p_exclude_user_id: user?.id || null
    }).then(({ data }) => {
      setAvailableQuantity(data ?? spot.quantity);
    });
  }
}, [spot?.id, startTime, endTime, user?.id]);

// In render - change from:
{spot.quantity > 1 && (
  <Badge>{spot.quantity} spots available</Badge>
)}

// To:
{spot.quantity > 1 && (
  <Badge>
    {availableQuantity ?? spot.quantity} of {spot.quantity} spaces available
  </Badge>
)}
```

### 4. Update DesktopSpotList.tsx Badge Text

**File**: `src/components/explore/DesktopSpotList.tsx`

Add "spaces" to the badge:

```typescript
// From:
{spot.availableQuantity ?? spot.quantity} of {spot.quantity} available

// To:
{spot.availableQuantity ?? spot.quantity} of {spot.quantity} spaces
```

### 5. Update Dashboard.tsx Badge Text

**File**: `src/pages/Dashboard.tsx`

```typescript
// From:
{listing.quantity} spots

// To:
{listing.quantity} spaces
```

---

## Summary of Changes

| File | Change |
|------|--------|
| `src/pages/ListSpot.tsx` | Update terminology: "spots" → "spaces" |
| `src/pages/EditSpot.tsx` | Update terminology: "spots" → "spaces" |
| `src/pages/SpotDetail.tsx` | Add dynamic available quantity calculation, update badge to "X of Y spaces available" |
| `src/components/explore/DesktopSpotList.tsx` | Add "spaces" to availability badge |
| `src/pages/Dashboard.tsx` | Update badge: "spots" → "spaces" |

---

## Technical Note: Quantity Already Works

The quantity field is **already functional** in both ListSpot and EditSpot:
- ListSpot.tsx line 97: `const [quantity, setQuantity] = useState<number>(1);`
- ListSpot.tsx line 495: `quantity: quantity,` (saved to database)
- EditSpot.tsx line 240: `const [quantity, setQuantity] = useState<number>(1);`
- EditSpot.tsx line 355: `setQuantity(spotData.quantity || 1);` (loaded from database)
- EditSpot.tsx line 703: `quantity: quantity,` (saved on update)

The issue may have been that the user didn't scroll down to see the quantity field, or the category wasn't selected (the field only appears after selecting a spot type).

