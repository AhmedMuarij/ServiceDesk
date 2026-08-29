# ServiceOps

Service management for small field-service businesses — AC repair, plumbing,
electrical, appliance repair, pest control. Customers, jobs, scheduling,
technicians, and invoices in one multi-tenant workspace, with the repetitive
customer email handled automatically.

**Status:** Modules 1 and 2 complete. Auth, multi-tenancy, customers, jobs, scheduling, team, invoices and email all working; five AI features on top, each of which proposes and never writes. Deployment is the one outstanding item.

---

## Getting started

```bash
npm install
```

Create `.env` from `.env.example` and set both Postgres URLs —
[Neon](https://neon.tech) and [Supabase](https://supabase.com) both have a free
tier that's plenty for development.

- `DATABASE_URL` — the **pooled** connection string, used by the app at runtime.
- `DIRECT_URL` — the same string with `-pooler` removed from the host. Migrations
  need a direct connection; a transaction-mode pooler can't run DDL or hold the
  advisory locks Prisma Migrate takes out.

```bash
npm run db:migrate                   # create the schema
npm run db:seed                      # a demo workspace with a week of work
npm run dev                          # http://localhost:3000
```

> **Prisma 7 note.** Connection URLs no longer live in `schema.prisma`. Migrations
> read `DIRECT_URL` via [`prisma.config.ts`](prisma.config.ts); the runtime client
> takes `DATABASE_URL` through a driver adapter in
> [`lib/db/prisma.ts`](lib/db/prisma.ts). Both `prisma` and `@prisma/client` are
> pinned to exactly `7.10.0` — npm's `latest` tag currently points at an
> `8.0.0-rc`, so an unpinned install silently mismatches the CLI and the client.

`AUTH_SECRET` and `CRON_SECRET` are already generated in `.env`.
`RESEND_API_KEY` is only needed once the notification dispatcher exists (step 11).

### Scripts

| Command | What it does |
|---|---|
| `npm run dev` | Dev server |
| `npm run build` | Production build |
| `npm run typecheck` | `tsc --noEmit` |
| `npm run db:migrate` | Create and apply a migration |
| `npm run db:push` | Push schema without a migration (prototyping only) |
| `npm run db:studio` | Prisma Studio |
| `npm run db:seed` | Seed a demo organization |
| `npm test` | Unit tests (transitions, money, time zones) |
| `npm run check` | Typecheck + unit tests |
| `npm run verify` | Tenancy, invoice maths, numbering, history — hits the database |
| `npm run verify:outbox` | The notification outbox, including a provider outage |
| `npm run verify:http` | Tenancy and roles over real HTTP — needs `npm run dev` running |
| `npm run verify:ai` | Module 2 invariants — the model has no write path |
| `npm run eval:classification` | 20 scored fixtures, ~2 min, free |
| `npm run ai:models` | Which Gemini models your key can reach |

---

## Documentation

Read these before adding anything — Module 1's scope is frozen, and the
exclusions are deliberate.

| Doc | Contents |
|---|---|
| [docs/01-module-1-scope.md](docs/01-module-1-scope.md) | What ships, what doesn't, and the definition of done |
| [docs/02-screens-and-flows.md](docs/02-screens-and-flows.md) | 30 screens, the job status machine, six flows, build order |
| [docs/03-data-model.md](docs/03-data-model.md) | Why the schema is shaped the way it is |
| [prisma/schema.prisma](prisma/schema.prisma) | 17 models |
| [docs/04-build-log.md](docs/04-build-log.md) | Module 1: what shipped, deviations, how each criterion was verified |
| [docs/05-module-2-scope.md](docs/05-module-2-scope.md) | Module 2 scope: what AI is and is not allowed to do |
| [docs/06-module-2-build-log.md](docs/06-module-2-build-log.md) | Module 2: measured accuracy, and the three defects testing caught |

---

## Architecture in four sentences

**Multi-tenancy** is a shared schema with `organizationId` on every tenant row,
reached only through a scoped data-access layer in `lib/db/` — application code
never calls `prisma.*` for tenant data directly.

**A technician is a `Membership` with `role = TECHNICIAN`**, not a table of its
own, so jobs attach to the membership and survive someone leaving the org.

**Mutations are Server Actions**, not REST routes; only four things need a URL
(`[...nextauth]`, the notification dispatcher, the reminder cron, and future
webhooks).

**AI proposes, never writes.** Every model output is an `AiSuggestion` a human accepts or rejects; applying it goes through the ordinary write paths with their validation and history. `npm run verify:ai` enforces that structurally.

**Email is a transactional outbox** — domain code writes a `Notification` row in
the same transaction as the change that caused it, and a cron-driven dispatcher
sends it, so an email provider outage can never fail a job update.

---

## Deploying

Import the repo on Vercel and set the environment variables from
[.env.example](.env.example) — with one exception: **do not set `AUTH_URL`**.
Auth.js derives its base URL from the request host, and emailed links use
Vercel's own `VERCEL_PROJECT_PRODUCTION_URL`, so production and preview
deployments both resolve correctly with nothing to maintain. Setting it to
`http://localhost:3000` sends every sign-in redirect and every emailed link to
localhost.

Vercel's Hobby plan caps cron jobs at one run per day. The nightly reminder fits
and stays in [vercel.json](vercel.json); the notification dispatcher runs every
five minutes from
[.github/workflows/dispatch-notifications.yml](.github/workflows/dispatch-notifications.yml)
instead, which needs two repository secrets — `APP_URL` and `CRON_SECRET`.

## Signing in to the demo

After `npm run db:seed`:

| Email | Password | Role |
|---|---|---|
| `owner@serviceops.demo` | `demo1234` | Owner |
| `manager@serviceops.demo` | `demo1234` | Manager |
| `hamza@serviceops.demo` | `demo1234` | Technician — lands on `/my/jobs` |

## Stack

Next.js 16 (App Router) · React 19 · TypeScript · Tailwind CSS 4 ·
Prisma · PostgreSQL · Auth.js v5 · Resend · Google Gemini · Vercel

## Roadmap

- **Module 1** — core: auth, tenancy, customers, jobs, scheduling, invoices, email ✅
- **Module 2** — AI: classification, summaries, technician recommendation, invoice drafts, weekly insight ✅
- **Module 3** — technician PWA: offline, camera, GPS, signature, push
- **Module 4** — customer portal, WhatsApp, payments
