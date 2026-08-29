# Module 1 — Build Log

What was actually built, where it deviates from the frozen plan, and how each
definition-of-done item was verified.

**Status: Module 1 complete except deployment.** Steps 1–15 of the build order
are implemented; step 15's deploy needs a Vercel account and is the one
outstanding item.

---

## Definition of done

| # | Criterion | Verified by | Result |
|---|---|---|---|
| 1 | Two orgs in one database, neither can read the other's rows | `npm run verify` + HTTP check as both owners | **Pass** — org A gets 404 on org B's job and customer, and the reverse |
| 2 | Technician reaches `/my/jobs`, cannot reach `/dashboard/invoices` | HTTP check as `hamza@serviceops.demo` | **Pass** — 200 and 307→`/my/jobs` |
| 3 | A job travels the full status path, every hop in `job_status_history` | `npm run verify` | **Pass** — all 19 seeded jobs have history; all 7 completions recorded |
| 4 | An illegal transition is rejected server-side | `npm test` | **Pass** — 19 unit tests over `lib/jobs/transitions.ts` |
| 5 | Completing a job enqueues a customer email; the dispatcher sends it | `npm run verify:outbox` | **Pass** — queued PENDING in the domain transaction, dispatched to SENT |
| 6 | Breaking the email provider does **not** fail the job update | `npm run verify:outbox` | **Pass** — real Resend rejection (`API key is invalid`); email retried, job byte-identical |
| 7 | Invoice total always equals items + tax | `npm run verify` | **Pass** — all invoices and line amounts recomputed and compared |
| 8 | Job and invoice numbers gap-free per org under concurrency | `npm run verify` | **Pass** — 25 concurrent allocations produced 25 distinct, contiguous numbers |
| 9 | Deployed with a seeded demo org | — | **Outstanding** — needs a Vercel account; `vercel.json` and the seed are ready |

Totals: **19** unit tests, **16** invariant checks, **12** outbox checks,
**27** HTTP checks. All passing.

```bash
npm run check          # typecheck + unit tests
npm run verify         # tenancy, invoice maths, numbering, history (hits the DB)
npm run verify:outbox  # the notification outbox, including a provider outage
npm run verify:http    # tenancy and roles over real HTTP (needs npm run dev)
```

---

## Deviations from the frozen plan

Each of these is a deliberate change, not a slip.

### 1. `middleware.ts` is `proxy.ts`

Next 16 renamed it and dropped edge-runtime support for it. The file is
[`proxy.ts`](../proxy.ts), the runtime is nodejs and cannot be configured.
Route rules live in [`auth.config.ts`](../auth.config.ts) so the proxy decodes a
session without pulling Prisma into every request.

### 2. Prisma 7 moved connection URLs out of the schema

`datasource { url }` no longer exists. Migrations read `DIRECT_URL` via
[`prisma.config.ts`](../prisma.config.ts); the runtime client takes
`DATABASE_URL` through a driver adapter in [`lib/db/prisma.ts`](../lib/db/prisma.ts).

Both `prisma` and `@prisma/client` are pinned to exactly `7.10.0` — npm's
`latest` tag currently points at an `8.0.0-rc`, so an unpinned install produces
a CLI and client that disagree.

### 3. Two database URLs, not one

Neon's pooled endpoint is PgBouncer in transaction mode, which cannot hold the
advisory locks Prisma Migrate takes out. `DIRECT_URL` is the same string with
`-pooler` removed from the host.

### 4. No shadcn/ui

The build order said shadcn. Its CLI is interactive and its Tailwind 4 + Next 16
story is unsettled, and this app needs about ten primitives. They are
hand-written in [`components/ui/primitives.tsx`](../components/ui/primitives.tsx) —
one file, no CLI, no generated components to maintain.

### 5. Password reset sends email directly, not through the outbox

`Notification.organizationId` is required, and a password reset has no tenant.
More importantly the outbox exists to stop an email failure rolling back a
*domain* write — a reset has no such write to protect, and the person is waiting
on the result, so a failure should surface immediately rather than retry in five
minutes. It calls `sendEmail` directly, and that is the only place outside the
dispatcher that does.

### 6. `@date-fns/tz` added

Not in the original stack list. Hand-rolling "local midnight in Asia/Karachi as
a UTC instant" is the kind of arithmetic that is wrong twice a year. All
timezone helpers are in [`lib/dates.ts`](../lib/dates.ts) and tested across a DST
boundary.

### 7. The dispatch loop lives in `lib/`, not the route handler

[`lib/notifications/dispatch.ts`](../lib/notifications/dispatch.ts) holds the
logic; the route is six lines. Done so the failure path could actually be
tested rather than asserted.

### 8. Server Actions, not REST routes

As flagged when the scope was frozen. Only four things kept a URL:
`[...nextauth]`, the notification dispatcher, the reminder cron, and future
webhooks. Everything else is an `actions.ts` beside its route segment. Three
broken paths in the original skeleton were fixed at the same time (see
[01-module-1-scope.md](./01-module-1-scope.md)).

---

## Two things worth knowing

**The per-org counter is a contention point.** Allocating a job number takes a
row lock on the organization for the transaction's duration, so concurrent job
creation within one tenant serialises. That is what makes numbering gap-free,
and it is the right trade at this scale — but 25 simultaneous creations
exhausted a default-sized connection pool during testing. If a single tenant
ever books jobs faster than that, the counter moves to its own table or a
Postgres sequence per org.

**The session carries the membership, so role changes need a new token.**
Promoting someone takes effect on their next sign-in. Accepting an invitation
while already signed in to another workspace signs you out deliberately, because
Module 1 has no workspace switcher. Both are noted in the UI where they bite.

---

## Demo data

`npm run db:seed` builds *Karachi Cool AC Services* — 8 customers, 5 service
types, 19 jobs spread either side of today across every status, 7 invoices
covering draft/sent/paid/overdue, and a pending invitation.

| Email | Password | Role |
|---|---|---|
| `owner@serviceops.demo` | `demo1234` | Owner |
| `manager@serviceops.demo` | `demo1234` | Manager |
| `hamza@serviceops.demo` | `demo1234` | Technician |
| `imran@serviceops.demo` | `demo1234` | Technician |

`npm run verify` additionally creates *Lahore Electric Works*
(`owner@lahore.demo` / `demo1234`) as a second tenant, so cross-tenant isolation
can be checked from a browser as well as a script.
