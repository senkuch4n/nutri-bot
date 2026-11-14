# MorphDialog v2: closer to the reference video

Direct task, not an HU. Branch `feat/morph-dialog`. Builds on the unfinished work of the previous implementer: lift geometry, shared label, 24 px radius, `size`, light backdrop.

## What changed

- `apps/web/src/lib/morph.ts`
  - Two opening modes plus a fallback (`openMode`, `openTimeline`, `openTransitions(mode)`):
    - `delayed`: the dialog opens from the page. The origin fades out over 100 ms. At 180 ms the card fades in over 50 ms, exactly on top of the origin, then grows to the dialog with no lift step.
    - `lift`: the origin is inside another dialog. Over 50 ms a white card with a shadow appears around the origin, 8 × 6 px bigger per side, and then grows.
    - `direct`: there is no origin, or the dialog reopens partway through closing. Nothing waits, and the shell does a short fade.
  - Stacked backdrop: `layerDim(stacked)` and `backdropOpacity(stacked)`. A single dialog dims the page 8%. A dialog stacked on another only adds enough to bring the page to `MORPH_STACK_DIM` = 12% total, about 4.3% from its own layer, so the page does not double-darken.
  - Removed `morphTransitions.open`, `labelHold` and `originOutLabel`, which were half-wired. `morphTransitions` now only holds close, fadeOut and reduced.
- `apps/web/src/components/primitives/morph-dialog.tsx`
  - The open path chooses the mode:
    - It counts as nested when the origin is inside a `[role=dialog|alertdialog]`.
    - The backdrop counts as stacked when another dialog is open with `data-state=open`. It does not matter whether that dialog is a MorphDialog or a Radix one.
  - The shared label covers the origin's text from the moment of the click. It travels with the card's corner toward the title, then crossfades with the content: it starts fading when the content does and lasts 120 ms.
  - Unchanged: reduced motion, an origin removed from the DOM, exact restoration of inline styles, interruptions and Strict Mode, focus, Escape, scroll lock, `more-contrast`.
- `apps/web/src/lib/morph.test.ts`: tests for the modes, the timelines for each mode, and the stacked backdrop. 30 tests.
- `apps/web/src/app/(panel)/disponibilidad/range-sheet.tsx`: `originLabel`, from the previous work. `view.tsx` and `schedule.tsx` did not need changes.

## Adopted timings (measured in `ref.mov`)

| Moment | Value |
|---|---|
| Origin fades out (delayed) | 0–100 ms |
| Card appears (delayed) | 180 ms after the click, 50 ms fade |
| Lift (nested) | 0–50 ms, card origin + 8 × 6 px |
| Growth | expo-out over 420 ms: 81% at 100 ms, 94% at 170 ms (video: about 88% at 117 ms, 94% at 167 ms) |
| Content | starts after 150 ms of growth, opacity 160 ms and blur 10 → 0 over 200 ms. Settled 350 ms after the card appears (delayed) or 400 ms (lift) |
| Label | crossfade 120 ms, starting with the content |
| Backdrop | 220 ms, starting with the card. 8% single, 12% stacked |
| Close | unchanged: 360 ms back to the origin, which reappears from 240 ms |

Measured pixels: page 249 → 228 with one dialog (8.4%). In the video the nested case compounds to about 18% (228 → 205). The brief asked for no double-darkening, so it was capped at 12%. `MORPH_STACK_DIM` is the knob.

## Checks

- `npm run typecheck`: passes in core, db, bot and web (exit 0).
- `npx vitest run apps/web`: 66 files, 643 tests passed (exit 0).

## To check in the browser (not done here)

- `/disponibilidad`:
  - The 180 ms wait before the card appears is what the video shows, but it may feel slow. The knob is `morphTiming.appearDelay`.
  - Check the label crossfade from a chip ("09:00 – 13:00") to the title "Horario del …", which has a different text and size.
- Stacking: no screen nests a MorphDialog today, so the lift, the 12% backdrop and closing the child back to its origin are untested in a real UI.
  - Known detail: during the child's exit (about 380 ms), Radix still treats the child as the top layer. An Escape pressed in that window does not close the parent.
- The shadow scales with the shell, so the lifted card has a small shadow. Check that it reads as a "lift".
