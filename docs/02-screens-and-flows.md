# Module 1 — Screens & Flows

30 screens. Status column: **exists** = an empty placeholder file is already
there, **fix** = the file exists at the wrong path, **new** = doesn't exist yet.

---

## Screen inventory

### Public / auth — 7 screens

| Route | File | Status | Notes |
|---|---|---|---|
| `/` | `app/page.tsx` | new | Marketing landing; CTA → register |
| `/auth/register` | `app/auth/register/page.tsx` | exists | Also collects **company name** — creates org in the same transaction |
| `/auth/login` | `app/auth/login/page.tsx` | exists | |
| `/auth/forgot-password` | `app/auth/forgot-password/page.tsx` | fix | Skeleton has `forgotpassword` — rename for the URL |
| `/auth/reset-password` | `app/auth/reset-password/page.tsx` | new | Consumes `?token=` |
| `/invite/[token]` | `app/invite/[token]/page.tsx` | new | Accept invite; register-or-login then attach membership |
| `/onboarding` | `app/onboarding/page.tsx` | new | Post-signup: timezone, currency, first 3 service types |

### Dashboard shell — admin / manager

| Route | File | Status | Notes |
|---|---|---|---|
| `/dashboard` | `app/dashboard/page.tsx` | **fix** | Skeleton has `dashboard/dashboard` → renders at the wrong URL |
| — | `app/dashboard/layout.tsx` | new | Sidebar, org header, role guard |

### Customers — 4 screens

| Route | File | Status |
|---|---|---|
| `/dashboard/customers` | `customers/page.tsx` | exists |
| `/dashboard/customers/new` | `customers/new/page.tsx` | exists |
| `/dashboard/customers/[id]` | `customers/[id]/page.tsx` | exists |
| `/dashboard/customers/[id]/edit` | `customers/[id]/edit/page.tsx` | exists |

### Jobs — 4 screens

| Route | File | Status |
|---|---|---|
| `/dashboard/jobs` | `jobs/page.tsx` | exists |
| `/dashboard/jobs/new` | `jobs/new/page.tsx` | exists |
| `/dashboard/jobs/[id]` | `jobs/[id]/page.tsx` | exists |
| `/dashboard/jobs/[id]/edit` | `jobs/[id]/edit/page.tsx` | exists |

### Schedule — 1 screen

| Route | File | Status | Notes |
|---|---|---|---|
| `/dashboard/schedule` | `schedule/page.tsx` | exists | `?view=day\|week&date=&tech=` in the URL, not in state |

### Invoices — 4 screens

| Route | File | Status | Notes |
|---|---|---|---|
| `/dashboard/invoices` | `invoices/page.tsx` | exists | |
| `/dashboard/invoices/new` | `invoices/new/page.tsx` | exists | Accepts `?jobId=` from a completed job |
| `/dashboard/invoices/[id]` | `invoices/[id]/page.tsx` | exists | |
| `/dashboard/invoices/[id]/edit` | `invoices/[id]/edit/page.tsx` | new | Draft-only |
| `/dashboard/invoices/[id]/print` | `invoices/[id]/print/page.tsx` | new | Bare layout, print stylesheet |

### Team — 3 screens

| Route | File | Status | Notes |
|---|---|---|---|
| `/dashboard/team` | `team/page.tsx` | exists | Members + pending invites |
| `/dashboard/team/new` | `team/new/page.tsx` | exists | Really an **invite** form: email + role |
| `/dashboard/team/[id]` | `team/[id]/page.tsx` | exists | Profile, skills, workload, change role |

### Settings — 5 screens

| Route | File | Status | Notes |
|---|---|---|---|
| `/dashboard/settings` | `settings/page.tsx` | exists | Index / nav |
| `/dashboard/settings/company` | `settings/company/page.tsx` | exists | Name, logo, timezone, currency, invoice defaults |
| `/dashboard/settings/profile` | `settings/profile/page.tsx` | exists | Own name, password |
| `/dashboard/settings/notifications` | `settings/notifications/page.tsx` | exists | Toggle each of the 9 event types |
| `/dashboard/settings/services` | `settings/services/page.tsx` | new | Service-type catalog |

### Technician — 2 screens

| Route | File | Status | Notes |
|---|---|---|---|
| `/my/jobs` | `app/my/jobs/page.tsx` | new | Today + upcoming, mine only |
| `/my/jobs/[id]` | `app/my/jobs/[id]/page.tsx` | new | Details, status buttons, notes |

---

## Job status machine

The linear `NEW → SCHEDULED → ASSIGNED` in the original write-up doesn't survive
contact with a dispatcher — in practice you often assign a technician before you
have a time slot, or set both at once. So status is **derived from two
independent facts** and then enforced:

| Status | Has a time? | Has a technician? |
|---|---|---|
| `NEW` | no | no |
| `SCHEDULED` | **yes** | no |
| `ASSIGNED` | **yes** | **yes** |
| `IN_PROGRESS` | yes | yes |
| `COMPLETED` | yes | yes |
| `CANCELLED` | — | — |

Assigning a technician to a job with no time leaves it `NEW` and shows a
"needs a time slot" badge. That's the honest model.

### Allowed transitions

