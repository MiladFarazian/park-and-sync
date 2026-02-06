
Goal: Ensure the “List Your Spot” quick action on `/` reliably lands on `/list-spot` (not `/host-home`).

What’s happening (based on code inspection)
- `src/pages/Home.tsx` has two separate “host-mode safety” redirects that are currently fighting the quick action:
  1) A `useEffect` that redirects to `/host-home` whenever `mode === 'host'` (lines 62–69).
  2) A render-time guard that returns `null` (blank) whenever `mode === 'host'` on `/` (lines 477–482).
- Your quick action currently does:
  - `navigate('/list-spot', { replace: true })`
  - then `setMode('host', false)`
- In React 18, updates are batched. A common failure mode is:
  - the app briefly renders `/list-spot` while `mode` is still `driver`
  - `RequireHostMode` redirects back to `/`
  - then `mode` becomes `host`, and Home’s “host-mode safety” logic sends you to `/host-home`
- Net result: you end up at `/host-home` even though you intended `/list-spot`.

Proposed fix (robust against batching/race conditions)
We’ll make the Home page’s host-redirect logic “opt-out” for this one, intentional transition, and we’ll force the mode update to be applied before the route guard evaluates.

Implementation details

1) Add a “suppress host redirect temporarily” ref in `src/pages/Home.tsx`
- Add a ref near the other refs:
  - `const suppressHostRedirectRef = useRef(false);`

2) Update Home’s host redirect `useEffect` to respect the suppression flag
Current:
```ts
if (mode === 'host' && !fromLogoClick) {
  navigate('/host-home', { replace: true });
}
```
Change to:
- If `suppressHostRedirectRef.current` is true, do nothing.
- This prevents Home from sending us to `/host-home` while we are intentionally switching to host just to reach `/list-spot`.

3) Update the render-time guard in Home to respect the suppression flag
Current:
```ts
if (mode === 'host' && !fromLogoClick) {
  return null;
}
```
Change to:
- Only return null when `mode === 'host' && !fromLogoClick && !suppressHostRedirectRef.current`
- This avoids a blank “flash”/stall during the intentional quick-action transition.

4) Update ONLY the Home quick action “List Your Spot” handler to:
- Set suppression flag ON
- Force host mode to apply synchronously
- Navigate to `/list-spot`
- Clear suppression flag shortly after

Concretely:
- Import `flushSync` from `react-dom` at the top of `Home.tsx`
- Update the onClick to:
  - If not logged in: keep current `/auth` redirect behavior
  - Else:
    - `suppressHostRedirectRef.current = true`
    - `flushSync(() => setMode('host', false))`
    - `navigate('/list-spot', { replace: true })`
    - Clear suppression in a `setTimeout(() => { suppressHostRedirectRef.current = false; }, 0)` (or `requestAnimationFrame`) so it only applies for the transition

Why this works
- `flushSync` ensures `mode` becomes `'host'` before React Router’s `RequireHostMode` decides whether it should redirect away.
- The suppression ref prevents Home’s own “host mode => /host-home” logic from hijacking this specific intentional flow.
- This makes the quick action deterministic: `/` → `/list-spot` every time (when logged in), instead of occasionally bouncing `/` → `/host-home`.

Files to change
- `src/pages/Home.tsx`
  - Add `suppressHostRedirectRef`
  - Gate the host redirect `useEffect`
  - Gate the “return null” host guard
  - Update the quick action handler to use `flushSync` + suppression

Manual test checklist (important)
1) On mobile, logged in, from `/` tap quick action “List Your Spot”:
   - Expected: lands on `/list-spot` (no detour to `/host-home`)
2) Hard refresh while last saved mode is host, open `/`:
   - Expected: still redirects you to `/host-home` (the original safety behavior should remain)
3) Logged out, from `/` tap “List Your Spot”:
   - Expected: goes to `/auth` with intended destination preserved

Optional follow-up hardening (if you want)
- Add a small debug log (DEV-only) in the Home quick action and in `RequireHostMode` to confirm the exact redirect path during testing.
- Consider later centralizing “go to list spot” behavior into one helper/hook to avoid future drift between buttons/links.

Risks / trade-offs
- `flushSync` should be used sparingly, but this is a user-interaction-driven navigation edge case and is an appropriate place for it.
- The suppression ref is localized to Home and only affects this transition, keeping the rest of the app’s host-mode redirect behavior intact.
