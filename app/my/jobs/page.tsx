import type { Metadata } from "next";
import Link from "next/link";

import { JobStatusBadge, PriorityBadge } from "@/components/status-badge";
import { Card, EmptyState } from "@/components/ui/primitives";
import { myJobs } from "@/lib/db/jobs";
import { getOrgSettings } from "@/lib/db/organization";
import { dayKey, formatTimeRange, formatWeekday, startOfDay, todayKey } from "@/lib/dates";

export const metadata: Metadata = { title: "My jobs" };

export default async function MyJobsPage() {
  const org = await getOrgSettings();
  const today = todayKey(org.timezone);

  // Yesterday onward: a job left open overnight shouldn't vanish.
  const jobs = await myJobs(startOfDay(today, org.timezone));

  if (jobs.length === 0) {
    return (
      <div className="flex flex-col gap-5">
        <h1 className="text-2xl font-semibold tracking-tight">My jobs</h1>
        <EmptyState
          title="Nothing assigned"
          description="When a job is assigned to you it appears here, newest appointment first."
        />
      </div>
    );
  }

  // Group by the day the appointment falls on, in the business's time zone.
  const groups = new Map<string, typeof jobs>();
  for (const job of jobs) {
    const key = job.scheduledStart ? dayKey(job.scheduledStart, org.timezone) : "unscheduled";
    const bucket = groups.get(key);
    if (bucket) bucket.push(job);
    else groups.set(key, [job]);
  }

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-2xl font-semibold tracking-tight">My jobs</h1>

      {[...groups.entries()].map(([key, dayJobs]) => (
        <section key={key} className="flex flex-col gap-2">
          <h2 className="font-mono text-xs tracking-widest text-neutral-500 uppercase">
            {key === "unscheduled"
              ? "Not scheduled"
              : key === today
                ? "Today"
                : `${formatWeekday(startOfDay(key, org.timezone), org.timezone)} · ${key}`}
          </h2>

          <ul className="flex flex-col gap-2">
            {dayJobs.map((job) => (
              <li key={job.id}>
                <Link href={`/my/jobs/${job.id}`} className="block">
                  <Card className="p-4 transition-colors hover:border-neutral-400 dark:hover:border-neutral-600">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="font-mono text-xs text-neutral-500">
                          {job.scheduledStart
                            ? formatTimeRange(job.scheduledStart, job.scheduledEnd, org.timezone)
                            : `#${job.number}`}
                        </p>
                        <p className="mt-0.5 font-medium">{job.title}</p>
                        <p className="text-sm text-neutral-600 dark:text-neutral-400">
                          {job.customer.name}
                          {job.customer.addressLine ? ` · ${job.customer.addressLine}` : ""}
                        </p>
                      </div>
                      <div className="flex shrink-0 flex-col items-end gap-1">
                        <JobStatusBadge status={job.status} />
                        <PriorityBadge priority={job.priority} />
                      </div>
                    </div>
                  </Card>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}
