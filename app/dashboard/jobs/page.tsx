import type { Metadata } from "next";
import Link from "next/link";

import { JobStatusBadge, PriorityBadge } from "@/components/status-badge";
import {
  Card,
  EmptyState,
  Input,
  LinkButton,
  PageHeader,
  Select,
  Table,
  Td,
  Th,
} from "@/components/ui/primitives";
import { listJobs } from "@/lib/db/jobs";
import { getOrgSettings } from "@/lib/db/organization";
import { assignableMembers } from "@/lib/db/team";
import { formatDate, formatTime } from "@/lib/dates";
import { JOB_STATUS_LABEL, JOB_STATUS_ORDER } from "@/lib/status";
import type { JobStatus } from "@prisma/client";

export const metadata: Metadata = { title: "Jobs" };

export default async function JobsPage(props: PageProps<"/dashboard/jobs">) {
  const search = await props.searchParams;
  const status = JOB_STATUS_ORDER.includes(search.status as JobStatus)
    ? (search.status as JobStatus)
    : undefined;
  const technicianId = typeof search.tech === "string" ? search.tech : undefined;
  const query = typeof search.q === "string" ? search.q : "";
  const page = Math.max(1, Number(search.page) || 1);

  const [{ jobs, total, pageCount }, org, members] = await Promise.all([
    listJobs({ status, technicianId, query, page }),
    getOrgSettings(),
    assignableMembers(),
  ]);

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Jobs"
        description={`${total} ${total === 1 ? "job" : "jobs"}`}
        actions={<LinkButton href="/dashboard/jobs/new">New job</LinkButton>}
      />

      <form className="flex flex-wrap items-end gap-3">
        <div className="flex flex-col gap-1">
          <label htmlFor="q" className="text-xs text-neutral-500">
            Search
          </label>
          <Input
            id="q"
            name="q"
            defaultValue={query}
            placeholder="Job number, title or customer"
            className="w-56"
          />
        </div>
        <div className="flex flex-col gap-1">
          <label htmlFor="status" className="text-xs text-neutral-500">
            Status
          </label>
          <Select id="status" name="status" defaultValue={status ?? ""} className="w-40">
            <option value="">Any status</option>
            {JOB_STATUS_ORDER.map((value) => (
              <option key={value} value={value}>
                {JOB_STATUS_LABEL[value]}
              </option>
            ))}
          </Select>
        </div>
        <div className="flex flex-col gap-1">
          <label htmlFor="tech" className="text-xs text-neutral-500">
            Technician
          </label>
          <Select id="tech" name="tech" defaultValue={technicianId ?? ""} className="w-48">
            <option value="">Anyone</option>
            {members.map((member) => (
              <option key={member.id} value={member.id}>
                {member.user?.name ?? member.user?.email ?? "Unknown"}
              </option>
            ))}
          </Select>
        </div>
        <button
          type="submit"
          className="h-9 rounded-md border border-neutral-300 px-3 text-sm hover:bg-neutral-100 dark:border-neutral-700 dark:hover:bg-neutral-900"
        >
          Filter
        </button>
        {status || technicianId || query ? (
          <Link href="/dashboard/jobs" className="pb-2 text-sm underline underline-offset-4">
            Clear
          </Link>
        ) : null}
      </form>

      {jobs.length === 0 ? (
        <EmptyState
          title={total === 0 && !status && !query ? "No jobs yet" : "Nothing matches"}
          description={
            total === 0 && !status && !query
              ? "Raise the first job and it will appear here and on the schedule."
              : "Try a wider filter."
          }
          action={<LinkButton href="/dashboard/jobs/new">New job</LinkButton>}
        />
      ) : (
        <Card>
          <Table>
            <thead>
              <tr>
                <Th className="w-16">Job</Th>
                <Th>What</Th>
                <Th>Customer</Th>
                <Th>Scheduled</Th>
                <Th>Technician</Th>
                <Th>Status</Th>
              </tr>
            </thead>
            <tbody>
              {jobs.map((job) => (
                <tr key={job.id} className="hover:bg-neutral-50 dark:hover:bg-neutral-900">
                  <Td className="font-mono text-xs">
                    <Link
                      href={`/dashboard/jobs/${job.id}`}
                      className="underline-offset-4 hover:underline"
                    >
                      #{job.number}
                    </Link>
                  </Td>
                  <Td>
                    <Link
                      href={`/dashboard/jobs/${job.id}`}
                      className="font-medium underline-offset-4 hover:underline"
                    >
                      {job.title}
                    </Link>
                    <span className="ml-2 inline-block align-middle">
                      <PriorityBadge priority={job.priority} />
                    </span>
                    {job.serviceType ? (
                      <span className="block text-xs text-neutral-500">
                        {job.serviceType.name}
                      </span>
                    ) : null}
                  </Td>
                  <Td>
                    <Link
                      href={`/dashboard/customers/${job.customer.id}`}
                      className="underline-offset-4 hover:underline"
                    >
                      {job.customer.name}
                    </Link>
                  </Td>
                  <Td className="text-neutral-600 dark:text-neutral-400">
                    {job.scheduledStart ? (
                      <>
                        {formatDate(job.scheduledStart, org.timezone)}
                        <span className="block text-xs">
                          {formatTime(job.scheduledStart, org.timezone)}
                        </span>
                      </>
                    ) : (
                      <span className="text-xs">Not scheduled</span>
                    )}
                  </Td>
                  <Td className="text-neutral-600 dark:text-neutral-400">
                    {job.assignedTo?.user?.name ?? (
                      <span className="text-xs">Unassigned</span>
                    )}
                  </Td>
                  <Td>
                    <JobStatusBadge status={job.status} />
                  </Td>
                </tr>
              ))}
            </tbody>
          </Table>
        </Card>
      )}

      {pageCount > 1 ? (
        <div className="flex items-center gap-4 text-sm">
          {page > 1 ? (
            <Link
              href={`/dashboard/jobs?${new URLSearchParams({ q: query, status: status ?? "", tech: technicianId ?? "", page: String(page - 1) })}`}
              className="underline underline-offset-4"
            >
              Previous
            </Link>
          ) : null}
          <span className="text-neutral-500">
            Page {page} of {pageCount}
          </span>
          {page < pageCount ? (
            <Link
              href={`/dashboard/jobs?${new URLSearchParams({ q: query, status: status ?? "", tech: technicianId ?? "", page: String(page + 1) })}`}
              className="underline underline-offset-4"
            >
              Next
            </Link>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
