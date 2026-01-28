

# Plan: Fix Time Initialization - Remove 1-Hour Offset

## Problem

Both desktop (HeroSection) and mobile (Home.tsx) incorrectly add a 1-hour offset to the start time. The correct behavior should be:
- **Start time**: Current time (no offset)
- **End time**: 2 hours from now

## Files to Modify

### 1. `src/components/ui/hero-section.tsx`

**Line 27-28** - Change from:
```typescript
const [startTime, setStartTime] = useState<Date>(addHours(new Date(), 1));
const [endTime, setEndTime] = useState<Date>(addHours(new Date(), 3));
```

To:
```typescript
const [startTime, setStartTime] = useState<Date>(new Date());
const [endTime, setEndTime] = useState<Date>(addHours(new Date(), 2));
```

### 2. `src/pages/Home.tsx`

**Lines 41-48** - Change from:
```typescript
const [startTime, setStartTime] = useState(() => {
  const now = new Date();
  return new Date(now.getTime() + 60 * 60 * 1000); // 1 hour from now
});
const [endTime, setEndTime] = useState(() => {
  const now = new Date();
  return new Date(now.getTime() + 3 * 60 * 60 * 1000); // 3 hours from now
});
```

To:
```typescript
const [startTime, setStartTime] = useState(() => new Date());
const [endTime, setEndTime] = useState(() => {
  const now = new Date();
  return new Date(now.getTime() + 2 * 60 * 60 * 1000); // 2 hours from now
});
```

## Summary

| File | Change |
|------|--------|
| `src/components/ui/hero-section.tsx` | Start = now, End = 2 hours from now |
| `src/pages/Home.tsx` | Start = now, End = 2 hours from now |

