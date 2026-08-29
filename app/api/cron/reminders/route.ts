import { NextResponse } from "next/server";

import { prisma } from "@/lib/db/prisma";
import { dayKey, endOfDay, shiftDayKey, startOfDay, todayKey } from "@/lib/dates";
import { enqueueNotifications } from "@/lib/notifications/enqueue";

/**
 * Nightly. Enqueues a reminder for every appointment tomorrow, and flips
 * overdue invoices. Both are idempotent: reminders carry a dedupeKey the
 * unique index enforces, and the invoice update is a no-op the second time.
 */

export const dynamic = "force-dynamic";

function authorized(request: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  return request.headers.get("authorization") === `Bearer ${secret}`;
}

async function run() {
  const organizations = await prisma.organization.findMany({
    select: { id: true, name: true, email: true, timezone: true },
  });

  let reminders = 0;
  let overdue = 0;

  for (const org of organizations) {
    // "Tomorrow" is tomorrow where the business is, not where the server is.
    const tomorrow = shiftDayKey(todayKey(org.timezone), 1, org.timezone);
    const from = startOfDay(tomorrow, org.timezone);
    const to = endOfDay(tomorrow, org.timezone);

    const jobs = await prisma.job.findMany({
      where: {
        organizationId: org.id,
        status: { in: ["SCHEDULED", "ASSIGNED"] },
        scheduledStart: { gte: from, lt: to },
      },
      select: {
        id: true,
        number: true,
        title: true,
        scheduledStart: true,
        scheduledEnd: true,
        addressLine: true,
        city: true,
        customer: { select: { name: true, email: true } },
        serviceType: { select: { name: true } },
        assignedTo: { select: { user: { select: { name: true, email: true } } } },
      },
    });

    for (const job of jobs) {
      const count = await prisma.$transaction((tx) =>
        enqueueNotifications(tx, {
          organizationId: org.id,
          type: "APPOINTMENT_REMINDER",
          subject: `Reminder: your appointment tomorrow — job #${job.number}`,
          payload: {
            jobNumber: job.number,
            jobTitle: job.title,
            scheduledStart: job.scheduledStart?.toISOString() ?? null,
            scheduledEnd: job.scheduledEnd?.toISOString() ?? null,
            address: [job.addressLine, job.city].filter(Boolean).join(", ") || null,
            customerName: job.customer.name,
            serviceName: job.serviceType?.name ?? null,
            technicianName: job.assignedTo?.user?.name ?? null,
            orgName: org.name,
            timezone: org.timezone,
          },
          jobId: job.id,
          // Re-running tonight's cron sends nothing twice.
          dedupeKey: `reminder:${job.id}:${dayKey(from, org.timezone)}`,
          recipients: [
            { kind: "CUSTOMER", email: job.customer.email, name: job.customer.name },
            {
              kind: "TECHNICIAN",
              email: job.assignedTo?.user?.email,
              name: job.assignedTo?.user?.name,
            },
          ],
        }),
      );
      reminders += count;
    }

    // Invoices past their due date become OVERDUE, once.
    const stale = await prisma.invoice.findMany({
      where: {
        organizationId: org.id,
        status: "SENT",
        dueAt: { lt: new Date() },
      },
      select: {
        id: true,
        number: true,
        totalCents: true,
        currency: true,
        dueAt: true,
        customer: { select: { name: true, email: true } },
      },
    });

    for (const invoice of stale) {
      await prisma.$transaction(async (tx) => {
        await tx.invoice.update({
          where: { id: invoice.id },
          data: { status: "OVERDUE" },
        });
        await enqueueNotifications(tx, {
          organizationId: org.id,
          type: "INVOICE_OVERDUE",
          subject: `Invoice ${invoice.number} is overdue`,
          payload: {
            invoiceNumber: invoice.number,
            totalFormatted: new Intl.NumberFormat("en", {
              style: "currency",
              currency: invoice.currency,
            }).format(invoice.totalCents / 100),
            dueDate: invoice.dueAt
              ? new Intl.DateTimeFormat("en", {
                  timeZone: org.timezone,
                  day: "numeric",
                  month: "short",
                  year: "numeric",
                }).format(invoice.dueAt)
              : null,
            customerName: invoice.customer.name,
            orgName: org.name,
            timezone: org.timezone,
          },
          invoiceId: invoice.id,
          dedupeKey: `overdue:${invoice.id}`,
          recipients: [
            { kind: "CUSTOMER", email: invoice.customer.email, name: invoice.customer.name },
            { kind: "ORG", email: org.email, name: org.name },
          ],
        });
      });
      overdue++;
    }
  }

  return { organizations: organizations.length, reminders, overdue };
}

export async function POST(request: Request) {
  if (!authorized(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  return NextResponse.json(await run());
}

export async function GET(request: Request) {
  if (!authorized(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  return NextResponse.json(await run());
}
