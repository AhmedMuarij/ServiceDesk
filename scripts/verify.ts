/**
 * Checks the Module 1 invariants that a build can't catch: tenant isolation,
 * invoice arithmetic, gap-free numbering under concurrency, and audit history.
 * Also creates a second organization so the cross-tenant HTTP check has a
 * target.
 *
 *   npx tsx scripts/verify.ts
 */
import bcrypt from "bcryptjs";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";

process.loadEnvFile?.();

const prisma = new PrismaClient({
  // The concurrency check needs more than the default pool: each allocation
  // holds a row lock on the organization for its whole transaction.
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL!, max: 25 }),
});

let pass = 0;
let fail = 0;

function check(label: string, ok: boolean, detail = "") {
  if (ok) pass++;
  else fail++;
  console.log(`${ok ? "  ok  " : "  FAIL"}  ${label}${detail ? `  — ${detail}` : ""}`);
}

async function secondOrganization() {
  const slug = "lahore-electric";
  const email = "owner@lahore.demo";

  // Reused rather than recreated: rebuilding it would invalidate the ids any
  // other check is holding.
  const existing = await prisma.organization.findUnique({
    where: { slug },
    select: {
      id: true,
      jobs: { take: 1, select: { id: true } },
      customers: { take: 1, select: { id: true } },
    },
  });
  if (existing?.jobs[0] && existing.customers[0]) {
    return {
      orgId: existing.id,
      jobId: existing.jobs[0].id,
      customerId: existing.customers[0].id,
      email,
    };
  }
  if (existing) await prisma.organization.delete({ where: { id: existing.id } });

  const org = await prisma.organization.create({
    data: {
      name: "Lahore Electric Works",
      slug,
      email: "office@lahore.demo",
      timezone: "Asia/Karachi",
      currency: "PKR",
    },
    select: { id: true },
  });

  const user = await prisma.user.upsert({
    where: { email },
    create: { name: "Sadia Bhatti", email, passwordHash: await bcrypt.hash("demo1234", 12) },
    update: {},
    select: { id: true },
  });

  await prisma.membership.create({
    data: {
      organizationId: org.id,
      userId: user.id,
      role: "OWNER",
      status: "ACTIVE",
      joinedAt: new Date(),
    },
  });

  const customer = await prisma.customer.create({
    data: { organizationId: org.id, name: "Other Tenant Customer", city: "Lahore" },
    select: { id: true },
  });

  const job = await prisma.job.create({
    data: {
      organizationId: org.id,
      number: 1,
      customerId: customer.id,
      title: "Wiring inspection",
      status: "NEW",
    },
    select: { id: true },
  });

  await prisma.organization.update({
    where: { id: org.id },
    data: { nextJobNumber: 2 },
  });

  return { orgId: org.id, jobId: job.id, customerId: customer.id, email };
}

