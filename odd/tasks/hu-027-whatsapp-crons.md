# HU-027 · Tenant-scoped background jobs
Third cut of #70. Earlier cuts are locally tested; independent closure remains pending.

## Specs
S1 (issue #70): “Adaptar cron jobs (recordatorios, prep, sync, reconciliación, limpieza, resúmenes) para recorrer tenants activos con idempotencia, sin que una falla bloquee al resto.”
S2 (issue #70): “Particionar `OutboundMessage` y deduplicación por tenant; impedir envío cruzado aun si el destinatario JID coincide.”

## Tasks
- T1 · S1 · Sweep reminders, prep and digest for WhatsApp-requested tenants on cron and startup; isolate failures and preserve current domain idempotence · Route: worker and author checks passed; independent verification in T3 · Commit: pending.
- T2 · S1 · Scope text cleanup and audit existing calendar/payment/AI retention jobs · Route: author checks passed · Commit: pending.
- T2a · S1 · Scope AI retention by tenant independently of WhatsApp intent · Route: author checks passed · Commit: pending.
- T3 · S1–S2 · Verify persistent enqueue deduplication and rollback with two synthetic tenants · Route: disposable PostgreSQL probe passed (job-17) · Commit: pending.
- T3a · S2 · Serialize concurrent sends of each pending row across processes; preserve current retry semantics · Route: mock checks and isolated two-process proof passed · Commit: pending.
- T3b · S1–S2 · Independently verify enqueue and delivery evidence · Route: pending a supported review candidate/environment or human reviewer · Commit: pending.
- T4 · Issue #70 operations criterion · Document a synthetic VPS capacity and reconnect check · Route: plan written; execution awaits authorized staging · Commit: pending.

## Log
L1: avanzemos con la hu
L2: Read-only map: billing reconciliation and Calendar already enumerate scoped tenants. Reminders, prep and digest are still legacy-only; expired conversation text is also legacy-only. For WhatsApp-producing jobs use non-null session intent, not observed connectivity, and never infer a subscription or suspension decision from it. HU-030 integration is separate. No live database, WhatsApp, publishing or rollout. Preserve dirty work from earlier cuts. Existing per-process flags are not distributed idempotence; original persistent controls must stay intact and gaps are T3.
L3: T1 worker RED exit 1 (14 failed/32 passed), GREEN exit 0 (46 passed), bot typecheck exit 0; parent confirmed 46 tests and diff check. Sweep uses only tenant-owned rows with session intent and isolates failures. Legacy bootstrap may be picked up on the next scheduled sweep if not yet inserted. Persistent concurrency and no-duplicate guarantees remain in T3.
L4: T2 ran RED exit 1 (5 failed/75 passed), GREEN exit 0 (80 passed), bot and db types exit 0; parent confirmed 80 and diff check. Expired text now determines the tenant set without WhatsApp/Patient/agenda prerequisites; writes repeat tenant, steps and strict cutoff. Historical unowned rows stay untouched. Calendar and payment already isolate tenants, but cross-process effects remain unverified. AI retention was one global delete at this point.
L5: T2a RED exit 1 (5 failed/64 passed); GREEN and parent exit 0 (69 passed); final bot and db typecheck exit 0 after correcting Prisma inference. Scoped retention preserves strict cutoff and existing script API; tenantId is required by HU-028c. T3 must prove persistent dedupe separately.
L6: T3 exploration distinguished enqueue from delivery. Reminder/prep share the persistent appointment/kind/key uniqueness; digest enqueues and marks inquiries in one transaction. Outbox only holds an in-process lock before the external send, and persists SENT afterward; independent processes can both send. Serialize concurrent delivery per tenant/message, but never claim exactly-once across the ambiguous external-send/DB-ack crash window. Enqueue proof can run separately on disposable fixtures.
L7: Worker added a disposable PostgreSQL enqueue probe; 60 existing mocked domain tests passed. Parent inspected resource ownership guards and launched the isolated probe. Scope excludes an exactly-once claim across process/transport failures.
L8: Job-17 exited 0. Expected Prisma uniqueness conflicts appeared for the concurrent reminder/prep INSERTs; one row per logical item persisted across two tenants with the same JID. The concurrent digest loser rolled back its outbound and repeated runs produced no extras.
L9: T3a worker RED exit 1 (9 failed/41 passed, including fake-timer cascade); GREEN and parent 50 passed; bot typecheck and diff check passed. Nonblocking transaction advisory lock by tenant and message, eligibility reread and result write within the lock, pacing outside. Five-minute transaction deadline is not a send cancellation; lost transaction or ambiguous acknowledgement can permit retry. Need actual two-process proof with synthetic transports.
L10: Job-18 exited 0 for actual PostgreSQL and two separate outbox processes with fake transports. Winner sent once and persisted SENT/attempts 2→3; loser skipped contention and stale ID; same-JID tenant B remained unchanged. No real sends. Independent approval remains pending.
L11: Issue #73 is open/backlog and declares a dependency on #70; no existing suspension contract was found by the scoped local search. Coordinate contract or follow-up separation with Joel rather than substituting WhatsApp intent. Added `Refactorizaciones/whatsapp-capacity-check.md`; plan only, no VPS usage.
L12: Job-20 exited 0: all-workspace typecheck, 4387 tests passed/1 skipped, and `git diff --check` passed after the cron/outbox work. Local suite is not independent approval. No commits, publishing or deployment.
L13: Review handoff authorized. Candidate slices: `01e9bc9` and `da7e2e4` (retention domain), `1533c50` (workers), `259bb7f` (PostgreSQL probes), `b5997b9` (capacity plan). The runtime commit is over the review target; inspect sessions and worker changes separately. Independent verification remains pending, as do HU-030 and staging capacity.
