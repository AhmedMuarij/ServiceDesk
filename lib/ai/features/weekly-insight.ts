import { z } from "zod";

import { ask, type AiResult } from "@/lib/ai/client";
import { prisma } from "@/lib/db/prisma";
import { dayKey, endOfDay, shiftDayKey, startOfDay, todayKey } from "@/lib/dates";
import { formatMoney } from "@/lib/money";

/**
 * A short written read of last week's numbers.
 *
 * The numbers are computed here, from the database, and handed to the model as
 * facts. It is not asked to calculate anything — only to say what the figures
 * mean and what deserves attention. That split is deliberate: arithmetic is
 * something Postgres is reliably good at and a language model is not.
 */

export type WeeklyInsight = {
  headline: string;
  observations: string[];
  watchOut: string | null;
  numbers: WeekNumbers;
};

export type WeekNumbers = {
  from: string;
  to: string;
  completed: number;
  completedPrior: number;
  created: number;
  cancelled: number;
  unscheduled: number;
  overdueInvoices: number;
  paidFormatted: string;
  outstandingFormatted: string;
  byTechnician: Array<{ name: string; completed: number }>;
  slowestToInvoice: number | null;
};

const schema = z.object({
  headline: z.string().min(1).max(140),
  observations: z.array(z.string().min(1).max(240)).min(1).max(4),
  watchOut: z.string().max(240).nullable(),
});

export async function weekNumbers(organizationId: string): Promise<WeekNumbers> {
  const org = await prisma.organization.findUniqueOrThrow({
    where: { id: organizationId },
    select: { timezone: true, currency: true },
  });
  const tz = org.timezone;

  const today = todayKey(tz);
  const from = startOfDay(shiftDayKey(today, -7, tz), tz);
  const to = endOfDay(today, tz);
  const priorFrom = startOfDay(shiftDayKey(today, -14, tz), tz);

  const [completed, completedPrior, created, cancelled, unscheduled, overdue, paid, outstanding, byTech] =
    await Promise.all([
      prisma.job.count({
        where: { organizationId, status: "COMPLETED", completedAt: { gte: from, lt: to } },
      }),
      prisma.job.count({
        where: { organizationId, status: "COMPLETED", completedAt: { gte: priorFrom, lt: from } },
      }),
      prisma.job.count({ where: { organizationId, createdAt: { gte: from, lt: to } } }),
      prisma.job.count({
        where: { organizationId, status: "CANCELLED", cancelledAt: { gte: from, lt: to } },
      }),
      prisma.job.count({ where: { organizationId, status: "NEW" } }),
      prisma.invoice.count({ where: { organizationId, status: "OVERDUE" } }),
      prisma.invoice.aggregate({
        where: { organizationId, status: "PAID", paidAt: { gte: from, lt: to } },
        _sum: { totalCents: true },
      }),
      prisma.invoice.aggregate({
        where: { organizationId, status: { in: ["SENT", "OVERDUE"] } },
        _sum: { totalCents: true },
      }),
      prisma.job.groupBy({
        by: ["assignedMembershipId"],
        where: { organizationId, status: "COMPLETED", completedAt: { gte: from, lt: to } },
        _count: { _all: true },
      }),
    ]);

  const memberIds = byTech
    .map((row) => row.assignedMembershipId)
    .filter((id): id is string => Boolean(id));
  const members = memberIds.length
    ? await prisma.membership.findMany({
        where: { id: { in: memberIds } },
        select: { id: true, user: { select: { name: true } } },
      })
    : [];
  const nameById = new Map(members.map((m) => [m.id, m.user?.name ?? "Unknown"]));

  // Longest gap between finishing a job and it being invoiced — the number a
  // small business feels but rarely tracks.
  const uninvoiced = await prisma.job.findFirst({
    where: { organizationId, status: "COMPLETED", invoice: { is: null } },
    orderBy: { completedAt: "asc" },
    select: { completedAt: true },
  });
  const slowestToInvoice = uninvoiced?.completedAt
    ? Math.floor((Date.now() - uninvoiced.completedAt.getTime()) / 86_400_000)
    : null;

  return {
    from: dayKey(from, tz),
    to: today,
    completed,
    completedPrior,
    created,
    cancelled,
    unscheduled,
    overdueInvoices: overdue,
    paidFormatted: formatMoney(paid._sum.totalCents ?? 0, org.currency),
    outstandingFormatted: formatMoney(outstanding._sum.totalCents ?? 0, org.currency),
    byTechnician: byTech
      .filter((row) => row.assignedMembershipId)
      .map((row) => ({
        name: nameById.get(row.assignedMembershipId!) ?? "Unknown",
        completed: row._count._all,
      }))
      .sort((a, b) => b.completed - a.completed),
    slowestToInvoice,
  };
}

export async function weeklyInsight(input: {
  organizationId: string;
}): Promise<AiResult<WeeklyInsight>> {
  const numbers = await weekNumbers(input.organizationId);

  const org = await prisma.organization.findUnique({
    where: { id: input.organizationId },
    select: { name: true },
  });

  const cachedSystem = `You write a short weekly read for the owner of ${org?.name ?? "a small service business"}. They will read it in about fifteen seconds between jobs.

You are given the figures. They are already correct — do not recompute them, do not round them differently, and do not cite a number you were not given.

How to write:
- "headline" is one sentence: how the week went. Concrete, not cheerful. "Eleven jobs done, two more than last week" beats "A strong week!".
- "observations" are up to four short points that a spreadsheet would not tell them. Prefer things that connect two figures — work finished but not invoiced, jobs coming in faster than they are being scheduled, one technician carrying most of the load.
- "watchOut" is the single thing most worth acting on this week, or null if the week is genuinely unremarkable. Do not invent a worry to fill it.
- No advice about hiring, marketing or pricing. You do not know their business well enough for that, and they will stop reading.
- Never flatter. If the week was quiet, say the week was quiet.`;

  const user = `Week of ${numbers.from} to ${numbers.to}.

Jobs completed: ${numbers.completed} (the week before: ${numbers.completedPrior})
New jobs logged: ${numbers.created}
Cancelled: ${numbers.cancelled}
Jobs still with no date on them: ${numbers.unscheduled}
Money collected this week: ${numbers.paidFormatted}
Still owed across all unpaid invoices: ${numbers.outstandingFormatted}
Invoices past their due date: ${numbers.overdueInvoices}
${
  numbers.slowestToInvoice !== null
    ? `Oldest completed job still not invoiced: finished ${numbers.slowestToInvoice} days ago`
    : "Every completed job has been invoiced"
}

Completed per technician:
${
  numbers.byTechnician.length
    ? numbers.byTechnician.map((row) => `- ${row.name}: ${row.completed}`).join("\n")
    : "- nobody completed anything this week"
}

Write the read.`;

  const result = await ask({
    organizationId: input.organizationId,
    feature: "BUSINESS_INSIGHT",
    cachedSystem,
    user,
  schema,
  });

  if (!result.ok) return result;
  return { ...result, data: { ...result.data, numbers } };
}
