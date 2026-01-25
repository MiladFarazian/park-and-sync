

# Plan: Create Comprehensive Documentation Page for Parkzy

## Overview
Create a new `/docs` page with comprehensive help documentation for Parkzy, covering guides for both drivers and hosts. The page will follow the existing design patterns from Privacy and Terms pages, with a modern card-based navigation structure.

## Page Structure

The documentation page will be organized into the following sections:

### 1. Getting Started
- Creating an account
- Completing your profile
- Email/phone verification

### 2. For Drivers
- How to find parking (search, filters, map)
- Making a booking
- Managing reservations (view, extend, cancel)
- Payment methods
- Using EV charging spots
- Adding and managing vehicles
- Saving favorite spots
- Reviews and ratings

### 3. For Hosts
- Listing your parking spot
- Setting pricing (hourly rates)
- Managing availability (recurring schedules, date overrides)
- Approving/declining booking requests
- Earnings and payouts (Stripe Connect)
- Host calendar
- Responding to messages

### 4. Payments & Fees
- How pricing works (without revealing exact fee percentages)
- Payment processing (Stripe)
- Refunds and cancellations
- Host payouts

### 5. Safety & Trust
- Verified profiles
- Reviews and ratings
- Reporting issues
- Account security

### 6. FAQ
- Common questions with collapsible answers

## Implementation Details

### Files to Create

| File | Purpose |
|------|---------|
| `src/pages/Docs.tsx` | Main documentation page with collapsible sections |

### Files to Modify

| File | Changes |
|------|---------|
| `src/components/layout/Footer.tsx` | Add "Help Center" or "Documentation" link in Support section |
| `src/App.tsx` | Add route for `/docs` |

### Technical Approach

1. **Create `src/pages/Docs.tsx`**:
   - Follow the styling pattern of Privacy/Terms pages (`h-screen overflow-y-auto`, `prose` classes)
   - Use Accordion component from shadcn/ui for collapsible sections
   - Organize content with clear visual hierarchy using Cards
   - Include navigation cards at the top for quick access to sections
   - Back button navigates to home (`/`)

2. **Update Footer.tsx**:
   - Add "Help Center" link in the Support column
   - Link to `/docs`
   - Also update the bottom legal links to use React Router `Link` for Privacy/Terms

3. **Add route in App.tsx**:
   - Add `/docs` route outside AppLayout (similar to Privacy/Terms)

### UI Layout

```text
┌────────────────────────────────────────────────────────────┐
│  ← Back    Help Center                                     │
├────────────────────────────────────────────────────────────┤
│                                                            │
│  ┌─────────────────┐  ┌─────────────────┐                  │
│  │ 🚗 For Drivers  │  │ 🏠 For Hosts    │                  │
│  │ Find & book...  │  │ List your spot..│                  │
│  └─────────────────┘  └─────────────────┘                  │
│                                                            │
│  ┌─────────────────┐  ┌─────────────────┐                  │
│  │ 💳 Payments     │  │ ❓ FAQ          │                  │
│  │ Pricing & fees  │  │ Common questions│                  │
│  └─────────────────┘  └─────────────────┘                  │
│                                                            │
│  ═══════════════════════════════════════════════════════   │
│                                                            │
│  ## Getting Started                                        │
│  [Accordion: Create account, Profile, Verification]       │
│                                                            │
│  ## For Drivers                                            │
│  [Accordion: Finding parking, Booking, Payments, etc.]    │
│                                                            │
│  ## For Hosts                                              │
│  [Accordion: Listing, Pricing, Availability, etc.]        │
│                                                            │
│  ## Payments & Fees                                        │
│  [Accordion: How pricing works, Payouts, Refunds]         │
│                                                            │
│  ## Safety & Trust                                         │
│  [Accordion: Verified profiles, Reviews, Reporting]       │
│                                                            │
│  ## Frequently Asked Questions                             │
│  [Accordion: Common Q&A items]                            │
│                                                            │
│  ─────────────────────────────────────────────────────     │
│  Need more help? Contact us at support@parkzy.app         │
└────────────────────────────────────────────────────────────┘
```

### Content Sections (Key Topics)

**Getting Started:**
- Creating an account (email, phone, or social login)
- Completing your profile (name, photo)
- Email verification requirements

**For Drivers:**
- Finding parking near you (location search, map view, filters)
- Using EV charging filters
- Making a booking (selecting times, choosing vehicle)
- Viewing and managing reservations
- Extending your parking session
- Cancellation policy
- Adding payment methods
- Managing your vehicles
- Saving favorite spots
- Leaving reviews

**For Hosts:**
- Creating a parking spot listing
- Adding photos and descriptions
- Setting your hourly rate
- Managing availability with recurring schedules
- Creating date-specific overrides
- Approving or declining booking requests
- Viewing your earnings
- Setting up Stripe for payouts
- Using the host calendar

**Payments & Fees:**
- How booking costs are calculated
- Service fees
- Secure payment processing
- Cancellation refunds
- Host payout schedule

**Safety & Trust:**
- Profile verification
- Reviews and ratings system
- Reporting problematic users or spots
- Account security features

**FAQ:**
- How do I change my booking time?
- What happens if I overstay?
- Can I cancel a booking?
- How do hosts get paid?
- What if there's a problem with my parking spot?
- How do EV charging rates work?

## Summary

This creates a comprehensive, well-organized documentation page that helps both drivers and hosts understand how to use Parkzy. The page uses familiar UI patterns (Accordion for collapsible sections, Cards for navigation) and follows the app's existing design system.

