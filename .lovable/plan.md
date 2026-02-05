
## Fix "List Your Spot" Quick Actions Across the App

### Problem
Multiple "List Your Spot" buttons across the app have inconsistent navigation behavior:
1. **Profile.tsx** (lines 609-612): Same race condition as Home.tsx - calls `setMode` before `navigate`, causing redirect to `/host-home`
2. **DesktopHeader.tsx**, **hero-section.tsx**, **cta-section.tsx**: Navigate directly to `/list-spot` without setting host mode, which may fail with `RequireHostMode` wrapper

### Solution
Apply the same fix pattern from Home.tsx to all "List Your Spot" navigation handlers:
1. Navigate first with `replace: true` to start route transition
2. Then set mode to 'host' so `RequireHostMode` sees correct mode when ListSpot mounts

---

### Technical Changes

#### File 1: `src/pages/Profile.tsx`

**Location**: Lines 609-612

**Current code**:
```typescript
onClick: () => {
  setMode('host');
  navigate('/list-spot');
}
```

**New code**:
```typescript
onClick: () => {
  // Navigate first to prevent race condition with mode-watching useEffects
  navigate('/list-spot', { replace: true });
  // Then set mode - ListSpot's RequireHostMode will see 'host' mode
  setMode('host', false);
}
```

#### File 2: `src/components/layout/DesktopHeader.tsx`

**Location**: Line 227

**Current code**:
```typescript
<DropdownMenuItem onClick={() => navigate('/list-spot')}>
```

**New code**:
```typescript
<DropdownMenuItem onClick={() => {
  navigate('/list-spot', { replace: true });
  setMode('host', false);
}}>
```

**Location**: Line 250

**Current code**:
```typescript
<DropdownMenuItem onClick={() => navigate('/list-spot')}>
```

**New code**:
```typescript
<DropdownMenuItem onClick={() => {
  navigate('/list-spot', { replace: true });
  setMode('host', false);
}}>
```

#### File 3: `src/components/ui/hero-section.tsx`

**Location**: Line 219

**Current code**:
```typescript
onClick={() => navigate('/list-spot')}
```

**New code**:
```typescript
onClick={() => {
  navigate('/list-spot', { replace: true });
  setMode('host', false);
}}
```

*Note: Will need to import `useMode` from `@/contexts/ModeContext`*

#### File 4: `src/components/ui/cta-section.tsx`

**Location**: Line 56

**Current code**:
```typescript
onClick={() => navigate('/list-spot')}
```

**New code**:
```typescript
onClick={() => {
  navigate('/list-spot', { replace: true });
  setMode('host', false);
}}
```

*Note: Will need to import `useMode` from `@/contexts/ModeContext`*

---

### Files to Modify
| File | Lines | Change |
|------|-------|--------|
| `src/pages/Profile.tsx` | 609-612 | Reorder navigate/setMode, add `replace: true` |
| `src/components/layout/DesktopHeader.tsx` | 227, 250 | Add mode switch after navigation |
| `src/components/ui/hero-section.tsx` | 219 | Add mode switch after navigation, add useMode import |
| `src/components/ui/cta-section.tsx` | 56 | Add mode switch after navigation, add useMode import |

---

### Why This Pattern Works
1. `navigate('/list-spot', { replace: true })` starts the route transition immediately
2. `setMode('host', false)` updates context synchronously after navigation starts
3. By the time ListSpot mounts, `RequireHostMode` sees `mode === 'host'` ✓
4. No race conditions with mode-watching useEffects on the source page
