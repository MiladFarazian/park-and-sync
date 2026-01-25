
# Plan: Fix Contact Us / Contact Support Links to Open Parkzy Support Chat

## Problem

Two links in the app navigate to `/messages` but should navigate directly to the Parkzy Support chat:

1. **Footer "Contact Us"** (line 72-74 in `Footer.tsx`) - Currently links to `/messages`
2. **Docs "Contact Support" button** (line 629 in `Docs.tsx`) - Currently navigates to `/messages`

Both should open the Parkzy Support conversation directly using the support user ID query parameter.

## Solution

Update both links to include the `userId` query parameter pointing to the Parkzy Support account (`00000000-0000-0000-0000-000000000001`).

## Implementation Details

### Files to Modify

| File | Change |
|------|--------|
| `src/components/layout/Footer.tsx` | Import `SUPPORT_USER_ID` and update Contact Us link |
| `src/pages/Docs.tsx` | Import `SUPPORT_USER_ID` and update Contact Support button |

### Changes

**Footer.tsx:**
```tsx
// Add import
import { SUPPORT_USER_ID } from '@/hooks/useSupportRole';

// Update line 72-74
<Link to={`/messages?userId=${SUPPORT_USER_ID}`} className="hover:text-foreground transition-colors">
  Contact Us
</Link>
```

**Docs.tsx:**
```tsx
// Add import
import { SUPPORT_USER_ID } from '@/hooks/useSupportRole';

// Update line 629
<Button onClick={() => navigate(`/messages?userId=${SUPPORT_USER_ID}`)}>
  Contact Support
</Button>
```

## Summary

This is a simple two-file update that ensures clicking "Contact Us" in the footer or "Contact Support" in the Help Center opens a direct chat with Parkzy Support rather than just the general messages inbox.
