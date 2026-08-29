import type { Metadata } from "next";
import Link from "next/link";

import { InsightCard } from "@/components/dashboard/insight-card";
import { JobStatusBadge, PriorityBadge } from "@/components/status-badge";
import { checkAvailability } from "@/lib/ai/client";
import { Card, EmptyState, LinkButton, PageHeader } from "@/components/ui/primitives";
import { dashboardMetrics } from "@/lib/db/dashboard";
import { getOrgSettings } from "@/lib/db/organization";
import { requireDashboardAccess } from "@/lib/db/scope";
import { formatDateTime, formatTimeRange } from "@/lib/dates";
import { formatMoney } from "@/lib/money";
import { JOB_STATUS_LABEL } from "@/lib/status";

export const metadata: Metadata = { title: "Dashboard" };

function Stat({
  label,
  value,
  hint,
  href,
  tone,
}: {
  label: string;
  value: string;
  hint?: string;
  href?: string;
  tone?: "warn";
}) {
  const body = (
    <Card
      className={
        tone === "warn"
          ? "border-amber-300 p-4 dark:border-amber-900"
          : "p-4 transition-colors hover:border-neutral-400 dark:hover:border-neutral-600"
      }
    >
      <p className="font-mono text-[0.65rem] tracking-widest text-neutral-500 uppercase">
        {label}
      </p>
      <p className="mt-1 text-2xl font-semibold tabular-nums">{value}</p>
      {hint ? <p className="text-xs text-neutral-500">{hint}</p> : null}
    </Card>
  );
  return href ? <Link href={href}>{body}</Link> : body;
}

export default async function DashboardPage() {
  const { orgName } = await requireDashboardAccess();
  const [metrics, org] = await Promise.all([dashboardMetrics(), getOrgSettings()]);
  const insightAi = await checkAvailability(org.id, "BUSINESS_INSIGHT");
  const { counts, money, currency, timezone } = metrics;

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={orgName}
        description={`Today, ${metrics.todayLabel} · ${timezone}`}
        actions={<LinkButton href="/dashboard/jobs/new">New job</LinkButton>}
      />

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Stat
          label="Today's jobs"
          value={String(counts.todayTotal)}
          hint={`${counts.todayCompleted} completed`}
          href="/dashboard/schedule"
        />
        <Stat
          label="Open jobs"
          value={String(counts.open)}
          hint={counts.unscheduled ? `${counts.unscheduled} need a date` : "all scheduled"}
          href="/dashboard/jobs"
        />
        <Stat
          label="Paid this month"
          value={formatMoney(money.paidThisMonthCents, currency)}
          hint={`${counts.completedThisMonth} jobs completed`}
          href="/dashboard/invoices?status=PAID"
        />
        <Stat
          label="Outstanding"
          value={formatMoney(money.outstandingCents, currency)}
          hint={counts.overdueInvoices ? `${counts.overdueInvoices} overdue` : "nothing overdue"}
          href="/dashboard/invoices?status=SENT"
          tone={counts.overdueInvoices > 0 ? "warn" : undefined}
        />
      </div>

      {counts.uninvoiced > 0 || counts.unscheduled > 0 ? (
        <div className="flex flex-wrap gap-3 text-sm">
          {counts.uninvoiced > 0 ? (
            <Link
              href="/dashboard/invoices/new"
              className="rounded-md border border-neutral-300 px-3 py-1.5 hover:bg-neutral-100 dark:border-neutral-700 dark:hover:bg-neutral-900"
            >
              {counts.uninvoiced} completed {counts.uninvoiced === 1 ? "job" : "jobs"} ready to invoice →
            </Link>
          ) : null}
          {counts.unscheduled > 0 ? (
            <Link
              href="/dashboard/jobs?status=NEW"
              className="rounded-md border border-neutral-300 px-3 py-1.5 hover:bg-neutral-100 dark:border-neutral-700 dark:hover:bg-neutral-900"
            >
              {counts.unscheduled} {counts.unscheduled === 1 ? "job needs" : "jobs need"} a date →
            </Link>
          ) : null}
        </div>
      ) : null}

      {insightAi.available ? <InsightCard /> : null}

      <div className="grid gap-6 lg:grid-cols-[3fr_2fr]">
        <section className="flex flex-col gap-3">
          <div className="flex items-baseline justify-between gap-3">
            <h2 className="text-lg font-semibold tracking-tight">Today&apos;s schedule</h2>
            <Link
              href="/dashboard/schedule"
              className="text-sm underline underline-offset-4"
            >
              Full schedule
            </Link>
          </div>

          {metrics.todayJobs.length === 0 ? (
            <EmptyState
              title="Nothing booked today"
              description="Jobs appear here once they have a date and time."
              action={<LinkButton href="/dashboard/jobs/new">Book a job</LinkButton>}
            />
          ) : (
            <Card className="divide-y divide-neutral-200 dark:divide-neutral-800">
              {metrics.todayJobs.map((job) => (
                <Link
                  key={job.id}
                  href={`/dashboard/jobs/${job.id}`}
                  className="flex items-center gap-3 px-4 py-3 hover:bg-neutral-50 dark:hover:bg-neutral-900"
                >
                  <span
                    aria-hidden
                    className="h-8 w-1 shrink-0 rounded-full"
                    style={{
                      background: job.assignedTo?.technician?.calendarColor ?? "#cbd5e1",
                    }}
                  />
                  <span className="w-28 shrink-0 font-mono text-xs text-neutral-500">
                    {job.scheduledStart
                      ? formatTimeRange(job.scheduledStart, job.scheduledEnd, timezone)
                      : "—"}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-medium">{job.title}</span>
                    <span className="block truncate text-xs text-neutral-500">
                      {job.customer.name} ·{" "}
                      {job.assignedTo?.user?.name ?? "unassigned"}
                    </span>
                  </span>
                  <span className="flex shrink-0 items-center gap-2">
                    <PriorityBadge priority={job.priority} />
                    <JobStatusBadge status={job.status} />
                  </span>
                </Link>
              ))}
            </Card>
          )}
        </section>

        <section className="flex flex-col gap-3">
          <h2 className="text-lg font-semibold tracking-tight">Recent activity</h2>
          {metrics.recentActivity.length === 0 ? (
            <p className="text-sm text-neutral-500">
              Every status change is recorded here as it happens.
            </p>
          ) : (
            <Card className="divide-y divide-neutral-200 dark:divide-neutral-800">
              {metrics.recentActivity.map((entry) => (
                <div key={entry.id} className="px-4 py-2.5">
                  <p className="text-sm">
                    <Link
                      href={`/dashboard/jobs/${entry.job.id}`}
                      className="font-medium underline-offset-4 hover:underline"
                    >
                      #{entry.job.number}
                    </Link>{" "}
                    <span className="text-neutral-600 dark:text-neutral-400">
                      {entry.from
                        ? `→ ${JOB_STATUS_LABEL[entry.to].toLowerCase()}`
                        : "created"}
                    </span>
                  </p>
                  <p className="font-mono text-[0.65rem] tracking-wide text-neutral-500 uppercase">
                    {formatDateTime(entry.createdAt, timezone)}
                    {entry.changedBy?.user?.name ? ` · ${entry.changedBy.user.name}` : ""}
                  </p>
                </div>
              ))}
            </Card>
          )}

          <div className="grid grid-cols-2 gap-3">
            <Stat
              label="Customers"
              value={String(counts.customers)}
              href="/dashboard/customers"
            />
            <Stat
              label="Technicians"
              value={String(counts.activeTechnicians)}
              href="/dashboard/team"
            />
          </div>
        </section>
      </div>
    </div>
  );
}
