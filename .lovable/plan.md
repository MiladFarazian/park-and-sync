
# Plan: Align Earnings Calculations Across Host Views

## Problem Summary

The "Total Earnings" shown per listing in the **Listings tab** (Dashboard.tsx) does not match the figures displayed in:
- The **Host Dashboard** "All-Time Earnings" card
- The **Earnings by Spot** widget
- The individual **Spot Earnings History** pages

## Root Cause

Two issues in `src/pages/Dashboard.tsx`:

1. **Status filter mismatch**: The bookings query only includes `'completed'` status, while all other earnings views include `['completed', 'active', 'paid']`:

```typescript
// Dashboard.tsx (line 127) - INCORRECT
.eq('status', 'completed')

// vs. HostHome.tsx, EarningsBySpot.tsx, SpotEarningsHistory.tsx - CORRECT
.in('status', ['completed', 'active', 'paid'])
```

2. **Missing `extension_charges` field**: The booking query doesn't select `extension_charges`, which is required by `getHostNetEarnings()` to calculate correct earnings for bookings that were extended:

```typescript
// Dashboard.tsx (line 125) - Missing extension_charges
.select('id, spot_id, host_earnings, hourly_rate, start_at, end_at, status')

// vs. HostHome.tsx (line 82) - Has extension_charges
.select('host_earnings, hourly_rate, start_at, end_at, status, extension_charges')
```

## Impact

- **Active bookings** (currently in progress) are not counted in listing earnings
- **Paid bookings** (approved but not yet started) are not counted
- **Extended bookings** may show incorrect earnings due to missing `extension_charges`

This causes the per-listing "Total Earnings" to be lower than expected, while the dashboard total and earnings history show higher (correct) figures.

## Solution

Update `src/pages/Dashboard.tsx` to match the earnings calculation logic used everywhere else:

### Change 1: Update status filter (line 127)

```typescript
// From:
.eq('status', 'completed')

// To:
.in('status', ['completed', 'active', 'paid'])
```

### Change 2: Add extension_charges to query (line 125)

```typescript
// From:
.select('id, spot_id, host_earnings, hourly_rate, start_at, end_at, status')

// To:
.select('id, spot_id, host_earnings, hourly_rate, start_at, end_at, status, extension_charges')
```

## Files to Modify

| File | Change |
|------|--------|
| `src/pages/Dashboard.tsx` | Update booking query to include correct statuses and extension_charges field |

## Expected Result

After the fix:
- Per-listing "Total Earnings" in the Listings tab will match the figures in EarningsBySpot widget
- Dashboard total will equal the sum of all individual listing earnings
- Spot Earnings History totals will match their respective listing card totals

## Verification

1. Navigate to Host Dashboard → note the "All-Time Earnings" total
2. Navigate to Listings tab → sum up all "Total Earnings" per listing
3. Values should now match
4. Click into any spot's Earnings History → total should match the listing card
