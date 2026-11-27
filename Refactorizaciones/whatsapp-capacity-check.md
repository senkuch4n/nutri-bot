# Measure WhatsApp session capacity before rollout

Do not set a production session limit from the unit tests. Measure on a staging VPS with the same resource allocation and storage layout, using synthetic tenants and mocked transport. Real WhatsApp validation, if needed, is a separate rollout decision.

## Test sequence

1. Record the staging CPU/RAM limits, database pool size, workload, and one-session baseline. Use isolated credentials and database fixtures; never reuse production volumes or routes.
2. Start with two sessions, including the same synthetic recipient in both. Ramp toward the intended launch count, then repeat under queued load and after a bot restart with persistent volumes.
3. Disconnect one session while the other handles traffic. Then simulate simultaneous disconnects and watch reconnect completion, retry bursts, per-tenant queue age and competing outbox transactions. Verify one tenant cannot receive another tenant's message. Test ambiguous send outcomes separately from healthy concurrent sends.

| Measure | What to record |
|---|---|
| Resources | CPU, RSS, DB pool wait and active transactions under sustained traffic and a reconnect burst. |
| Recovery | Reconnect duration, QR/auth reuse, retry volume, outbox depth and oldest pending age by tenant. |
| Isolation | No wrong-tenant send, no duplicate send in healthy contention, no unrelated session loss when one fails. |

## Rollout gate

Agree on launch count and resource/recovery budgets with Joel before running staging. Record measured limits and headroom; stop on isolation failures, repeated reconnect loops, or exhausted resources. Keep the legacy credential volume intact. Do not treat this plan, Compose validation, or disposable database tests as VPS capacity evidence.