import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { addJobNoteAction, changeJobStatusAction } from "@/app/dashboard/jobs/actions";
import { JobNotes } from "@/components/jobs/job-notes";
import { StatusActions } from "@/components/jobs/status-actions";
import { JobStatusBadge, PriorityBadge } from "@/components/status-badge";
import { Card } from "@/components/ui/primitives";
import { getMyJobDetail } from "@/lib/db/jobs";
import { getOrgSettings } from "@/lib/db/organization";
import { requireScope } from "@/lib/db/scope";
import { formatDate, formatDateTime, formatTimeRange } from "@/lib/dates";
import { NotFoundError } from "@/lib/errors";
import { allowedTransitions, assertTransition } from "@/lib/jobs/transitions";

export const metadata: Metadata = { title: "Job" };

export default async function MyJobPage(props: PageProps<"/my/jobs/[id]">) {
  const { id } = await props.params;
  const scope = await requireScope();

  let job: Awaited<ReturnType<typeof getMyJobDetail>>;
  try {
    // Scoped to this technician's assignment — guessing an id gets a 404.
    job = await getMyJobDetail(id);
  } catch (error) {
    if (error instanceof NotFoundError) notFound();
    throw error;
  }

  const org = await getOrgSettings();

  const context = {
    role: scope.role,
    isAssignee: true,
    hasSchedule: Boolean(job.scheduledStart),
    hasAssignee: true,
  };
  const options = allowedTransitions(job.status).filter((next) => {
    try {
      assertTransition(job.status, next, context);
      return true;
    } catch {
      return false;
    }
  });

  const address = [job.addressLine, job.city].filter(Boolean).join(", ");
  const mapsUrl = address
    ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address)}`
    : null;

  return (
    <div className="flex flex-col gap-5">
      <div>
        <Link
          href="/my/jobs"
          className="font-mono text-xs text-neutral-500 underline underline-offset-4"
        >
          ← My jobs
        </Link>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight">{job.title}</h1>
        <p className="text-sm text-neutral-600 dark:text-neutral-400">
          Job #{job.number}
          {job.serviceType ? ` · ${job.serviceType.name}` : ""}
        </p>
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <JobStatusBadge status={job.status} />
          <PriorityBadge priority={job.priority} />
        </div>
      </div>

      <Card className="p-4">
        <dl className="flex flex-col gap-3">
          <div>
            <dt className="font-mono text-[0.65rem] tracking-widest text-neutral-500 uppercase">
              When
            </dt>
            <dd className="text-sm">
              {job.scheduledStart ? (
                <>
                  {formatDate(job.scheduledStart, org.timezone)} ·{" "}
                  {formatTimeRange(job.scheduledStart, job.scheduledEnd, org.timezone)}
                </>
              ) : (
                "Not scheduled"
              )}
            </dd>
          </div>
          <div>
            <dt className="font-mono text-[0.65rem] tracking-widest text-neutral-500 uppercase">
              Customer
            </dt>
            <dd className="text-sm">
              {job.customer.name}
              {job.customer.phone ? (
                <a
                  href={`tel:${job.customer.phone}`}
                  className="ml-2 underline underline-offset-4"
                >
                  {job.customer.phone}
                </a>
              ) : null}
            </dd>
          </div>
          {address ? (
            <div>
              <dt className="font-mono text-[0.65rem] tracking-widest text-neutral-500 uppercase">
                Where
              </dt>
              <dd className="text-sm">
                {address}
                {mapsUrl ? (
                  <a
                    href={mapsUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="ml-2 underline underline-offset-4"
                  >
                    Directions
                  </a>
                ) : null}
              </dd>
            </div>
          ) : null}
          {job.description ? (
            <div>
              <dt className="font-mono text-[0.65rem] tracking-widest text-neutral-500 uppercase">
                Details
              </dt>
              <dd className="text-sm whitespace-pre-wrap">{job.description}</dd>
            </div>
          ) : null}
          {job.customer.notes ? (
            <div>
              <dt className="font-mono text-[0.65rem] tracking-widest text-neutral-500 uppercase">
                Site notes
              </dt>
              <dd className="text-sm whitespace-pre-wrap">{job.customer.notes}</dd>
            </div>
          ) : null}
        </dl>
      </Card>

      <Card className="p-4">
        {options.length > 0 ? (
          <StatusActions action={changeJobStatusAction} jobId={job.id} options={options} />
        ) : (
          <p className="text-sm text-neutral-500">
            {job.status === "COMPLETED"
              ? "Marked complete. Nothing else to do here."
              : job.status === "CANCELLED"
                ? "This job was cancelled."
                : "Waiting on the office to schedule this."}
          </p>
        )}
      </Card>

      <Card className="p-4">
        <h2 className="mb-3 text-sm font-semibold">Notes</h2>
        <JobNotes
          action={addJobNoteAction}
          jobId={job.id}
          notes={job.notes.map((note) => ({
            id: note.id,
            body: note.body,
            createdAt: formatDateTime(note.createdAt, org.timezone),
            authorName: note.author?.user?.name ?? "Someone",
          }))}
        />
      </Card>
    </div>
  );
}
