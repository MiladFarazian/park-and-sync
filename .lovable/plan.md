

## Make Instant Book Toggle More Obvious

### What Changes
When the toggle is ON, it shows "Instant Book" with a bolt icon (current behavior). When toggled OFF, the label dynamically changes to "Requires Confirmation" with a shield/check icon, making the current state immediately clear.

### Visual Design

**Toggle ON (Instant Book)**
- Icon: Bolt (amber background) -- unchanged
- Label: "Instant Book"
- Description: "Allow drivers to book without your approval"

**Toggle OFF (Requires Confirmation)**
- Icon: ShieldCheck (blue background)
- Label: "Requires Confirmation"
- Description: "You'll need to approve each booking request"

### Files to Modify

| File | Change |
|------|--------|
| `src/pages/ListSpot.tsx` (lines 1145-1167) | Make icon, label, and description dynamic based on `instantBook` state |
| `src/pages/EditSpot.tsx` (lines 956-978) | Same dynamic toggle treatment |

### Technical Details

Both files have identical toggle blocks. Each will be updated to conditionally render:

```tsx
<div className={`p-2 rounded-lg ${instantBook ? 'bg-amber-100 dark:bg-amber-900' : 'bg-blue-100 dark:bg-blue-900'}`}>
  {instantBook 
    ? <BoltIcon className="h-5 w-5 text-amber-600 dark:text-amber-400" />
    : <ShieldCheck className="h-5 w-5 text-blue-600 dark:text-blue-400" />
  }
</div>
<div>
  <Label htmlFor="instant-book" className="text-base font-medium cursor-pointer">
    {instantBook ? 'Instant Book' : 'Requires Confirmation'}
  </Label>
  <p className="text-sm text-muted-foreground">
    {instantBook 
      ? 'Allow drivers to book without your approval'
      : "You'll need to approve each booking request"
    }
  </p>
</div>
```

The `ShieldCheck` icon import will be added to both files from `lucide-react`.
