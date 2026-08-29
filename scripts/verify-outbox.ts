/**
 * Proves the notification outbox behaves as designed:
 *  - a domain write and its email are enqueued in one transaction
 *  - the dispatcher sends and marks SENT
 *  - a provider outage leaves the domain write intact and retries the email
 *  - dedupeKey makes re-running a cron a no-op
 *
 *   npx tsx scripts/verify-outbox.ts
 */
// Marks this file as a module, so its locals do not collide with the other
// scripts under tsc.
export {};

process.loadEnvFile?.();

let pass = 0;
let fail = 0;

function check(label: string, ok: boolean, detail = "") {
  if (ok) pass++;
  else fail++;
  console.log(`  ${ok ? "ok  " : "FAIL"}  ${label}${detail ? `  — ${detail}` : ""}`);
}

async function main() {
  const { prisma } = await import("../lib/db/prisma");
  const { enqueueNotifications } = await import("../lib/notifications/enqueue");
  const { dispatchNotifications } = await import("../lib/notifications/dispatch");

  const org = await prisma.organization.findUniqueOrThrow({
    where: { slug: "karachi-cool" },
    select: { id: true, name: true, timezone: true },
  });

  // Start from a clean outbox so the counts below mean something.
  await prisma.notification.deleteMany({ where: { organizationId: org.id } });

  const job = await prisma.job.findFirstOrThrow({
    where: { organizationId: org.id, status: "COMPLETED" },
    select: {
      id: true,
      number: true,
      title: true,
      updatedAt: true,
      customer: { select: { name: true, email: true } },
    },
  });

  const payload = {
    jobNumber: job.number,
    jobTitle: job.title,
    customerName: job.customer.name,
    orgName: org.name,
    timezone: org.timezone,
    scheduledStart: null,
    address: null,
    serviceName: null,
    technicianName: null,
  };

  console.log("\n=== Enqueue happens inside the domain transaction ===");
  await prisma.$transaction(async (tx) => {
    await tx.job.update({ where: { id: job.id }, data: { title: job.title } });
    await enqueueNotifications(tx, {
      organizationId: org.id,
      type: "JOB_COMPLETED",
      subject: `Your service is complete — job #${job.number}`,
      payload,
      jobId: job.id,
      recipients: [
        { kind: "CUSTOMER", email: job.customer.email, name: job.customer.name },
      ],
    });
  });

  let queued = await prisma.notification.findFirst({
    where: { organizationId: org.id, jobId: job.id },
    orderBy: { createdAt: "desc" },
  });
  check("completing a job queues a customer email", queued?.status === "PENDING");

  console.log("\n=== A rolled-back domain write queues nothing ===");
  const before = await prisma.notification.count({ where: { organizationId: org.id } });
  await prisma.$transaction(async (tx) => {
    await enqueueNotifications(tx, {
      organizationId: org.id,
      type: "JOB_COMPLETED",
      subject: "should never exist",
      payload,
      jobId: job.id,
      recipients: [{ kind: "CUSTOMER", email: "rollback@example.com" }],
    });
    throw new Error("simulated failure after enqueue");
  }).catch(() => {});
  const after = await prisma.notification.count({ where: { organizationId: org.id } });
  check("the notification rolls back with the transaction", before === after, `${before} → ${after}`);

  console.log("\n=== Dispatcher sends and marks SENT ===");
  delete process.env.RESEND_API_KEY; // dev mode: log instead of send
  const ok = await dispatchNotifications();
  queued = await prisma.notification.findUnique({ where: { id: queued!.id } });
  check("dispatch claims and sends", ok.sent === 1 && ok.failed === 0, JSON.stringify(ok));
  check("row is marked SENT with a provider id", queued?.status === "SENT" && Boolean(queued?.providerMessageId));

  console.log("\n=== A provider outage does not touch the job ===");
  const jobBefore = await prisma.job.findUniqueOrThrow({
    where: { id: job.id },
    select: { status: true, completedAt: true, title: true },
  });

  await prisma.$transaction(async (tx) => {
    await enqueueNotifications(tx, {
      organizationId: org.id,
      type: "JOB_COMPLETED",
      subject: `Outage test — job #${job.number}`,
      payload,
      jobId: job.id,
      recipients: [{ kind: "CUSTOMER", email: "outage@example.com" }],
    });
  });

  // A syntactically valid but wrong key: the provider call will reject.
  process.env.RESEND_API_KEY = "re_invalid_key_for_testing";
  const outage = await dispatchNotifications();

  const failedRow = await prisma.notification.findFirst({
    where: { organizationId: org.id, toEmail: "outage@example.com" },
  });
  const jobAfter = await prisma.job.findUniqueOrThrow({
    where: { id: job.id },
    select: { status: true, completedAt: true, title: true },
  });

  check(
    "the send fails rather than throwing out of the dispatcher",
    outage.sent === 0 && outage.retrying === 1,
    JSON.stringify(outage),
  );
  check("the email goes back to PENDING for retry", failedRow?.status === "PENDING");
  check("…with the attempt counted and the error recorded", failedRow?.attempts === 1 && Boolean(failedRow?.lastError), failedRow?.lastError ?? "");
  check("…and backed off into the future", (failedRow?.scheduledFor?.getTime() ?? 0) > Date.now());
  check(
    "the job is completely unaffected",
    jobBefore.status === jobAfter.status &&
      jobBefore.title === jobAfter.title &&
      jobBefore.completedAt?.getTime() === jobAfter.completedAt?.getTime(),
  );
  delete process.env.RESEND_API_KEY;

  console.log("\n=== dedupeKey makes a repeated cron a no-op ===");
  const key = `verify:${job.id}:${new Date().toISOString().slice(0, 10)}`;
  let inserted = 0;
  for (let run = 0; run < 3; run++) {
    inserted += await prisma.$transaction((tx) =>
      enqueueNotifications(tx, {
        organizationId: org.id,
        type: "APPOINTMENT_REMINDER",
        subject: "Reminder",
        payload,
        jobId: job.id,
        dedupeKey: key,
        recipients: [{ kind: "CUSTOMER", email: "dedupe@example.com" }],
      }),
    );
  }
  check("three identical runs insert one row", inserted === 1, `inserted ${inserted}`);

  console.log("\n=== Preferences are honoured at enqueue time ===");
  await prisma.notificationPreference.update({
    where: { organizationId_type: { organizationId: org.id, type: "JOB_COMPLETED" } },
    data: { enabled: false },
  });
  const suppressed = await prisma.$transaction((tx) =>
    enqueueNotifications(tx, {
      organizationId: org.id,
      type: "JOB_COMPLETED",
      subject: "should be suppressed",
      payload,
      jobId: job.id,
      recipients: [{ kind: "CUSTOMER", email: "suppressed@example.com" }],
    }),
  );
  check("a disabled event never creates a row", suppressed === 0);
  await prisma.notificationPreference.update({
    where: { organizationId_type: { organizationId: org.id, type: "JOB_COMPLETED" } },
    data: { enabled: true },
  });

  const noEmail = await prisma.$transaction((tx) =>
    enqueueNotifications(tx, {
      organizationId: org.id,
      type: "JOB_COMPLETED",
      subject: "no address",
      payload,
      jobId: job.id,
      recipients: [{ kind: "CUSTOMER", email: null }],
    }),
  );
  check("a customer with no email address is skipped, not errored", noEmail === 0);

  // Leave the outbox tidy.
  await prisma.notification.deleteMany({
    where: {
      organizationId: org.id,
      toEmail: { in: ["outage@example.com", "dedupe@example.com"] },
    },
  });

  console.log(`\n${pass} passed, ${fail} failed\n`);
  await prisma.$disconnect();
  process.exit(fail ? 1 : 0);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