```
NEW ──────────► SCHEDULED ──────► ASSIGNED ──────► IN_PROGRESS ──────► COMPLETED
 │                  │  ▲              │  ▲                                 │
 │                  │  └──unschedule──┘  │                                 │
 │                  └────────unassign────┘                                 │
 │                                                                          │
 └──────────────────────► CANCELLED ◄──────────────────────────────────────┘
                          (from any state except COMPLETED)
```

Rules, enforced server-side in one place — `lib/jobs/transitions.ts`:

- `COMPLETED` is terminal. No un-completing; issue a new job instead.
- `CANCELLED` is terminal and reachable from anything except `COMPLETED`.
- `IN_PROGRESS` requires an assigned technician — a job can't start itself.
- Only the assigned technician, or a `MANAGER`+, may set `IN_PROGRESS`/`COMPLETED`.
- Every accepted transition writes a `JobStatusHistory` row **in the same
  transaction** as the status update, and enqueues its notifications there too.

---

## Flows

### 1. Signup → first job

```
/auth/register  (name, email, password, company name)
   └─ transaction: User + Organization + Membership(OWNER)
        └─ /onboarding  (timezone, currency, 3 service types)
             └─ /dashboard  — empty state: "Add your first customer"
```

### 2. Job intake (the core loop)

```
Customer calls: "AC cooling nahi kar raha"
   │
   ├─ /dashboard/customers/new   (or pick an existing one)
   │
   ├─ /dashboard/jobs/new
   │     customer · service type · description · priority
   │     optional: date + time window · technician
   │     └─ transaction:
   │          org.nextJobNumber++  →  Job(number, status)
   │          JobStatusHistory(null → status)
   │          Notification(JOB_CREATED → org)
   │          Notification(APPOINTMENT_SCHEDULED → customer)  if time set
   │          Notification(JOB_ASSIGNED → technician)         if tech set
   │
   └─ /dashboard/schedule — the job appears in the technician's lane
```

### 3. Technician's day

```
/my/jobs
   └─ tap job → /my/jobs/[id]
        [Start Job]     → IN_PROGRESS   (startedAt = now)
        [Add Note]      → JobNote
        [Complete Job]  → COMPLETED     (completedAt = now)
             └─ Notification(JOB_COMPLETED → customer)
             └─ dashboard shows "Ready to invoice"
```

### 4. Completion → invoice → paid

```
/dashboard/jobs/[id]  →  [Generate Invoice]
   └─ /dashboard/invoices/new?jobId=…
        line items prefilled from the service type's default price
        └─ transaction: org.nextInvoiceNumber++ → Invoice(DRAFT)
   └─ [Send]  → status SENT, issuedAt/dueAt set
        └─ Notification(INVOICE_SENT → customer)
   └─ [Mark Paid] → status PAID, paidAt set, amountPaidCents = totalCents

Nightly cron: SENT invoices past dueAt → OVERDUE + Notification(INVOICE_OVERDUE)
```

### 5. Invite a teammate

```
/dashboard/team/new   (email + role)
   └─ Membership(userId: null, status: INVITED, inviteToken, expires in 7 days)
   └─ Notification(TEAM_INVITE → invitee)
        └─ /invite/[token]
             ├─ email already has an account → login → membership.userId set
             └─ new person → set password → User created → membership attached
             └─ status: ACTIVE, joinedAt = now
```

### 6. Notification lifecycle

```
Domain action (same DB transaction)
   └─ check NotificationPreference for this org + type
        └─ enabled? → INSERT Notification(status: PENDING, scheduledFor)
                            with a dedupeKey where repeats are possible

Cron every 5 min → POST /api/notifications/dispatch
   └─ claim: UPDATE … SET status = SENDING
             WHERE status = PENDING AND scheduledFor <= now()
             LIMIT 50  FOR UPDATE SKIP LOCKED          ← two workers never collide
   └─ render template with the snapshotted payload
   └─ send via the email provider
        ├─ ok   → SENT, providerMessageId, sentAt
        └─ fail → attempts++, lastError
                   attempts < 5 ? back to PENDING with exponential backoff
                                : FAILED

Cron nightly → /api/cron/reminders
   └─ jobs scheduled tomorrow → APPOINTMENT_REMINDER
        dedupeKey = "reminder:<jobId>:<date>"  ← re-running the cron sends nothing twice
```

---

## Build order

Each step should end with something you can actually click.

1. `create-next-app`, Tailwind, shadcn/ui, Prisma, Postgres, first migration
2. Auth.js: register (+ org), login, session carrying `{ membershipId, orgId, role }`
3. `middleware.ts` + `requireRole()` + the scoped data-access layer — **tenancy before features**
4. Dashboard shell: layout, sidebar, empty dashboard
5. Customers (full CRUD — the simplest end-to-end vertical slice)
6. Service types in settings
7. Jobs: CRUD + the transition engine + history
8. Team: invite, accept, roles, technician profiles
9. Job assignment + `/my/jobs`
10. Schedule: day, then week
11. Notification outbox + dispatcher + templates + preferences screen
12. Invoices: generate, items, send, mark paid, print view
13. Dashboard metrics (real queries)
14. Reminder + overdue crons
15. Seed script, deploy, demo org
