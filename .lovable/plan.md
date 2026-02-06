
## Disable Swipe-Back Navigation on Weekly Schedule Page (Step 4)

### Problem
The "List Your Spot" flow uses horizontal swipe gestures to navigate between steps (swipe right = go back). However, on **Step 4 (Weekly Schedule)**, the `WeeklyScheduleGrid` component requires horizontal touch interactions for selecting time slots. The swipe-back gesture is likely interfering with this interaction or causing accidental navigation.

### Solution
Conditionally disable swipe-back navigation when the user is on step 4 (the Weekly Schedule page). We'll modify the `useSwipeNavigation` hook's `onSwipeRight` callback to do nothing when `currentStep === 4`.

---

### Technical Changes

#### File: `src/pages/ListSpot.tsx`

**Location**: Lines 759-770

**Current code**:
```typescript
// Swipe navigation for multi-step form
const swipeHandlers = useSwipeNavigation({
  onSwipeLeft: () => {}, // No action on swipe left
  onSwipeRight: () => {
    if (currentStep === 1) {
      navigate('/dashboard');
    } else {
      setCurrentStep(currentStep - 1);
    }
  },
  threshold: 50,
});
```

**New code**:
```typescript
// Swipe navigation for multi-step form
// Disabled on step 4 (Weekly Schedule) to prevent interference with grid interactions
const swipeHandlers = useSwipeNavigation({
  onSwipeLeft: () => {}, // No action on swipe left
  onSwipeRight: () => {
    // Skip swipe-back on step 4 (Weekly Schedule) - grid uses horizontal touch gestures
    if (currentStep === 4) return;
    
    if (currentStep === 1) {
      navigate('/dashboard');
    } else {
      setCurrentStep(currentStep - 1);
    }
  },
  threshold: 50,
});
```

---

### Files to Modify
| File | Lines | Change |
|------|-------|--------|
| `src/pages/ListSpot.tsx` | 759-770 | Add early return when `currentStep === 4` in `onSwipeRight` handler |

---

### Why This Works
1. The `onSwipeRight` callback now checks if the user is on step 4
2. If on step 4, the swipe gesture is ignored (does nothing)
3. The back button on step 4 still works normally (lines 1220-1226)
4. All other steps retain their swipe-back functionality
5. The `WeeklyScheduleGrid` can now handle horizontal touch interactions without interference
