import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { JobNotes } from "@/components/jobs/job-notes";
import { StatusActions } from "@/components/jobs/status-actions";
import { RecommendPanel } from "@/components/jobs/recommend-panel";
import { SummaryPanel } from "@/components/jobs/summary-panel";
import { checkAvailability } from "@/lib/ai/client";
import { InvoiceStatusBadge, JobStatusBadge, PriorityBadge } from "@/components/status-badge";
import { Button, Card, LinkButton, PageHeader } from "@/components/ui/primitives";
import { getJobDetail } from "@/lib/db/jobs";
import { getOrgSettings } from "@/lib/db/organization";
import { requireDashboardAccess } from "@/lib/db/scope";
import { formatDate, formatDateTime, formatTimeRange } from "@/lib/dates";
import { NotFoundError } from "@/lib/errors";
import { allowedTransitions, assertTransition } from "@/lib/jobs/transitions";
import { formatMoney } from "@/lib/money";
import { JOB_STATUS_LABEL } from "@/lib/status";

import { addJobNoteAction, changeJobStatusAction } from "../actions";
import { clearSummaryAction } from "../summary-actions";

export const metadata: Metadata = { title: "Job" };

export default async function JobPage(props: PageProps<"/dashboard/jobs/[id]">) {
  const { id } = await props.params;
  const scope = await requireDashboardAccess();

  let job: Awaited<ReturnType<typeof getJobDetail>>;
  try {
    job = await getJobDetail(id);
  } catch (error) {
    if (error instanceof NotFoundError) notFound();
    throw error;
  }

  const org = await getOrgSettings();
  const [summaryAi, recommendAi] = await Promise.all([
    checkAvailability(org.id, "JOB_SUMMARY"),
    checkAvailability(org.id, "TECHNICIAN_RECOMMENDATION"),
  ]);
  const canRecommend =
    recommendAi.available && job.status !== "COMPLETED" && job.status !== "CANCELLED";

  // Ask the state machine what's legal rather than duplicating its rules here,
  // so the buttons can never drift from what the server will accept.
  const context = {
    role: scope.role,
    isAssignee: job.assignedMembershipId === scope.membershipId,
    hasSchedule: Boolean(job.scheduledStart),
    hasAssignee: Boolean(job.assignedMembershipId),
  };
  const options = allowedTransitions(job.status).filter((next) => {
    try {
      assertTransition(job.status, next, context);
      return true;
    } catch {
      return false;
    }
  });

  const facts: Array<[string, React.ReactNode]> = [
    [
      "Customer",
      <Link
        key="c"
        href={`/dashboard/customers/${job.customer.id}`}
        className="underline-offset-4 hover:underline"
      >
        {job.customer.name}
      </Link>,
    ],
    ["Phone", job.customer.phone ?? "—"],
    ["Service", job.serviceType?.name ?? "—"],
    [
      "Address",
      [job.addressLine, job.city].filter(Boolean).join(", ") || "—",
    ],
    [
      "Scheduled",
      job.scheduledStart ? (
        <>
          {formatDate(job.scheduledStart, org.timezone)}
          <span className="block text-xs text-neutral-500">
            {formatTimeRange(job.scheduledStart, job.scheduledEnd, org.timezone)}
          </span>
        </>
      ) : (
        "Not scheduled"
      ),
    ],
    ["Technician", job.assignedTo?.user?.name ?? "Unassigned"],
  ];

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={job.title}
        description={`Job #${job.number} · raised ${formatDate(job.createdAt, org.timezone)}${job.createdBy?.user?.name ? ` by ${job.createdBy.user.name}` : ""}`}
        actions={
          <>
            <LinkButton variant="secondary" href={`/dashboard/jobs/${job.id}/edit`}>
              Edit
            </LinkButton>
            {job.status === "COMPLETED" && !job.invoice ? (
              <LinkButton href={`/dashboard/invoices/new?jobId=${job.id}`}>
                Generate invoice
              </LinkButton>
            ) : null}
          </>
        }
      />

      <div className="flex flex-wrap items-center gap-2">
        <JobStatusBadge status={job.status} />
        <PriorityBadge priority={job.priority} />
        {job.invoice ? (
          <Link href={`/dashboard/invoices/${job.invoice.id}`} className="inline-flex">
            <InvoiceStatusBadge status={job.invoice.status} />
          </Link>
        ) : null}
      </div>

      <Card className="p-5">
        <StatusActions
          action={changeJobStatusAction}
          jobId={job.id}
          options={options}
        />
        {options.length === 0 ? (
          <p className="text-sm text-neutral-500">
            {job.status === "COMPLETED"
              ? "This job is complete. Raise a new job if more work is needed."
              : "This job is cancelled."}
          </p>
        ) : null}
      </Card>

      {canRecommend ? (
        <Card className="p-5">
          <h2 className="mb-3 text-sm font-semibold">
            {job.assignedTo ? "Reassign" : "Who should take this?"}
          </h2>
          <RecommendPanel
            jobId={job.id}
            currentAssignee={job.assignedTo?.user?.name ?? null}
          />
        </Card>
      ) : null}

      <div className="grid gap-6 lg:grid-cols-[2fr_1fr]">
        <div className="flex flex-col gap-6">
          <Card className="p-5">
            <h2 className="mb-3 text-sm font-semibold">Details</h2>
            <dl className="grid gap-3 sm:grid-cols-2">
              {facts.map(([label, value]) => (
                <div key={label}>
                  <dt className="font-mono text-[0.65rem] tracking-widest text-neutral-500 uppercase">
                    {label}
                  </dt>
                  <dd className="mt-0.5 text-sm">{value}</dd>
                </div>
              ))}
            </dl>
            {job.description ? (
              <>
                <dt className="mt-4 font-mono text-[0.65rem] tracking-widest text-neutral-500 uppercase">
                  Description
                </dt>
                <dd className="mt-1 text-sm whitespace-pre-wrap">{job.description}</dd>
              </>
            ) : null}
            {job.cancelReason ? (
              <p className="mt-4 text-sm text-red-700 dark:text-red-400">
                Cancelled: {job.cancelReason}
              </p>
            ) : null}
          </Card>

          {job.status === "COMPLETED" ? (
            <Card className="p-5">
              <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                <h2 className="text-sm font-semibold">What the customer is told</h2>
                {job.customerSummary ? (
                  <form action={clearSummaryAction}>
                    <input type="hidden" name="jobId" value={job.id} />
                    <Button variant="ghost" size="sm" type="submit">
                      Clear
                    </Button>
                  </form>
                ) : null}
              </div>

              {job.customerSummary ? (
                <p className="mb-4 rounded-md border border-neutral-200 bg-neutral-50 p-3 text-sm whitespace-pre-wrap dark:border-neutral-800 dark:bg-neutral-900">
                  {job.customerSummary}
                </p>
              ) : (
                <p className="mb-4 text-sm text-neutral-500">
                  Nothing written yet. This appears on the invoice as the record of
                  work performed.
                </p>
              )}

              {summaryAi.available ? (
                <SummaryPanel
                  jobId={job.id}
                  hasNotes={job.notes.length > 0}
                  existingSummary={job.customerSummary}
                />
              ) : null}
            </Card>
          ) : null}

          <Card className="p-5">
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

        <Card className="h-fit p-5">
          <h2 className="mb-3 text-sm font-semibold">Timeline</h2>
          <ol className="flex flex-col gap-3">
            {job.statusHistory.map((entry) => (
              <li key={entry.id} className="border-l-2 border-neutral-200 pl-3 dark:border-neutral-800">
                <p className="text-sm">
                  {entry.from
                    ? `${JOB_STATUS_LABEL[entry.from]} → ${JOB_STATUS_LABEL[entry.to]}`
                    : `Created as ${JOB_STATUS_LABEL[entry.to]}`}
                </p>
                {entry.note ? (
                  <p className="text-xs text-neutral-600 dark:text-neutral-400">
                    {entry.note}
                  </p>
                ) : null}
                <p className="font-mono text-[0.65rem] tracking-wide text-neutral-500 uppercase">
                  {formatDateTime(entry.createdAt, org.timezone)}
                  {entry.changedBy?.user?.name ? ` · ${entry.changedBy.user.name}` : ""}
                </p>
              </li>
            ))}
          </ol>

          {job.invoice ? (
            <div className="mt-5 border-t border-neutral-200 pt-4 dark:border-neutral-800">
              <h3 className="font-mono text-[0.65rem] tracking-widest text-neutral-500 uppercase">
                Invoice
              </h3>
              <Link
                href={`/dashboard/invoices/${job.invoice.id}`}
                className="mt-1 block text-sm underline-offset-4 hover:underline"
              >
                {job.invoice.number} ·{" "}
                {formatMoney(job.invoice.totalCents, job.invoice.currency)}
              </Link>
            </div>
          ) : null}
        </Card>
      </div>
    </div>
  );
}
