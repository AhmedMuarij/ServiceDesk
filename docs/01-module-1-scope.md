# Module 1 — Frozen Scope

**Status:** frozen as of 2026-08-27. Anything not listed under *In scope* is out,
regardless of how small it looks. Changes to this file require a deliberate
decision, not a "while I'm in there".

**Goal:** a business owner signs up, adds a customer, creates a job, schedules
and assigns it, the technician updates it from their own login, the job gets
invoiced, and the right people get emailed automatically — end to end, deployed.

---

## Locked decisions

| # | Decision | Chosen | Why |
|---|---|---|---|
| 1 | Technicians in Module 1 | **Log in.** `Membership` with `role = TECHNICIAN` + `TechnicianProfile` | Module 3 becomes a UI layer, not a data migration of live job assignments |
| 2 | Invoice ↔ Job | **One invoice per job** (`Invoice.jobId` unique, required) | Matches the completed→invoice flow; bundling is a Module 4 join table |
| 3 | Scheduling depth | **Day + week calendar, no drag-and-drop** | Assignment happens on the job form; drag-and-drop is 1–2 weeks alone |
| 4 | Auth | **Auth.js v5 + Prisma adapter**, credentials provider | Tenancy logic stays in our code — that's the part worth showing |
| 5 | Mutations | **Server Actions**, not REST routes | See "Route-handler correction" below |
| 6 | Money | **Integer minor units** (`Int`, `*Cents`) | Floats and money don't mix |
| 7 | Multi-tenancy | **Shared schema, `organizationId` on every tenant row**, enforced in a data-access layer | Postgres RLS is Module 4 hardening, not a Module 1 blocker |
| 8 | One org per user | A user *can* hold several memberships, but Module 1 ships **no org switcher** | Schema is ready; UI isn't needed yet |

---

## In scope

### Auth & tenancy
- Register (email + password) → creates `User` + `Organization` + `OWNER` membership in one transaction
- Login, logout, forgot password, reset password
- Invite a teammate by email with a role; accept-invite flow via token
- Role-based access control: `OWNER`, `ADMIN`, `MANAGER`, `TECHNICIAN`
- Every query scoped to the active organization

### Customers
- List with search (name, phone) + pagination
- Create, view, edit, archive (soft delete — jobs must keep pointing somewhere)
- Customer profile shows full job history and invoice history

### Jobs
- List, filterable by status / technician / date range
- Create, view, edit, cancel
- Per-org sequential job number
- Status workflow with enforced transitions + append-only history
- Job notes
- Assign / reassign a technician

### Scheduling
- Day view and week view
- Filter by technician; colour per technician
- Assign a date + time window on the job form

### Technician view
- `/my/jobs` — today + upcoming, assigned to me only
- `/my/jobs/[id]` — details, status update, add note
- Hard-blocked from customers, invoices, team, settings

### Invoices
- Generate from a completed job (line items prefilled from the service type)
- Line items: labour, parts, fee, discount
- Statuses: draft → sent → paid; overdue derived from `dueAt`
- Mark as paid manually (**no payment gateway**)
- Per-org sequential invoice number
- Printable HTML invoice view

### Notifications (email)
Transactional outbox: domain code enqueues a row, a dispatcher sends it.
Nine event types ship in Module 1:

`JOB_CREATED` · `JOB_ASSIGNED` · `APPOINTMENT_SCHEDULED` · `APPOINTMENT_RESCHEDULED`
`APPOINTMENT_REMINDER` · `JOB_COMPLETED` · `INVOICE_SENT` · `INVOICE_OVERDUE` · `TEAM_INVITE`

Plus a per-org preferences screen to toggle each event and each recipient class.

### Dashboard
Today's jobs · pending · completed · active technicians · revenue this month ·
outstanding invoices · today's schedule · recent activity (from job status history).

### Settings
Company profile (name, logo, contact, timezone, currency) · invoice defaults ·
notification preferences · user profile · service-type catalog.

---

## Explicitly out of scope

Everything here is a real feature we are choosing **not** to build yet. Say no
to each of these by name when you're tempted mid-build.

| Out | Lands in |
|---|---|
| AI classification, summaries, technician recommendation | Module 2 |
| Technician PWA, offline, camera, GPS, signature, push | Module 3 |
| Customer portal / customer login | Module 4 |
| WhatsApp, SMS | Module 4 |
| Payment gateway, subscription billing | Module 4 |
| Drag-and-drop calendar, conflict detection, route optimisation | Later |
| Recurring / contract jobs | Later |
| Multi-job invoices, partial payments, credit notes | Later |
| Quotes / estimates + approval | Later |
| Inventory and parts stock | Later |
| Org switcher, multiple orgs per session | Later |
| File/photo uploads anywhere | Module 3 |
| Audit log beyond job status history | Later |
| Charts and advanced analytics (dashboard ships **numbers only**) | Later |
| PDF generation (invoice is print-styled HTML) | Later |
| `ON_HOLD` / "waiting for parts" job status | Later — deliberate omission, keeps the state machine at six |

---

## Route-handler correction

The existing skeleton is API-route-shaped. With the App Router that's mostly
unnecessary work: mutations belong in **Server Actions**, which give you typed
args, no fetch boilerplate, and no hand-written auth check per verb.

Keep only these as route handlers:

- `app/api/auth/[...nextauth]/route.ts` — required by Auth.js
- `app/api/notifications/dispatch/route.ts` — invoked by cron, needs a URL
- `app/api/cron/reminders/route.ts` — enqueues next-day reminders
- future webhooks (payments, WhatsApp)

Everything else — customers, jobs, invoices, team — becomes `actions.ts`
co-located with its route segment.

### Three bugs already in the skeleton

1. `app/api/auth/[...nextauth]/customers/route.ts` — a customers endpoint nested
   **inside the NextAuth catch-all**. The catch-all swallows every path beneath
   it, so this route is unreachable. It should never have been under `auth/`.
2. `app/api/technicianns/route.ts` — typo, double `n`. Also redundant:
   technicians are memberships, so this is `team`.
3. `app/dashboard/dashboard/page.tsx` — renders at `/dashboard/dashboard`. The
   dashboard index is `app/dashboard/page.tsx`.

Also missing entirely: `app/layout.tsx`, `app/page.tsx`, `middleware.ts`, and
there is no `package.json` — the Next.js app is not initialised yet.

---

## Definition of done

**All but the last are met — see [04-build-log.md](./04-build-log.md) for how each
was verified.**


- [x] Two organizations exist in one database and **neither can read the other's
      rows** — proven by a test that authenticates as org A and requests org B's
      job id, expecting 404
- [x] A technician login can reach `/my/jobs` and **cannot** reach `/dashboard/invoices`
- [x] A job can travel `NEW → SCHEDULED → ASSIGNED → IN_PROGRESS → COMPLETED`,
      and every hop is a row in `job_status_history`
- [x] An illegal transition (e.g. `NEW → COMPLETED`) is rejected server-side
- [x] Completing a job enqueues a customer email; the dispatcher sends it and
      marks the row `SENT`
- [x] Killing the email provider (bad API key) does **not** fail the job update
- [x] An invoice's `totalCents` always equals the sum of its items plus tax
- [x] Job and invoice numbers are gap-free per org under concurrent creation
- [ ] Deployed on Vercel with a hosted Postgres, seeded with one demo org — **outstanding**, needs a Vercel account (`vercel.json` and the seed are ready)