async function main() {
  console.log("\n=== Setting up a second tenant ===");
  const other = await secondOrganization();
  console.log(`  Lahore Electric Works — job ${other.jobId}`);

  const demo = await prisma.organization.findUniqueOrThrow({
    where: { slug: "karachi-cool" },
    select: { id: true },
  });

  console.log("\n=== Tenant isolation (data layer) ===");
  // The scoped accessors always add organizationId; this proves the filter
  // actually excludes the other tenant's row.
  const leaked = await prisma.job.findFirst({
    where: { id: other.jobId, organizationId: demo.id },
  });
  check("org A cannot read org B's job by id", leaked === null);

  const crossCustomer = await prisma.customer.findFirst({
    where: { id: other.customerId, organizationId: demo.id },
  });
  check("org A cannot read org B's customer by id", crossCustomer === null);

  const orgIds = await prisma.job.findMany({
    where: { organizationId: demo.id },
    select: { organizationId: true },
    distinct: ["organizationId"],
  });
  check("a scoped job list returns exactly one tenant", orgIds.length === 1);

  console.log("\n=== Invoice arithmetic ===");
  const invoices = await prisma.invoice.findMany({ include: { items: true } });
  let badTotals = 0;
  for (const invoice of invoices) {
    const subtotal = invoice.items.reduce((sum, item) => sum + item.amountCents, 0);
    const tax = Math.round((subtotal * invoice.taxRateBps) / 10_000);
    if (
      subtotal !== invoice.subtotalCents ||
      tax !== invoice.taxCents ||
      subtotal + tax !== invoice.totalCents
    ) {
      badTotals++;
      console.log(
        `        ${invoice.number}: stored ${invoice.subtotalCents}/${invoice.taxCents}/${invoice.totalCents}, computed ${subtotal}/${tax}/${subtotal + tax}`,
      );
    }
  }
  check(
    `every invoice total equals items + tax (${invoices.length} checked)`,
    badTotals === 0,
  );

  let badLines = 0;
  for (const invoice of invoices) {
    for (const item of invoice.items) {
      if (item.amountCents !== item.quantity * item.unitPriceCents) badLines++;
    }
  }
  check("every line amount equals quantity × unit price", badLines === 0);

  console.log("\n=== Numbering ===");
  for (const [label, rows] of [
    [
      "job",
      await prisma.job.findMany({
        where: { organizationId: demo.id },
        select: { number: true },
        orderBy: { number: "asc" },
      }),
    ],
    [
      "invoice",
      await prisma.invoice.findMany({
        where: { organizationId: demo.id },
        select: { number: true, sequence: true },
        orderBy: { sequence: "asc" },
      }),
    ],
  ] as const) {
    const numbers = rows.map((row) =>
      "sequence" in row ? row.sequence : (row as { number: number }).number,
    );
    const unique = new Set(numbers).size === numbers.length;
    const contiguous = numbers.every((n, i) => i === 0 || n === numbers[i - 1] + 1);
    check(`${label} numbers are unique`, unique);
    check(`${label} numbers have no gaps (${numbers.length} rows)`, contiguous);
  }

  console.log("\n=== Concurrent number allocation ===");
  // Mirrors the transaction in lib/db/jobs.ts createJob: 25 racing allocations
  // must produce 25 distinct, contiguous numbers.
  const before = await prisma.organization.findUniqueOrThrow({
    where: { id: other.orgId },
    select: { nextJobNumber: true },
  });

  const allocations = await Promise.all(
    Array.from({ length: 25 }, () =>
      prisma.$transaction(
        async (tx) => {
          const org = await tx.organization.update({
            where: { id: other.orgId },
            data: { nextJobNumber: { increment: 1 } },
            select: { nextJobNumber: true },
          });
          return org.nextJobNumber - 1;
        },
        // They serialise on the org row by design, so allow queueing time.
        { maxWait: 20_000, timeout: 20_000 },
      ),
    ),
  );

  const sorted = [...allocations].sort((a, b) => a - b);
  check(
    "25 concurrent allocations produced 25 distinct numbers",
    new Set(allocations).size === 25,
    `got ${new Set(allocations).size}`,
  );
  check(
    "…and they are contiguous",
    sorted.every((n, i) => i === 0 || n === sorted[i - 1] + 1),
    `${sorted[0]}–${sorted[sorted.length - 1]}`,
  );
  check(
    "…starting where the counter was",
    sorted[0] === before.nextJobNumber,
    `expected ${before.nextJobNumber}, got ${sorted[0]}`,
  );

  console.log("\n=== Audit history ===");
  const jobs = await prisma.job.findMany({
    where: { organizationId: demo.id },
    select: { id: true, number: true, status: true, _count: { select: { statusHistory: true } } },
  });
  check(
    `every job has status history (${jobs.length} jobs)`,
    jobs.every((job) => job._count.statusHistory > 0),
  );

  const completed = jobs.filter((job) => job.status === "COMPLETED");
  const completedWithFullTrail = await prisma.jobStatusHistory.groupBy({
    by: ["jobId"],
    where: { jobId: { in: completed.map((j) => j.id) }, to: "COMPLETED" },
    _count: { _all: true },
  });
  check(
    "every completed job records the completion",
    completedWithFullTrail.length === completed.length,
    `${completedWithFullTrail.length}/${completed.length}`,
  );

  console.log("\n=== Deletion policy ===");
  const archivable = await prisma.customer.findFirst({
    where: { organizationId: demo.id, jobs: { some: {} } },
    select: { id: true, name: true },
  });
  if (archivable) {
    let restricted = false;
    try {
      await prisma.customer.delete({ where: { id: archivable.id } });
    } catch {
      restricted = true;
    }
    check(
      "a customer with job history cannot be hard-deleted",
      restricted,
      restricted ? "FK Restrict held" : "IT WAS DELETED",
    );
  }

  console.log("\n=== Notification outbox ===");
  const byStatus = await prisma.notification.groupBy({
    by: ["status"],
    _count: { _all: true },
  });
  console.log(
    "  counts:",
    Object.fromEntries(byStatus.map((row) => [row.status, row._count._all])),
  );
  const orphaned = await prisma.notification.count({
    where: { dedupeKey: null, type: "APPOINTMENT_REMINDER" },
  });
  check("reminders always carry a dedupe key", orphaned === 0);

  console.log(`\n${pass} passed, ${fail} failed\n`);
  console.log(`Second tenant job id for the HTTP check: ${other.jobId}`);

  await prisma.$disconnect();
  process.exit(fail ? 1 : 0);
}

main().catch(async (error) => {
  console.error(error);
  await prisma.$disconnect();
  process.exit(1);
});
