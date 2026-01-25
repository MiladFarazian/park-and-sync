

# Plan: Fix Desktop Footer Links

## Problem
The footer links on the desktop homepage have three issues:

1. **"Find Parking"** → Currently links to `/explore` without location params, showing an empty search state instead of the user's current location
2. **Host Links** → "List Your Spot", "Manage Listings", and "Host Dashboard" navigate directly to host pages without switching to host mode first
3. **"Contact Us"** → Links to `/messages` but should open the Parkzy Support chat directly

## Solution

### 1. Find Parking - Use Current Location

Convert to a click handler that:
- Gets the user's current geolocation
- Navigates to `/explore?lat=...&lng=...` with current location
- Falls back to `/explore` if geolocation fails

### 2. Host Links - Switch Mode First

For all three host links, create click handlers that:
- Call `setMode('host')` from the ModeContext
- Then navigate to the appropriate page

### 3. Contact Us - Link to Support Chat

Change the link from `/messages` to `/messages?userId=00000000-0000-0000-0000-000000000001` to open the Parkzy Support conversation directly.

## Implementation Details

### File to Modify

| File | Changes |
|------|---------|
| `src/components/layout/Footer.tsx` | Add click handlers for Find Parking and Host links, update Contact Us URL |

### Technical Changes

**Add Imports:**
```typescript
import { useNavigate } from 'react-router-dom';
import { useMode } from '@/contexts/ModeContext';
import { SUPPORT_USER_ID } from '@/hooks/useSupportRole';
```

**Find Parking Handler:**
```typescript
const handleFindParking = () => {
  if (navigator.geolocation) {
    navigator.geolocation.getCurrentPosition(
      (position) => {
        const now = new Date();
        const twoHoursLater = new Date(now.getTime() + 2 * 60 * 60 * 1000);
        navigate(`/explore?lat=${position.coords.latitude}&lng=${position.coords.longitude}&start=${now.toISOString()}&end=${twoHoursLater.toISOString()}`);
      },
      () => {
        // Fallback if location fails
        navigate('/explore');
      },
      { timeout: 5000 }
    );
  } else {
    navigate('/explore');
  }
};
```

**Host Links Handler:**
```typescript
const handleHostLink = (path: string) => {
  setMode('host');
  navigate(path);
};
```

**Contact Us Link Update:**
```typescript
<Link to={`/messages?userId=${SUPPORT_USER_ID}`}>
  Contact Us
</Link>
```

### UI Changes

| Link | Before | After |
|------|--------|-------|
| Find Parking | `<Link to="/explore">` | `<button onClick={handleFindParking}>` |
| List Your Spot | `<Link to="/list-spot">` | `<button onClick={() => handleHostLink('/list-spot')}>` |
| Manage Listings | `<Link to="/dashboard">` | `<button onClick={() => handleHostLink('/dashboard')}>` |
| Host Dashboard | `<Link to="/host-home">` | `<button onClick={() => handleHostLink('/host-home')}>` |
| Contact Us | `<Link to="/messages">` | `<Link to="/messages?userId=00000000-...">` |

## Summary

This update ensures all footer links work correctly:
- "Find Parking" uses the browser's geolocation to search near the user
- Host links properly switch to host mode before navigation (triggers the mode loading overlay)
- "Contact Us" opens a direct chat with Parkzy Support

