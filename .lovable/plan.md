
# Plan: Make "Find Parking" Links Use Current Location Automatically

## Problem
The "Find Parking" links in the **top navigation bar** (DesktopHeader) and **Footer** currently just navigate to `/explore` without any location parameters, resulting in a blank page or requiring manual location input.

## Solution
Convert these links from simple `NavLink`/`Link` components to click handlers that:
1. Request the user's current GPS coordinates via `navigator.geolocation`
2. Navigate to `/explore` with the resolved `lat` and `lng` parameters
3. Show a loading state while fetching location
4. Fall back to a default location if geolocation fails or is denied

## Changes Required

### 1. DesktopHeader.tsx
- Add a `handleFindParkingClick` async function that:
  - Gets current position via `navigator.geolocation.getCurrentPosition()`
  - Navigates to `/explore?lat=...&lng=...&q=Current Location`
  - Falls back to default LA coordinates if geolocation fails
- Add loading state (`isGettingLocation`) to show feedback during GPS lookup
- Replace the `NavLink` for "Find Parking" with a clickable element that calls this handler
- Keep other nav items as regular `NavLink` components

### 2. Footer.tsx
- Add `useNavigate` hook (currently only uses `Link`)
- Add similar `handleFindParkingClick` async function
- Replace the "Find Parking" `Link` with a clickable element that triggers the GPS-based navigation
- Add loading state for user feedback

## Technical Details

```text
Click "Find Parking" (Header or Footer)
         │
         ▼
┌─────────────────────────┐
│ Check geolocation API   │
└─────────────────────────┘
         │
    ┌────┴────┐
    ▼         ▼
Available   Unavailable
    │           │
    ▼           ▼
Get GPS     Use default
coords      LA coords
    │           │
    └─────┬─────┘
          ▼
Navigate to /explore?lat=...&lng=...&q=Current Location
```

### Default Fallback Location
If geolocation fails or is denied, use:
- lat: 34.0224 (University Park, Los Angeles)
- lng: -118.2851
- query: "Los Angeles, CA"

### Loading State
While fetching GPS:
- Disable the nav item or show a subtle loading indicator
- Prevent double-clicks

## Files to Modify
1. `src/components/layout/DesktopHeader.tsx` - Replace NavLink with click handler for "Find Parking"
2. `src/components/layout/Footer.tsx` - Replace Link with click handler for "Find Parking"
