# Module 1 — Data Model Notes

The schema itself is [`prisma/schema.prisma`](../prisma/schema.prisma). This file
records the reasoning, and the invariants the schema alone can't enforce.

15 models: `User` `Account` `Session` `VerificationToken` `PasswordResetToken`
`Organization` `Membership` `TechnicianProfile` `ServiceType` `Customer` `Job`
`JobStatusHistory` `JobNote` `Invoice` `InvoiceItem` `Notification`
`NotificationPreference`.

---

## 1. Technician is not a table

The obvious design gives technicians their own table. It's wrong, and the pain
arrives in Module 3 when they need logins: you'd be migrating live job
assignments from `technicians.id` to `users.id` while the app is running.

Instead:

```
User ──< Membership >── Organization
              │
              └── TechnicianProfile   (only for members who do field work)
```

`Membership` is the tenancy join *and* the identity a job is assigned to.
Consequences worth knowing:

- **Jobs point at `Membership`, never at `User`.** Remove someone from the org
  and their job history stays intact and correctly attributed.
- **A pending invite is a `Membership` with `userId = null`.** No separate
  invitations table. Postgres treats `NULL`s as distinct under a unique index,
  so `@@unique([organizationId, userId])` permits many pending invites while
  still preventing a user from joining the same org twice.
- The same person can be a technician at one company and an owner at another.
  Free, because role lives on the membership.

---

## 2. Tenancy is enforced in one place

`organizationId` on every tenant-owned row is necessary but not sufficient — the
leak happens the day someone writes `prisma.job.findUnique({ where: { id } })`
and forgets the scope.

Rule: **application code never touches `prisma.*` for tenant data directly.**
Everything goes through a scoped accessor:

```ts
// lib/db/scope.ts
export async function getScope() {
  const session = await auth();
  if (!session?.user) throw new UnauthorizedError();
  return {
    orgId: session.user.orgId,
    membershipId: session.user.membershipId,
    role: session.user.role,
  };
}

// lib/db/jobs.ts — every function opens with the scope
export async function getJob(id: string) {
  const { orgId } = await getScope();
  return prisma.job.findFirst({ where: { id, organizationId: orgId } });
}
```

`findFirst` with the org in the `where`, not `findUnique` then a check — a miss
returns `null`, which becomes a 404. A cross-tenant probe learns nothing about
whether the id exists.

The session token carries `{ orgId, membershipId, role }`, populated in the
Auth.js `jwt` callback so no request needs an extra membership lookup.

> Postgres row-level security would make this structural rather than
> disciplinary. It's Module 4 hardening — deliberately not a Module 1 blocker.

---

## 3. Money

Every monetary column is an `Int` of minor units, suffixed `Cents`. Currency is
per-organization (`Organization.currency`, ISO 4217) and snapshotted onto each
invoice, so changing the org currency never rewrites history.

Tax is `taxRateBps` — **basis points**, so 17% is `1700`. Integer percentages
can't express 17.5%; a float rate reintroduces the rounding problem.

```
item.amountCents  = quantity * unitPriceCents
subtotalCents     = Σ item.amountCents
taxCents          = round(subtotalCents * taxRateBps / 10_000)
totalCents        = subtotalCents + taxCents
```

Totals are **stored, not computed on read** — an invoice is a record of what was
sent, and must not change when a service-type price is edited later. Recompute
and rewrite them on every draft-invoice mutation, in one place.

Format only at the edge, via `Intl.NumberFormat`. Never construct `"$" + x/100`.

---

## 4. Per-org sequential numbers

Customers accept `JOB #1048`; they don't accept `cmf3x9q…`. Both jobs and
invoices carry a per-org counter alongside the cuid primary key.

`@@unique([organizationId, number])` stops duplicates, but the *allocation* is a
read-modify-write and races under concurrency. Allocate atomically inside the
same transaction that creates the row:

```ts
const job = await prisma.$transaction(async (tx) => {
  const org = await tx.organization.update({
    where: { id: orgId },
    data: { nextJobNumber: { increment: 1 } },
    select: { nextJobNumber: true },
  });
  return tx.job.create({
    data: { organizationId: orgId, number: org.nextJobNumber - 1, ...input },
  });
});
```

The `update` takes a row lock on the organization for the transaction's
duration, so two concurrent creates serialise instead of colliding. Keep those
transactions short — the org row is a contention point per tenant.

