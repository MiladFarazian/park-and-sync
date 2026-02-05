

## Fix: EV Charging Instructions Validation on Step Navigation

### Problem Identified
The 20-character minimum validation for EV charging instructions only runs on **final form submission** (`onSubmit`). In the multi-step wizard, users can click "Next" on Step 3 and proceed to Step 4 without meeting the minimum character requirement because:

1. **`isStepValid()` for Step 3** (lines 630-639) checks vehicle size, charger type, and premium amount, but **not** the instructions length
2. **The "Next" button click handler** (lines 1186-1193) only validates vehicle size, then proceeds to Step 4

---

### Solution
Add the 20-character minimum check in **two places** in ListSpot.tsx:

#### 1. Update `isStepValid()` function (around line 636-638)
Add the instructions length check when EV charging is enabled:

```typescript
if (selectedAmenities.includes('ev')) {
  return evChargerType && 
         evChargingPremium && 
         parseFloat(evChargingPremium) > 0 &&
         evChargingInstructions.trim().length >= 20;
}
```

This will disable the "Next" button until the user enters at least 20 characters.

#### 2. Update the "Next" button click handler (around line 1186-1193)
Add a validation check with a toast message before proceeding:

```typescript
onClick={() => {
  if (selectedVehicleSizes.length === 0) {
    setVehicleSizeError('Please select at least one vehicle size');
    toast.error('Please select at least one vehicle size that can fit in your spot');
    return;
  }
  if (selectedAmenities.includes('ev') && evChargingInstructions.trim().length < 20) {
    toast.error('Please provide at least 20 characters of EV charging instructions');
    return;
  }
  setCurrentStep(4);
}}
```

This provides explicit feedback if they somehow bypass the disabled state.

---

### Files to Modify
| File | Location | Change |
|------|----------|--------|
| `src/pages/ListSpot.tsx` | ~line 637 | Add `evChargingInstructions.trim().length >= 20` to `isStepValid()` |
| `src/pages/ListSpot.tsx` | ~line 1186-1193 | Add EV instructions validation in Next button click handler |

---

### User Experience After Fix
- "Next" button on Step 3 will be **disabled** until EV charging instructions reach 20 characters (live character count already shows progress)
- If they click "Next" with insufficient characters, they see a toast error explaining the requirement
- The validation is consistent with the final submission validation
