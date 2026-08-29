import type { Metadata } from "next";
import Link from "next/link";

import { JobStatusBadge } from "@/components/status-badge";
import { Card, EmptyState, LinkButton, PageHeader } from "@/components/ui/primitives";
import { jobsInRange } from "@/lib/db/jobs";
import { getOrgSettings } from "@/lib/db/organization";
import { assignableMembers } from "@/lib/db/team";
import {
  dayKey,
  endOfDay,
  formatDate,
  formatTime,
  formatWeekday,
  shiftDayKey,
  startOfDay,
  todayKey,
  weekKeys,
} from "@/lib/dates";

export const metadata: Metadata = { title: "Schedule" };

const START_HOUR = 6;
const END_HOUR = 22;
const HOUR_PX = 56;

type View = "day" | "week";

export default async function SchedulePage(props: PageProps<"/dashboard/schedule">) {
  const search = await props.searchParams;
  const org = await getOrgSettings();

  const view: View = search.view === "week" ? "week" : "day";
  const anchor =
    typeof search.date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(search.date)
      ? search.date
      : todayKey(org.timezone);
  const technicianId = typeof search.tech === "string" ? search.tech : undefined;

  const days = view === "week" ? weekKeys(anchor, org.timezone) : [anchor];
  const from = startOfDay(days[0], org.timezone);
  const to = endOfDay(days[days.length - 1], org.timezone);

  const [jobs, members] = await Promise.all([
    jobsInRange(from, to, technicianId),
    assignableMembers(),
  ]);

  const href = (next: Partial<{ view: View; date: string; tech: string }>) => {
    const params = new URLSearchParams({
      view: next.view ?? view,
      date: next.date ?? anchor,
      ...(next.tech ?? technicianId ? { tech: next.tech ?? technicianId ?? "" } : {}),
    });
    return `/dashboard/schedule?${params}`;
  };

  const step = view === "week" ? 7 : 1;

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Schedule"
        description={
          view === "week"
            ? `${formatDate(startOfDay(days[0], org.timezone), org.timezone)} – ${formatDate(startOfDay(days[6], org.timezone), org.timezone)}`
            : `${formatWeekday(startOfDay(anchor, org.timezone), org.timezone)}, ${formatDate(startOfDay(anchor, org.timezone), org.timezone)}`
        }
        actions={
          <LinkButton href={`/dashboard/jobs/new?date=${anchor}`}>New job</LinkButton>
        }
      />

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-1">
          <Link
            href={href({ date: shiftDayKey(anchor, -step, org.timezone) })}
            className="rounded-md border border-neutral-300 px-2.5 py-1.5 text-sm hover:bg-neutral-100 dark:border-neutral-700 dark:hover:bg-neutral-900"
          >
            ←
          </Link>
          <Link
            href={href({ date: todayKey(org.timezone) })}
            className="rounded-md border border-neutral-300 px-3 py-1.5 text-sm hover:bg-neutral-100 dark:border-neutral-700 dark:hover:bg-neutral-900"
          >
            Today
          </Link>
          <Link
            href={href({ date: shiftDayKey(anchor, step, org.timezone) })}
            className="rounded-md border border-neutral-300 px-2.5 py-1.5 text-sm hover:bg-neutral-100 dark:border-neutral-700 dark:hover:bg-neutral-900"
          >
            →
          </Link>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-1">
            {(["day", "week"] as View[]).map((option) => (
              <Link
                key={option}
                href={href({ view: option })}
                className={
                  option === view
                    ? "rounded-md bg-neutral-900 px-3 py-1.5 text-sm text-white dark:bg-neutral-100 dark:text-neutral-900"
                    : "rounded-md border border-neutral-300 px-3 py-1.5 text-sm hover:bg-neutral-100 dark:border-neutral-700 dark:hover:bg-neutral-900"
                }
              >
                {option === "day" ? "Day" : "Week"}
              </Link>
            ))}
          </div>

          <div className="flex flex-wrap items-center gap-1">
            <Link
              href={`/dashboard/schedule?${new URLSearchParams({ view, date: anchor })}`}
              className={
                technicianId
                  ? "rounded-md border border-neutral-300 px-2.5 py-1 text-xs hover:bg-neutral-100 dark:border-neutral-700 dark:hover:bg-neutral-900"
                  : "rounded-md bg-neutral-900 px-2.5 py-1 text-xs text-white dark:bg-neutral-100 dark:text-neutral-900"
              }
            >
              Everyone
            </Link>
            {members.map((member) => (
              <Link
                key={member.id}
                href={href({ tech: member.id })}
                className={
                  technicianId === member.id
                    ? "rounded-md bg-neutral-900 px-2.5 py-1 text-xs text-white dark:bg-neutral-100 dark:text-neutral-900"
                    : "flex items-center gap-1.5 rounded-md border border-neutral-300 px-2.5 py-1 text-xs hover:bg-neutral-100 dark:border-neutral-700 dark:hover:bg-neutral-900"
                }
              >
                <span
                  aria-hidden
                  className="inline-block size-2 rounded-full"
                  style={{ background: member.technician?.calendarColor ?? "#64748b" }}
                />
                {member.user?.name?.split(" ")[0] ?? "Unknown"}
              </Link>
            ))}
          </div>
        </div>
      </div>

      {jobs.length === 0 ? (
        <EmptyState
          title="Nothing booked"
          description={
            view === "week"
              ? "No appointments this week. Jobs without a date never appear here."
              : "No appointments on this day."
          }
          action={<LinkButton href={`/dashboard/jobs/new?date=${anchor}`}>Book a job</LinkButton>}
        />
      ) : view === "day" ? (
        <DayGrid jobs={jobs} dayKeyValue={anchor} timezone={org.timezone} />
      ) : (
        <WeekColumns days={days} jobs={jobs} timezone={org.timezone} today={todayKey(org.timezone)} />
      )}

      <p className="text-xs text-neutral-500">
        Times are {org.timezone}. Jobs with no date don&apos;t appear here — find them
        under <Link href="/dashboard/jobs?status=NEW" className="underline underline-offset-4">
          New jobs
        </Link>.
      </p>
    </div>
  );
}

