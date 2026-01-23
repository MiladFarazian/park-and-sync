

## Remove Privacy Settings System

### Problem
The privacy settings feature (show profile photo, show full name, appear in reviews) was deprecated but code traces remain throughout the app, causing issues like "Hosted by Host" when a host has `privacy_show_full_name` set to `false`.

### Solution
Remove all privacy settings code and replace with simple display name formatting: **First Name + Last Initial** (e.g., "Milad F.") for everyone.

---

### Files to Modify

#### 1. Delete `src/lib/privacyUtils.ts`
Remove this entire file.

#### 2. Delete `src/components/settings/PrivacySettingsDialog.tsx`
Remove this unused component.

#### 3. Create `src/lib/displayUtils.ts` (replacement helper)
Simple utility with no privacy checks:
```typescript
export function formatDisplayName(
  profile: { first_name?: string | null; last_name?: string | null } | null | undefined,
  fallback: string = 'User'
): string {
  if (!profile) return fallback;
  const first = profile.first_name?.trim() || '';
  const lastInitial = profile.last_name?.trim()?.[0] || '';
  if (!first && !lastInitial) return fallback;
  return lastInitial ? `${first} ${lastInitial}.` : first;
}
```

#### 4. Update Files Using Privacy Utils

| File | Changes |
|------|---------|
| `src/pages/Booking.tsx` | Replace `getPrivacyAwareName`/`getPrivacyAwareAvatar` with `formatDisplayName` and direct avatar access. Remove `privacy_*` from select queries. |
| `src/pages/BookingDetail.tsx` | Same as above. Remove `privacy_*` fields from interface and queries. |
| `src/pages/Messages.tsx` | Replace privacy functions, remove `privacy_*` from queries. |
| `src/pages/SpotDetail.tsx` | Replace privacy functions, remove `privacy_*` from queries. |
| `src/pages/Profile.tsx` | Replace `getReviewerDisplayInfo` with `formatDisplayName`, remove `privacy_*` from queries. |
| `src/pages/Reviews.tsx` | Same as Profile.tsx. |
| `src/components/host/RecentReviews.tsx` | Already uses direct `first_name`/`last_name` - no changes needed. |
| `src/components/messages/BookingContextHeader.tsx` | Check for privacy imports. |

#### 5. Database Columns (Optional Future Cleanup)
The `privacy_show_profile_photo`, `privacy_show_full_name`, and `privacy_show_in_reviews` columns in the `profiles` table can be dropped via migration, but this is optional since unused columns don't cause harm.

---

### Summary of Changes

**Deletions:**
- `src/lib/privacyUtils.ts`
- `src/components/settings/PrivacySettingsDialog.tsx`

**New File:**
- `src/lib/displayUtils.ts` - Simple name formatter

**Updates (6 files):**
- `src/pages/Booking.tsx`
- `src/pages/BookingDetail.tsx`
- `src/pages/Messages.tsx`
- `src/pages/SpotDetail.tsx`
- `src/pages/Profile.tsx`
- `src/pages/Reviews.tsx`

### Pattern Replacement

| Before | After |
|--------|-------|
| `getPrivacyAwareName(profile, 'Host')` | `formatDisplayName(profile, 'Host')` |
| `getPrivacyAwareAvatar(profile)` | `profile?.avatar_url \|\| undefined` |
| `getReviewerDisplayInfo(profile, 'Driver')` | `{ name: formatDisplayName(profile, 'Driver'), avatar: profile?.avatar_url }` |
| `privacy_show_profile_photo, privacy_show_full_name` in queries | Remove these fields |

