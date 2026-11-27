# HU-027 · WhatsApp tenant isolation
First cut of #70 only. Acceptance and design: `docs/hu-whatsapp-multi-sesion.md` and `Refactorizaciones/whatsapp-multi-sesion.md`.

## Specs
S1 (issue #70): “Un paciente con igual número/JID en ambos tenants mantiene conversaciones independientes.”
S2 (issue #70): “Adaptar `handleIncoming` y `handleIncomingMedia` para resolver tenant por **conexión de WhatsApp receptora** (un JID de paciente no basta); separar `ConversationState` y serialización/colas por tenant y contacto.”
S3 (issue #70, first-cut portion): “impedir envío cruzado aun si el destinatario JID coincide.”

## Tasks
- T1 · S1–S3 · Implemented; author typecheck and focused checks passed · Commit: pending T2.
- T2 · S1–S3 · Blocked: verifier requires isolated staging and no permitted staging route was available; work-unit commit pending · Commit: pending.

## Log
L1: esta acorde al alcence de la hu ? si es asi avancemos
L2: User authorized moving #70 from `estado: backlog` to `estado: en curso` and continuing with tests. Two mocked connections, one configured production connection; no real WhatsApp messages.
L3: GitHub status update succeeded. Observed RED for the three focused cases before their fixes; 49 focused tests passed after the fixes. Isolated `npm ci` failed with ENOSPC before Prisma generation (118 MiB free after failure).
L4: Worktree `.git/local-worktrees/hu-027` relative to the repository root, branch `feat/hu-027-whatsapp-multi-sesion`, base `origin/develop` at `e7c0280`. The checkout at the repository root has unrelated edits; do not switch or clean it. No commit, push, or PR was made.
L5: `npm run typecheck` in the worktree exited 2 with Prisma type mismatches (including missing `googleCalendarAccount`); this run was after the failed install and Prisma generation did not run. The full test suite and independent verification did not run. GitHub #70 is already assigned to `imleticio` and `estado: en curso`; the local backlog file has `implementando`.
L6: Resume after restart: locate this worktree with `git worktree list`, check `git status --short` there and `df -h .`. If space is still insufficient, stop the install path and ask before deleting anything. When there is sufficient space, install in this worktree (`npm ci`) and then run `npm run db:generate` to match the schema; do not run migrations, seed, or connect to WhatsApp. Existing focused checks passed using the root Vitest binary: `../../../node_modules/.bin/vitest run apps/bot/src/{whatsapp,jid-queue,workers}.test.ts` (49 passed). Continue T1: wire the connection through `index.ts`, scope text/media conversation state and domain calls (including professional settings and booking), and remove legacy global delivery from the production path. Add a mocked end-to-end test for the same JID across two tenants. Then run typecheck, full tests, and independent verification before marking T1/T2 complete. Keep QR, production multi-session, cron sweep, and licensing outside this cut.
L7 user continuation: revisa el engram, quiero que terminos la hu que dejamosa a media
L8: Isolated install and Prisma generation passed; baseline typecheck found an existing partially written workers test typing error. New production callback scenario failed RED before implementation and now passes. Existing outbox fail-closed control detected a regression; preserve validation before considering T1 green.
L9: Worker restored fail-closed per-tenant outbox validation; focused workers suite passed (38). Full suite passed (4114 passed, 1 skipped); diff check passed. Typecheck found two scoped booking call-site argument errors, corrected; focused recheck in progress. Independent T2 was denied during scratch preparation and executed zero tests; no approval or commit.
L10: After correcting the two booking call sites, job-4 passed typecheck (all workspaces), all 67 focused tests and `git diff --check`. No real WhatsApp or database operations were run.
L11 user authorization: bueo corre
L12: The independent verifier inspected the final diff but could not run the focused suite in place because its rules require isolated staging. The denied copy was not repeated; no permitted staging route was available. S1–S3 remain independently unverified (0 tests); no commit.
L13: Review handoff authorized. Implementation committed in `01e9bc9` and wired in `1533c50` on `feat/hu-027-whatsapp-review` (base `0553755`). This does not approve or close T2.
