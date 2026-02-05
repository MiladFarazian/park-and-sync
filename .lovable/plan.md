

## Fix "List Your Spot" Being Redirected to Host Home

### Problem
When clicking "List Your Spot", the navigation flow is:
1. `setMode('host', false)` changes mode to 'host'
2. `navigate('/list-spot')` is called
3. **But** `Home.tsx` has a `useEffect` (lines 62-69) that watches for mode changes
4. When mode becomes 'host', it redirects to `/host-home` before the `/list-spot` navigation completes

### Root Cause
The `useEffect` in Home.tsx that redirects to `/host-home` when mode is 'host' is interfering with direct navigation to host routes:

```tsx
useEffect(() => {
  const fromLogoClick = (location.state as { fromLogoClick?: boolean })?.fromLogoClick;
  if (mode === 'host' && !fromLogoClick) {
    navigate('/host-home', { replace: true });
  }
}, [mode, navigate, location.state]);
```

### Solution
Update the click handler to navigate **before** switching mode. Since `/list-spot` is wrapped in `RequireHostMode`, we need a different approach:

**Use `replace: true` navigation** which happens synchronously and takes priority over the useEffect redirect. Navigate with `replace: true` to immediately take the user to `/list-spot` before the mode-watching effect can fire.

Actually, the cleaner fix is to **reorder the operations** and use `setTimeout` to ensure navigation happens after the current render cycle but before the useEffect in Home.tsx can redirect:

```typescript
onClick: () => {
  if (!user) {
    navigate('/auth', { state: { from: '/list-spot', intendedMode: 'host' } });
    return;
  }
  // Navigate first with replace to prevent back-button issues
  navigate('/list-spot', { replace: true });
  // Then switch mode - ListSpot's RequireHostMode will see the new mode
  setMode('host', false);
}
```

Wait - this won't work because `RequireHostMode` checks mode synchronously.

**Better solution**: Add a state flag similar to `fromLogoClick` to indicate we're intentionally going to a host route:

```typescript
onClick: () => {
  if (!user) {
    navigate('/auth', { state: { from: '/list-spot', intendedMode: 'host' } });
    return;
  }
  setMode('host', false);
  navigate('/list-spot', { state: { directHostNavigation: true } });
}
```

Then update the useEffect to check for this flag... but wait, this useEffect is in Home.tsx and we're navigating away from Home.tsx, so actually the issue is different.

Let me reconsider: The user is ON `/` (Home), clicks the button which:
1. Sets mode to 'host'
2. Navigates to `/list-spot`

But the navigation triggers a re-render of Home.tsx with mode='host', and the useEffect fires before navigation completes, redirecting to `/host-home`.

**The actual fix**: Use `replace: true` in the navigate call AND navigate before setting mode, then set mode in the next tick:

```typescript
onClick: () => {
  if (!user) {
    navigate('/auth', { state: { from: '/list-spot', intendedMode: 'host' } });
    return;
  }
  // Navigate immediately - this unmounts Home.tsx
  navigate('/list-spot', { replace: true });
  // Set mode after navigation starts (for RequireHostMode on ListSpot)
  setMode('host', false);
}
```

This should work because:
1. `navigate()` starts the route transition immediately
2. `setMode()` updates context
3. By the time ListSpot mounts, mode is 'host'
4. Home.tsx is being unmounted, so its useEffect won't redirect

---

### Technical Changes

#### File: `src/pages/Home.tsx`

**Location**: Lines 459-466

**Current code**:
```typescript
onClick: () => {
  if (!user) {
    navigate('/auth', { state: { from: '/list-spot', intendedMode: 'host' } });
    return;
  }
  setMode('host', false); // Instant switch, no overlay
  navigate('/list-spot');
},
```

**New code**:
```typescript
onClick: () => {
  if (!user) {
    navigate('/auth', { state: { from: '/list-spot', intendedMode: 'host' } });
    return;
  }
  // Navigate first to unmount Home.tsx before mode change triggers redirect
  navigate('/list-spot', { replace: true });
  // Then set mode - ListSpot's RequireHostMode will see 'host' mode
  setMode('host', false);
},
```

---

### Files to Modify
| File | Lines | Change |
|------|-------|--------|
| `src/pages/Home.tsx` | 459-466 | Reorder to navigate first, then set mode; add `replace: true` |

---

### Why This Works
1. **`navigate()` with `replace: true`** immediately starts the route transition and begins unmounting Home.tsx
2. **`setMode('host', false)`** updates context state synchronously after navigation starts
3. By the time React processes the next render cycle, Home.tsx is unmounted so its useEffect doesn't fire
4. ListSpot mounts and `RequireHostMode` sees `mode === 'host'` ✓
5. User lands on `/list-spot` as expected

