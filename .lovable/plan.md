
# Fix Quantity Input to Allow Clearing Before Typing New Value

## Problem

When listing multiple identical parking spaces, the host cannot delete the "1" from the quantity input field to type a new number. The current code immediately resets the value to `1` when the input is cleared, making editing frustrating.

**Root cause:** Both `ListSpot.tsx` and `EditSpot.tsx` have:
```typescript
onChange={(e) => setQuantity(Math.max(1, Math.min(1000, parseInt(e.target.value) || 1)))}
```

When the user clears the input:
1. `e.target.value` becomes `""`
2. `parseInt("")` returns `NaN`
3. `NaN || 1` evaluates to `1`
4. Input immediately snaps back to `1`

---

## Solution

Use a **local string state** for the input value, allowing the field to be empty while typing. Only enforce the minimum value of `1` when the input loses focus (on blur) or during form validation.

### Approach: Temporary String Display Value

1. Track a `quantityDisplay` string state alongside the numeric `quantity`
2. Allow the input to be empty or contain any typed value
3. On blur, validate and snap to valid range (1-1000)
4. On submit, ensure minimum of 1

---

## Files to Change

### 1. `src/pages/ListSpot.tsx`

**Add state** (around line 97):
```typescript
const [quantity, setQuantity] = useState<number>(1);
const [quantityDisplay, setQuantityDisplay] = useState<string>('1');
```

**Update the Input component** (around line 833-841):
```tsx
<Input
  id="quantity"
  type="number"
  min="1"
  max="1000"
  value={quantityDisplay}
  onChange={(e) => {
    const val = e.target.value;
    setQuantityDisplay(val);
    const parsed = parseInt(val);
    if (!isNaN(parsed)) {
      setQuantity(Math.max(1, Math.min(1000, parsed)));
    }
  }}
  onBlur={() => {
    // Snap to valid value on blur
    const parsed = parseInt(quantityDisplay);
    const validValue = isNaN(parsed) ? 1 : Math.max(1, Math.min(1000, parsed));
    setQuantity(validValue);
    setQuantityDisplay(String(validValue));
  }}
  className="w-28"
/>
```

**Update draft restoration** (around line 196-200) to also set `quantityDisplay` if quantity is included in the draft.

---

### 2. `src/pages/EditSpot.tsx`

**Add state** (around line 240):
```typescript
const [quantity, setQuantity] = useState<number>(1);
const [quantityDisplay, setQuantityDisplay] = useState<string>('1');
```

**Update data loading** (around line 355):
```typescript
setQuantity(spotData.quantity || 1);
setQuantityDisplay(String(spotData.quantity || 1));
```

**Update the Input component** (around line 829-837):
```tsx
<Input
  id="quantity"
  type="number"
  min="1"
  max="1000"
  value={quantityDisplay}
  onChange={(e) => {
    const val = e.target.value;
    setQuantityDisplay(val);
    const parsed = parseInt(val);
    if (!isNaN(parsed)) {
      setQuantity(Math.max(1, Math.min(1000, parsed)));
    }
  }}
  onBlur={() => {
    const parsed = parseInt(quantityDisplay);
    const validValue = isNaN(parsed) ? 1 : Math.max(1, Math.min(1000, parsed));
    setQuantity(validValue);
    setQuantityDisplay(String(validValue));
  }}
  className="w-28"
/>
```

---

## User Experience

| Action | Before | After |
|--------|--------|-------|
| Select all + delete "1" | Snaps back to 1 | Field becomes empty |
| Type "25" after clearing | Impossible | Works: field shows "25" |
| Leave field empty + blur | N/A | Resets to "1" |
| Type "9999" + blur | Shows 9999 | Corrects to "1000" |
| Type "0" + blur | Shows 0 | Corrects to "1" |

---

## Validation Behavior

- **While typing:** No restrictions (allows empty/out-of-range temporarily)
- **On blur:** Snaps to valid range [1, 1000]
- **On submit:** Uses the numeric `quantity` state which is always valid
