import { dayKey, endOfDay, startOfDay, todayKey } from "@/lib/dates";
import { OPEN_JOB_STATUSES } from "@/lib/status";

import { getOrgSettings } from "./organization";
import { prisma } from "./prisma";
import { getScope } from "./scope";

/**
 * Everything the dashboard shows, in one place. Numbers only — charts are
 * explicitly out of Module 1.
 */
export async function dashboardMetrics() {
  const { orgId } = await getScope();
  const org = await getOrgSettings();
  const timezone = org.timezone;

  const today = todayKey(timezone);
  const dayFrom = startOfDay(today, timezone);
  const dayTo = endOfDay(today, timezone);

  // First of the current month, in the business's zone.
  const monthFrom = startOfDay(`${today.slice(0, 7)}-01`, timezone);

  const [
    todayJobs,
    openCount,
    completedThisMonth,
    activeTechnicians,
    customerCount,
    paidThisMonth,
    outstanding,
    overdueCount,
    recentActivity,
    unscheduledCount,
    uninvoicedCount,
  ] = await Promise.all([
    prisma.job.findMany({
      where: {
        organizationId: orgId,
        scheduledStart: { gte: dayFrom, lt: dayTo },
        status: { not: "CANCELLED" },
      },
      orderBy: { scheduledStart: "asc" },
      select: {
        id: true,
        number: true,
        title: true,
        status: true,
        priority: true,
        scheduledStart: true,
        scheduledEnd: true,
        customer: { select: { name: true } },
        assignedTo: {
          select: {
            user: { select: { name: true } },
            technician: { select: { calendarColor: true } },
          },
        },
      },
    }),
    prisma.job.count({
      where: { organizationId: orgId, status: { in: OPEN_JOB_STATUSES } },
    }),
    prisma.job.count({
      where: {
        organizationId: orgId,
        status: "COMPLETED",
        completedAt: { gte: monthFrom },
      },
    }),
    prisma.membership.count({
      where: { organizationId: orgId, status: "ACTIVE", role: "TECHNICIAN" },
    }),
    prisma.customer.count({ where: { organizationId: orgId, archivedAt: null } }),
    prisma.invoice.aggregate({
      where: { organizationId: orgId, status: "PAID", paidAt: { gte: monthFrom } },
      _sum: { totalCents: true },
    }),
    prisma.invoice.aggregate({
      where: { organizationId: orgId, status: { in: ["SENT", "OVERDUE"] } },
      _sum: { totalCents: true },
    }),
    prisma.invoice.count({ where: { organizationId: orgId, status: "OVERDUE" } }),
    prisma.jobStatusHistory.findMany({
      where: { job: { organizationId: orgId } },
      orderBy: { createdAt: "desc" },
      take: 8,
      select: {
        id: true,
        from: true,
        to: true,
        createdAt: true,
        job: { select: { id: true, number: true, title: true } },
        changedBy: { select: { user: { select: { name: true } } } },
      },
    }),
    prisma.job.count({
      where: { organizationId: orgId, status: "NEW" },
    }),
    prisma.job.count({
      where: { organizationId: orgId, status: "COMPLETED", invoice: { is: null } },
    }),
  ]);

  return {
    timezone,
    currency: org.currency,
    today,
    todayLabel: dayKey(dayFrom, timezone),
    todayJobs,
    counts: {
      todayTotal: todayJobs.length,
      todayCompleted: todayJobs.filter((job) => job.status === "COMPLETED").length,
      open: openCount,
      completedThisMonth,
      activeTechnicians,
      customers: customerCount,
      overdueInvoices: overdueCount,
      unscheduled: unscheduledCount,
      uninvoiced: uninvoicedCount,
    },
    money: {
      paidThisMonthCents: paidThisMonth._sum.totalCents ?? 0,
      outstandingCents: outstanding._sum.totalCents ?? 0,
    },
    recentActivity,
  };
}
