
# Plan: Improve Desktop Profile Page Layout

## Overview
Enhance the desktop `/profile` page by making the purple profile header span the full page width and converting the settings menu from a vertical list to a 3-column grid on desktop.

## Current Issues

1. **Purple header card** is constrained inside the `max-w-2xl mx-auto` container, limiting its width on desktop
2. **Settings menu** displays as a single-column list with `space-y-3`, which wastes horizontal space on larger screens

## Solution

### 1. Full-Width Purple Header

Move the purple Profile Info Card outside of the max-width container so it spans the full viewport width on desktop. The card's internal content will still be centered and constrained for readability.

**Approach:**
- Restructure the component to have the purple card at the top-level (outside max-w container)
- Add internal padding and max-width to the card's content to maintain proper alignment
- Keep all other content inside the centered `max-w-2xl` container

### 2. Settings Menu Grid Layout

Convert the settings items from a vertical stack to a responsive grid:
- **Mobile**: 1 column (current behavior preserved)
- **Tablet (md)**: 2 columns
- **Desktop (lg)**: 3 columns

## Implementation Details

### File to Modify

| File | Changes |
|------|---------|
| `src/pages/Profile.tsx` | Restructure layout for full-width header, add grid for settings |

### Technical Changes

**Current Structure (simplified):**
```tsx
<div className="space-y-6 p-4 md:p-6 lg:p-8 max-w-2xl mx-auto">
  {/* Profile Alert Popup */}
  
  {/* Profile Info Card - constrained by parent */}
  <Card className="bg-gradient-to-br from-primary...">
    ...
  </Card>

  <div className="px-4 pb-4 space-y-6">
    {/* Become a Host / Stripe Connect / Reviews */}
    
    {/* Settings Menu - vertical list */}
    <div className="space-y-3">
      {settingsItems.map(...)}
    </div>
    
    {/* Logout, Support */}
  </div>
</div>
```

**New Structure:**
```tsx
<div className="space-y-6">
  {/* Profile Alert Popup - unchanged */}
  
  {/* Full-width purple header section */}
  <div className="bg-gradient-to-br from-primary via-primary to-primary/90">
    <div className="p-4 md:p-6 lg:p-8 max-w-4xl mx-auto">
      {/* Profile card content */}
    </div>
  </div>

  {/* Centered content container */}
  <div className="p-4 md:p-6 lg:p-8 max-w-4xl mx-auto space-y-6">
    {/* Become a Host / Stripe Connect / Reviews */}
    
    {/* Settings Menu - responsive grid */}
    <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
      {settingsItems.map(...)}
    </div>
    
    {/* Logout, Support */}
  </div>
</div>
```

### Key Changes

1. **Remove padding from root container** - Move `p-4 md:p-6 lg:p-8` to inner containers
2. **Profile header becomes full-width** - Apply gradient to a full-width div, with centered content inside
3. **Increase max-width to `max-w-4xl`** - Better use of desktop space for the grid
4. **Settings grid** - Change from `space-y-3` to `grid gap-3 md:grid-cols-2 lg:grid-cols-3`
5. **Card styling updates** - Remove the Card wrapper from profile header (gradient applied to parent div) or keep it but ensure it's inside the full-width wrapper

### Visual Comparison

**Before (Desktop):**
```
┌────────────────────────────────────────────────────────────────┐
│                                                                │
│          ┌────────────────────────────────────────┐            │
│          │  Purple Profile Card (constrained)     │            │
│          │  [Avatar] Name, Rating, Email...       │            │
│          └────────────────────────────────────────┘            │
│                                                                │
│          ┌────────────────────────────────────────┐            │
│          │  Settings Item 1                       │            │
│          └────────────────────────────────────────┘            │
│          ┌────────────────────────────────────────┐            │
│          │  Settings Item 2                       │            │
│          └────────────────────────────────────────┘            │
│          ┌────────────────────────────────────────┐            │
│          │  Settings Item 3                       │            │
│          └────────────────────────────────────────┘            │
│          ...                                                   │
└────────────────────────────────────────────────────────────────┘
```

**After (Desktop):**
```
┌────────────────────────────────────────────────────────────────┐
│█████████████████████████████████████████████████████████████████│
│█████████ Purple Profile Header (FULL WIDTH) ████████████████████│
│█████████  [Avatar] Name, Rating, Email...   ████████████████████│
│█████████████████████████████████████████████████████████████████│
│                                                                │
│    ┌──────────────────┐┌──────────────────┐┌──────────────────┐│
│    │ Manage Account   ││ Saved Spots      ││ List Your Spot   ││
│    │ Update profile   ││ Favorite spots   ││ Earn money       ││
│    └──────────────────┘└──────────────────┘└──────────────────┘│
│    ┌──────────────────┐┌──────────────────┐┌──────────────────┐│
│    │ My Vehicles      ││ Payment Methods  ││ Notifications    ││
│    │ Manage your cars ││ Cards & billing  ││ Preferences      ││
│    └──────────────────┘└──────────────────┘└──────────────────┘│
│    ┌──────────────────┐                                        │
│    │ Privacy&Security ││                                       │
│    │ Security settings││                                       │
│    └──────────────────┘                                        │
│                                                                │
│              [────── Logout Button ──────]                     │
└────────────────────────────────────────────────────────────────┘
```

## Summary

This update transforms the Profile page into a polished desktop experience:

1. **Full-width purple header** creates a bold visual impact at the top of the page
2. **3-column settings grid** makes better use of horizontal space and reduces scrolling
3. **Responsive design** maintains the current mobile layout while optimizing for larger screens
4. **Increased content width (max-w-4xl)** accommodates the grid layout without feeling cramped
