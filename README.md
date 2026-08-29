# ServiceOps

Multi-tenant service management for small field-service businesses — AC repair,
plumbing, electrical, appliance repair. Customers, jobs, scheduling,
technicians and invoices in one workspace, with the repetitive customer email
handled automatically and AI that proposes but never writes.

### ▸ [Live demo — service-desktop.vercel.app](https://service-desktop.vercel.app)

| Sign in as | Password | What you'll see |
|---|---|---|
| `owner@serviceops.demo` | `demo1234` | The full dashboard — jobs, schedule, invoices, team, AI settings |
| `manager@serviceops.demo` | `demo1234` | Same, minus team and billing settings |
| `hamza@serviceops.demo` | `demo1234` | A technician: lands on `/my/jobs`, blocked from everything else |

The demo workspace has a week of work either side of today — 8 customers,
19 jobs across every status, 7 invoices from draft to overdue. A second
organization exists in the same database, which is how tenant isolation is
tested rather than assumed.

---

## What it actually solves

A small AC repair business runs on WhatsApp, a notebook and a phone. A customer
says *"AC chal raha hai lekin thanda nahi ho raha"* and the owner has to record
the customer, raise a job, find a free technician, schedule it, tell both
parties, chase the status, write it up and invoice it. Every one of those steps
is a place to drop something.

ServiceOps is that whole loop in one place: intake → schedule → assign →
technician updates from their own login → complete → invoice → paid, with the
email at each step sent automatically.

---

## Five decisions worth reading the code for

**Tenant isolation is enforced in one place, and proven.** Every tenant-owned row
carries `organizationId`, and application code never calls `prisma.*` for tenant
data directly — it goes through scoped accessors that put the organization in
the `where` clause. Lookups use `findFirst`, not `findUnique` plus a check, so a
cross-tenant id returns `null` → 404 and a probe learns nothing about whether
the record exists. Verified against two live organizations, in both directions.

**An email outage cannot fail a job update.** Notifications are a transactional
outbox: domain code writes a `Notification` row in the *same transaction* as the
change that caused it, and a cron-driven dispatcher sends it. The test sets a
genuinely invalid API key, queues a real email, runs the dispatcher, and asserts
the provider rejected it, the email went back to `PENDING` with backoff — and
the job is byte-identical. Two overlapping dispatchers are safe too: rows are
claimed with `FOR UPDATE SKIP LOCKED`.

**Job status is a function of two facts, not a straight line.** The obvious model
is `NEW → SCHEDULED → ASSIGNED`. That doesn't survive contact with a dispatcher,
who routinely assigns someone before finding a slot. Status is derived from
*has a time* and *has a technician*, with transitions enforced server-side in
one file and every hop written to history in the same transaction as the change.

**AI proposes; it has no write path.** Every model output is an `AiSuggestion` a
human accepts or rejects. Accepting marks the row and hands back a payload —
applying it goes through the ordinary `updateJob` / `assignTechnician` /
`createInvoice` paths with their validation, permissions and history. This is
enforced structurally, not by convention: `npm run verify:ai` asserts that no
module under `lib/ai/features/` writes to the database at all, and that
`lib/db/ai.ts` contains no write to a job or invoice.

**The AI provider lives behind one function.** `lib/ai/client.ts` is the only
application file that imports a provider SDK; everything else calls `ask()`.
Swapping Claude for Gemini mid-project meant rewriting that one file. A test
asserts the count stays at one.

---

## Measured, not asserted

**111 checks**, all passing:

| | |
|---|---|
| Unit tests — status machine, money, time zones | 19 |
| Tenancy, invoice arithmetic, gap-free numbering | 16 |
| Notification outbox, including a real provider outage | 12 |
| HTTP — roles and isolation with real sessions | 27 |
| AI invariants — the model has no write path | 17 |
| Scored classification fixtures | 20 |

**Job classification: 100% on service type**, across 20 deliberately messy
fixtures — mixed English/Urdu, some very terse (`"AC kharab"`), two describing
appliances the business doesn't service. Priority was never more than one step
out. Median latency 1.4s. Free, on Gemini's free tier.