---

## 5. Status history is append-only

`JobStatusHistory` is written in the same transaction as the status change,
never after. If the update rolls back, the history row goes with it, and the two
can't disagree.

This one table gives you, free:
- the job timeline on the detail screen
- "Recent activity" on the dashboard
- who changed what, when
- real cycle-time data for Module 2 (`ASSIGNED` → `COMPLETED` per technician)

`Job.startedAt` / `completedAt` duplicate what history already implies. That's
deliberate: dashboard queries shouldn't have to aggregate a history table.

---

## 6. Notifications are an outbox, not a send

The failure mode to design against: the email API is down, the `sendEmail()`
call throws, and the technician's "job completed" tap fails. The job update and
the email must not share a fate.

So a domain action only ever **writes a row**:

```
completeJob()  ──transaction──►  Job.status = COMPLETED
                                 JobStatusHistory(+1)
                                 Notification(PENDING)
                                        │
                       cron ────────────┘
                        └─► dispatch → provider → SENT | retry | FAILED
```

Design points:

- **`payload` is snapshotted at enqueue time.** The email says what was true when
  the event happened, even if the customer is renamed before it sends.
- **`dedupeKey` is uniquely indexed.** `"reminder:<jobId>:2026-08-30"` means the
  nightly cron can run five times and send once. The DB enforces it, not the code.
- **The dispatcher claims work** with `UPDATE … SET status = SENDING WHERE
  status = PENDING AND scheduledFor <= now() LIMIT 50 FOR UPDATE SKIP LOCKED`.
  Two overlapping cron invocations can't send the same email twice.
- **`attempts` + `lastError` + backoff**, giving up at 5. Failures are visible
  rows, not lost log lines.
- **`channel` is an enum with one value today.** `SMS`, `WHATSAPP`, `PUSH` slot
  in without a single caller changing — which is the whole point of section 12
  of the product spec.

`NotificationPreference` is checked at *enqueue* time, so a disabled event never
creates a row at all.

---

## 7. Deletes

Nothing tenant-owned is hard-deleted in Module 1.

| Model | Behaviour |
|---|---|
| `Customer` | `archivedAt` timestamp; hidden from lists, jobs keep resolving |
| `Job` | `CANCELLED` status, never removed |
| `Invoice` | `CANCELLED` status — deleting a numbered invoice breaks the sequence |
| `Membership` | `SUSPENDED` status; assigned jobs stay attributed |
| `ServiceType` | `isActive = false`; existing jobs keep pointing at it |

FK policies encode this: `onDelete: Restrict` from `Job` and `Invoice` to
`Customer` (a customer with history *cannot* be deleted), `SetNull` for
attribution links like `assignedTo` and `createdBy`, `Cascade` only from
`Organization` down — so removing a tenant genuinely removes its data.

---

## 8. Indexes and why

Every index is a real Module 1 query, not a guess:

| Index | Serves |
|---|---|
| `Job(organizationId, status, scheduledStart)` | Dashboard "today's jobs", jobs list filtered by status |
| `Job(organizationId, assignedMembershipId, scheduledStart)` | `/my/jobs`, schedule filtered by technician |
| `Job(organizationId, customerId)` | Job history on the customer profile |
| `Customer(organizationId, name)` / `(…, phone)` | Customer search |
| `Invoice(organizationId, status, dueAt)` | Outstanding + the overdue cron |
| `Notification(status, scheduledFor)` | The dispatcher's claim query — **not** org-scoped, it's cross-tenant by design |
| `JobStatusHistory(jobId, createdAt)` | Job timeline |

---

## 9. What this schema is already ready for

Not built in Module 1, but it costs nothing to have left the door open:

- **Module 2 (AI)** — `TechnicianProfile.skills` + `ServiceType` + status history
  give a recommender its features. AI-suggested classification writes to the same
  `Job.serviceTypeId` a human would.
- **Module 3 (PWA)** — technicians already have logins, memberships, and
  assignments. The PWA is a second UI over the same rows.
- **New channels** — `NotificationChannel` widens; no caller changes.
- **Multi-job invoices** — `Invoice.jobId` unique becomes a join table. A real
  migration, but a contained one.
- **Org switching** — the schema already supports many memberships per user;
  only the UI is missing.
