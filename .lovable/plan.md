

## Add Platform Fee Disclosure to Pricing Inputs

### Goal
Display a brief statement near all pricing-related inputs informing hosts that Parkzy takes a 10% platform fee from their earnings.

---

### Changes Required

#### 1. ListSpot.tsx (Step 1: Basic Information - Hourly Rate field)
**Location:** After the hourly rate input (around line 943)

Add helper text below the input field:
```tsx
<p className="text-xs text-muted-foreground mt-1">
  Parkzy takes 10% of your earnings as a service fee
</p>
```

This appears right after the validation error message (if any), providing context as hosts set their rate.

---

#### 2. EditSpot.tsx (Hourly Rate field)
**Location:** After the hourly rate input (around line 819)

Add the same helper text:
```tsx
<p className="text-xs text-muted-foreground mt-1">
  Parkzy takes 10% of your earnings as a service fee
</p>
```

---

#### 3. ManageAvailability.tsx (Price Override sections)
Two locations need this disclosure:

**A) Default Custom Rate section (around line 1215-1217)**
Update the existing helper text to include the fee disclosure:
```tsx
<p className="text-xs text-muted-foreground">
  Leave blank to use each spot's default hourly rate. Parkzy takes 10% of your earnings as a service fee.
</p>
```

**B) Per-block custom rate input (around line 1176)**
Add helper text below the input:
```tsx
<p className="text-xs text-muted-foreground mt-0.5">
  10% service fee applies
</p>
```
This is a shorter version since space is limited in the time block cards.

---

### Visual Consistency
- All disclosures use `text-xs text-muted-foreground` for subtle but readable styling
- Messaging is consistent: "Parkzy takes 10% of your earnings as a service fee"
- Shorter variant used where space is constrained

---

### Files to Modify
| File | Location | Change |
|------|----------|--------|
| `src/pages/ListSpot.tsx` | ~line 943 | Add fee disclosure after hourly rate input |
| `src/pages/EditSpot.tsx` | ~line 819 | Add fee disclosure after hourly rate input |
| `src/pages/ManageAvailability.tsx` | ~line 1176 | Add short fee note to per-block rate |
| `src/pages/ManageAvailability.tsx` | ~line 1215-1217 | Append fee disclosure to existing helper text |