```bash
npm run check          # typecheck + unit tests
npm run verify         # tenancy, invoice maths, numbering, history
npm run verify:outbox  # the outbox, including a provider outage
npm run verify:http    # roles and isolation over real HTTP
npm run verify:ai      # the model has no write path
npm run eval:classification   # 20 scored fixtures
```

### What testing caught that reading wouldn't

The invoice drafter billed **AC repair 3,500 + Gas refilling 4,500** for one
visit where the technician topped up gas during a repair — charging the callout
twice, on a document that goes to a customer. Fixed, and the fix was checked
against a job that *is* a genuine gas refilling call, to be sure it stopped
double-charging without becoming timid about legitimate charges.

Two smaller ones: the classifier answered *"none of these fit"* for a broken AC
remote, and the summariser ignored a follow-up a technician had explicitly
flagged. Both found by running the features, not by reading them.

---

## Stack

Next.js 16 (App Router, Server Actions) · React 19 · TypeScript · Tailwind CSS 4 ·
Prisma 7 · PostgreSQL (Neon) · Auth.js v5 · Resend · Google Gemini · Vercel

No component library — the dozen UI primitives are in one file.

---

## Running it locally

```bash
npm install
cp .env.example .env     # then fill it in
npm run db:migrate       # create the schema
npm run db:seed          # a demo workspace with a week of work
npm run dev
```

Postgres from [Neon](https://neon.tech) or [Supabase](https://supabase.com);
both have a free tier. `DATABASE_URL` is the pooled string, `DIRECT_URL` the
same with `-pooler` removed — migrations need a direct connection because a
transaction-mode pooler can't run DDL.

An AI key is optional. Without `GEMINI_API_KEY` every AI affordance disappears
and the app behaves exactly as it did before Module 2 — no errors, no dead
buttons. That's verified, not assumed.

### Deploying

Import on Vercel and set the variables from [.env.example](.env.example) — with
one exception: **don't set `AUTH_URL`**. Auth.js derives its base URL from the
request host and emailed links use Vercel's `VERCEL_PROJECT_PRODUCTION_URL`, so
production and preview deployments both resolve with nothing to maintain.

Vercel's Hobby plan caps cron at one run per day. The nightly reminder fits and
stays in [vercel.json](vercel.json); the notification dispatcher runs every five
minutes from [GitHub Actions](.github/workflows/dispatch-notifications.yml)
instead — which it can, because the dispatcher was always an authenticated HTTP
endpoint rather than an in-process timer.

---

## Documentation

The scope was frozen in writing before either module was built, and the build
logs record what changed and why.

| | |
|---|---|
| [docs/01-module-1-scope.md](docs/01-module-1-scope.md) | What ships, what doesn't, definition of done |
| [docs/02-screens-and-flows.md](docs/02-screens-and-flows.md) | 30 screens, the status machine, six flows |
| [docs/03-data-model.md](docs/03-data-model.md) | Why the schema is shaped the way it is |
| [docs/04-build-log.md](docs/04-build-log.md) | Module 1: deviations, and how each criterion was verified |
| [docs/05-module-2-scope.md](docs/05-module-2-scope.md) | What AI is and is not allowed to do |
| [docs/06-module-2-build-log.md](docs/06-module-2-build-log.md) | Module 2: measured accuracy, three defects testing caught |
| [prisma/schema.prisma](prisma/schema.prisma) | 20 models |

---

## Roadmap

- **Module 1** — core: auth, tenancy, customers, jobs, scheduling, invoices, email ✅
- **Module 2** — AI: classification, summaries, technician recommendation, invoice drafts, weekly insight ✅
- **Module 3** — technician PWA: offline, camera, GPS, signature, push
- **Module 4** — customer portal, WhatsApp, payments

Module 3 is a second interface over the same rows rather than a migration,
because technicians were modelled as memberships with logins from the start —
not as a separate table that would later need merging into users.
