
## Fix "List Your Spot" Navigation on Driver Home

### Problem
When a logged-in user clicks "List Your Spot" from the Driver Home page, they are taken to the **Host Dashboard** (`/dashboard`) instead of the **List Spot** page (`/list-spot`).

### Root Cause
In `src/pages/Home.tsx`, the "List Your Spot" quick action button is configured to:
1. Switch to host mode
2. Navigate to `/dashboard`

This is incorrect — users expect to go directly to the listing flow when clicking "List Your Spot".

### Solution
Update the quick action's `onClick` handler to:
1. **Check if user is logged in** — if not, redirect to `/auth` with intended destination
2. Switch to host mode (with instant switch, no overlay, to prevent race conditions)
3. Navigate to `/list-spot` instead of `/dashboard`

---

### Technical Changes

#### File: `src/pages/Home.tsx`

**Location**: Lines 457-462 (the "List Your Spot" quick action)

**Current code**:
```typescript
{
  icon: Plus,
  label: 'List Your Spot',
  onClick: () => {
    setMode('host');
    navigate('/dashboard');
  },
},
```

**New code**:
```typescript
{
  icon: Plus,
  label: 'List Your Spot',
  onClick: () => {
    if (!user) {
      navigate('/auth', { state: { from: '/list-spot', intendedMode: 'host' } });
      return;
    }
    setMode('host', false); // Instant switch, no overlay
    navigate('/list-spot');
  },
},
```

---

### Files to Modify
| File | Lines | Change |
|------|-------|--------|
| `src/pages/Home.tsx` | 457-462 | Navigate to `/list-spot` instead of `/dashboard`, add auth check |

---

### User Experience After Fix
- **Logged-in users**: Click "List Your Spot" → immediately taken to the spot listing form
- **Logged-out users**: Click "List Your Spot" → redirected to login, then to `/list-spot` after authentication
- No more confusing detour through the host dashboard
