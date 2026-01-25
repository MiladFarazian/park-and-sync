
# Plan: Remove Auto-Location from Hero Section "Find Parking Spots" Button

## Problem
The "Find Parking Spots" button in the Hero Section on the `/` page currently auto-triggers GPS location lookup when no location is entered. This behavior was mistakenly applied here - it was only intended for the "Find Parking" links in the Nav bar and Footer.

The Hero Section should require users to manually input a location in the "Where do you need parking?" field before searching.

## Solution
Simplify the `handleSearch` function to only navigate when:
1. Coordinates have been selected (from the location input)
2. A text query has been typed

If neither condition is met, the button should do nothing (or optionally show a validation message).

## Changes Required

### File: `src/components/ui/hero-section.tsx`

1. **Remove the `isGettingLocation` state** (line 24) - no longer needed since we won't auto-fetch GPS
2. **Remove the `Loader2` import** if no longer used elsewhere
3. **Simplify `handleSearch` function** (lines 55-96):
   - Keep the logic for when `searchCoords` exists (navigate with coordinates)
   - Keep the logic for when `searchLocation.trim()` exists (navigate with query)
   - Remove the entire GPS auto-fetch block (lines 70-95)
   - Add an early return or no-op when no location is provided
4. **Update the Button** (lines 188-202):
   - Remove the `disabled={isGettingLocation}` prop
   - Remove the loading state conditional rendering
   - Optionally disable the button when no location is entered for better UX

## Technical Details

The simplified `handleSearch` will be:

```text
handleSearch()
      │
      ▼
┌─────────────────────────┐
│ Has searchCoords?       │──Yes──▶ Navigate with lat/lng
└─────────────────────────┘
      │ No
      ▼
┌─────────────────────────┐
│ Has searchLocation text?│──Yes──▶ Navigate with query
└─────────────────────────┘
      │ No
      ▼
   Do nothing (require input)
```

## Updated Code Summary

The `handleSearch` function will become a simple synchronous function:
- Navigate with coordinates if available
- Navigate with text query if typed
- Otherwise, do nothing (user must enter a location first)

The button can optionally be disabled when `!searchLocation.trim()` to provide clear feedback that input is required.
