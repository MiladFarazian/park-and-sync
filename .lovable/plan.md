

## Add 20-Character Minimum for EV Charging Instructions

### Goal
Require hosts to provide at least 20 characters for EV charging instructions when enabling EV charging on their spot. This ensures drivers receive meaningful information about how to use the charging equipment.

---

### Changes Required

#### 1. ListSpot.tsx

**A) Add validation on submit** (around line 435, after the premium validation)
```typescript
if (hasEvCharging && evChargingInstructions.trim().length < 20) {
  toast.error('Please provide at least 20 characters of EV charging instructions');
  return;
}
```

**B) Add character count helper text** (around line 1121-1123, replace existing helper text)
```tsx
<p className="text-xs text-muted-foreground mt-1">
  These instructions will be shown to drivers who opt-in to EV charging (minimum 20 characters: {evChargingInstructions.trim().length}/20)
</p>
```

---

#### 2. EditSpot.tsx

**A) Add validation on submit** (around line 563, after the premium validation)
```typescript
if (hasEvCharging && evChargingInstructions.trim().length < 20) {
  toast.error('Please provide at least 20 characters of EV charging instructions');
  return;
}
```

**B) Add character count helper text** (around line 942-944, replace existing helper text)
```tsx
<p className="text-xs text-muted-foreground mt-1">
  These instructions will be shown to drivers who opt-in to EV charging (minimum 20 characters: {evChargingInstructions.trim().length}/20)
</p>
```

---

### User Experience
- Host sees a live character count (e.g., "5/20") as they type
- Count updates in real-time showing progress toward the 20-character minimum
- If they try to submit with fewer than 20 characters, they see a clear toast error
- The `.trim()` ensures whitespace-only inputs don't count toward the minimum

---

### Files to Modify
| File | Changes |
|------|---------|
| `src/pages/ListSpot.tsx` | Add validation check + update helper text with character count |
| `src/pages/EditSpot.tsx` | Add validation check + update helper text with character count |