type ScheduleJob = Awaited<ReturnType<typeof jobsInRange>>[number];

/** A real time grid: position by minutes into the local day, so DST is free. */
function DayGrid({
  jobs,
  dayKeyValue,
  timezone,
}: {
  jobs: ScheduleJob[];
  dayKeyValue: string;
  timezone: string;
}) {
  const dayStart = startOfDay(dayKeyValue, timezone).getTime();
  const hours = Array.from({ length: END_HOUR - START_HOUR }, (_, i) => START_HOUR + i);

  return (
    <Card className="overflow-x-auto p-0">
      <div className="flex min-w-[520px]">
        <div className="w-14 shrink-0 border-r border-neutral-200 dark:border-neutral-800">
          <div className="h-8" />
          {hours.map((hour) => (
            <div
              key={hour}
              style={{ height: HOUR_PX }}
              className="pr-2 text-right font-mono text-[0.65rem] text-neutral-500"
            >
              {String(hour).padStart(2, "0")}:00
            </div>
          ))}
        </div>

        <div className="relative flex-1">
          <div className="h-8 border-b border-neutral-200 dark:border-neutral-800" />
          {hours.map((hour) => (
            <div
              key={hour}
              style={{ height: HOUR_PX }}
              className="border-b border-neutral-100 dark:border-neutral-900"
            />
          ))}

          {jobs.map((job) => {
            if (!job.scheduledStart) return null;
            const minutes = (job.scheduledStart.getTime() - dayStart) / 60_000;
            const durationMinutes = job.scheduledEnd
              ? (job.scheduledEnd.getTime() - job.scheduledStart.getTime()) / 60_000
              : 60;
            const top = 32 + ((minutes - START_HOUR * 60) / 60) * HOUR_PX;
            const height = Math.max(26, (durationMinutes / 60) * HOUR_PX - 2);
            // A 5am job would otherwise render above the grid.
            if (top < 0) return null;

            return (
              <Link
                key={job.id}
                href={`/dashboard/jobs/${job.id}`}
                style={{
                  top,
                  height,
                  borderLeftColor: job.assignedTo?.technician?.calendarColor ?? "#64748b",
                }}
                className="absolute right-2 left-2 overflow-hidden rounded-md border border-neutral-200 border-l-4 bg-white px-2 py-1 text-xs hover:border-neutral-400 dark:border-neutral-700 dark:bg-neutral-900"
              >
                <span className="font-mono text-[0.65rem] text-neutral-500">
                  {formatTime(job.scheduledStart, timezone)}
                </span>{" "}
                <span className="font-medium">{job.title}</span>
                <span className="ml-1 text-neutral-500">
                  · {job.customer.name}
                  {job.assignedTo?.user?.name ? ` · ${job.assignedTo.user.name}` : " · unassigned"}
                </span>
              </Link>
            );
          })}
        </div>
      </div>
    </Card>
  );
}

function WeekColumns({
  days,
  jobs,
  timezone,
  today,
}: {
  days: string[];
  jobs: ScheduleJob[];
  timezone: string;
  today: string;
}) {
  const byDay = new Map<string, ScheduleJob[]>();
  for (const job of jobs) {
    if (!job.scheduledStart) continue;
    const key = dayKey(job.scheduledStart, timezone);
    const bucket = byDay.get(key);
    if (bucket) bucket.push(job);
    else byDay.set(key, [job]);
  }

  return (
    <div className="overflow-x-auto">
      <div className="grid min-w-[900px] grid-cols-7 gap-2">
        {days.map((key) => {
          const dayJobs = byDay.get(key) ?? [];
          const isToday = key === today;
          return (
            <div key={key} className="flex flex-col gap-2">
              <div
                className={
                  isToday
                    ? "rounded-md bg-neutral-900 px-2 py-1.5 text-white dark:bg-neutral-100 dark:text-neutral-900"
                    : "px-2 py-1.5"
                }
              >
                <p className="font-mono text-[0.65rem] tracking-wider uppercase">
                  {formatWeekday(startOfDay(key, timezone), timezone).slice(0, 3)}
                </p>
                <p className="text-sm font-medium">{key.slice(8)}</p>
              </div>

              {dayJobs.length === 0 ? (
                <p className="px-2 text-xs text-neutral-400">—</p>
              ) : (
                dayJobs.map((job) => (
                  <Link key={job.id} href={`/dashboard/jobs/${job.id}`}>
                    <Card
                      className="border-l-4 p-2 transition-colors hover:border-neutral-400"
                      style={{
                        borderLeftColor:
                          job.assignedTo?.technician?.calendarColor ?? "#64748b",
                      }}
                    >
                      <p className="font-mono text-[0.65rem] text-neutral-500">
                        {job.scheduledStart ? formatTime(job.scheduledStart, timezone) : ""}
                      </p>
                      <p className="truncate text-xs font-medium" title={job.title}>
                        {job.title}
                      </p>
                      <p className="truncate text-xs text-neutral-500">
                        {job.customer.name}
                      </p>
                      <div className="mt-1">
                        <JobStatusBadge status={job.status} />
                      </div>
                    </Card>
                  </Link>
                ))
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
