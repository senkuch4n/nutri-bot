# Feature: morph-dialog

## Objective
Replace the right-side `RangeSheet` in `/disponibilidad` with a centered dialog that morphs (FLIP) from the
element that opened it and returns to it on close (Factum "case detail" technique).

## Why
The user wants this modal style; it starts in Availability and the primitive must be reusable later.

## Scope / constraints
- Local only: no push, issue, or PR until the user asks (user instruction 2026-10-26).
- Reuse the existing stack: `motion/react` v14 with `m` (LazyMotion) and Radix Dialog. Radix owns focus trap,
  Escape, scroll lock, inert background and focus return; we coordinate its unmount with the exit animation.
- Reduced motion: only a 150 ms fade, no measuring, no origin transform.
- Origin removed from DOM while open: close with a fade.
- Origin inline styles (opacity/filter/transform/will-change, with priority) saved and restored exactly.
- Below 640 px: bottom sheet variant (top corners rounded, max-height 92dvh) — task T3.

## Tasks
- [x] T1 — `MorphDialog` primitive + pure geometry helpers with vitest tests (route: delegated, writer trigger: 2+ non-trivial files) — commit `92c0395`
- [x] T2 — Wire `/disponibilidad`: capture origin in `schedule.tsx`, keep it in `view.tsx`, `RangeSheet` uses `MorphDialog` (route: delegated with T1, same writer) — commit `10ece48`
- [ ] T3 — Mobile bottom-sheet variant (< 640 px) (route: delegated)

## Acceptance criteria
Checklist from the guide, section 10 (open from correct origin after scroll, no text stretch, content delayed,
close returns to current origin, interruptions leave no styles/scroll lock, removed origin fades, keyboard/focus,
reduced motion = fade, small screens scroll).

## Checks
`npm run typecheck`, `npm run test` (web workspace), `./ops/harness/verify.sh`.

## Progress
- Branch `feat/morph-dialog` created from `develop` (local).
- T1 (`92c0395`): `components/primitives/morph-dialog.tsx` (MorphDialog, Content, Header, Title, Description,
  Close, Trigger; `origin` prop on the Root) and `lib/morph.ts` (FLIP, settle keyframes, origin scale, inverse
  scale, blur filter, origin hide/reveal styles, exact inline-style save/restore, transition constants).
  Test-first: `morph.test.ts` RED (module missing) → GREEN (13 tests). The DOM/animation component has no
  deterministic RED in jsdom (accepted exception): typecheck + manual checklist.
- T2 (`10ece48`): `schedule.tsx` passes `event.currentTarget` to `onEdit`/`onAdd`; `view.tsx` keeps
  `rangeOrigin`; `RangeSheet` (export name kept) renders `MorphDialog`. The mobile bottom-sheet branch
  (`useMediaQuery`) was removed: below 640 px it is now the centered dialog until T3.

## Verification evidence (T1 + T2)
- `npm run typecheck`: exit 0, all workspaces clean.
- `npm run test --workspace apps/web`: not runnable (`Missing script: "test"` in apps/web). Substitute
  `npx vitest run apps/web` from the root: 66 files, 626 tests passed.
- `./ops/harness/verify.sh`: "Arnés OK" (exit 0); WARN: no `progress/current-imleticio.md`; typecheck step
  skipped because the changes were already committed (covered by the run above).

## Pending manual browser checks (guide §10)
- [ ] Opens from the correct chip / "Agregar horario" after scrolling the page.
- [ ] No text stretch during the morph (counter-scale), content appears with delay.
- [ ] Close returns to the current origin position; origin reappears (blur/scale) without leftover inline styles.
- [ ] Interruptions: close during open, quick reopen, double Escape — no leftover styles or scroll lock.
- [ ] Delete a range: origin chip leaves the DOM → closes with a fade; focus goes to "Agregar horario" of that day.
- [ ] Keyboard: Tab trapped, Escape closes, focus returns to the chip/button (also in Safari).
- [ ] Reduced motion: only a 150 ms fade, origin never transformed.
- [ ] Small screens: body scrolls inside 85dvh.
- [ ] React Strict Mode (dev): first open animates correctly.

## Next step
Manual browser checklist above, then T3 (mobile bottom-sheet variant).
