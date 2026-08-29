import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { InvoiceStatusBadge, JobStatusBadge, PriorityBadge } from "@/components/status-badge";
import {
  Badge,
  Button,
  Card,
  EmptyState,
  LinkButton,
  PageHeader,
  Table,
  Td,
  Th,
} from "@/components/ui/primitives";
import { getCustomerProfile } from "@/lib/db/customers";
import { getOrgSettings } from "@/lib/db/organization";
import { formatDate } from "@/lib/dates";
import { NotFoundError } from "@/lib/errors";
import { formatMoney } from "@/lib/money";

import { archiveCustomerAction } from "../actions";

export const metadata: Metadata = { title: "Customer" };

export default async function CustomerPage(props: PageProps<"/dashboard/customers/[id]">) {
  const { id } = await props.params;

  let customer: Awaited<ReturnType<typeof getCustomerProfile>>;
  try {
    customer = await getCustomerProfile(id);
  } catch (error) {
    if (error instanceof NotFoundError) notFound();
    throw error;
  }

  const org = await getOrgSettings();
  const archived = Boolean(customer.archivedAt);

  const outstanding = customer.invoices
    .filter((invoice) => invoice.status === "SENT" || invoice.status === "OVERDUE")
    .reduce((sum, invoice) => sum + invoice.totalCents, 0);

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={customer.name}
        description={[customer.addressLine, customer.city].filter(Boolean).join(", ") || undefined}
        actions={
          <>
            <LinkButton
              variant="secondary"
              href={`/dashboard/jobs/new?customerId=${customer.id}`}
            >
              New job
            </LinkButton>
            <LinkButton variant="secondary" href={`/dashboard/customers/${id}/edit`}>
              Edit
            </LinkButton>
            <form action={archiveCustomerAction}>
              <input type="hidden" name="id" value={customer.id} />
              <input type="hidden" name="archived" value={String(!archived)} />
              <Button variant={archived ? "secondary" : "danger"} type="submit">
                {archived ? "Restore" : "Archive"}
              </Button>
            </form>
          </>
        }
      />

      {archived ? (
        <p className="rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-800 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-400">
          This customer is archived. Their history is intact, but they won&apos;t appear
          when raising a new job.
        </p>
      ) : null}

      <div className="grid gap-4 sm:grid-cols-3">
        <Card className="p-4">
          <p className="font-mono text-[0.65rem] tracking-widest text-neutral-500 uppercase">
            Phone
          </p>
          <p className="mt-1 text-sm">{customer.phone ?? "—"}</p>
        </Card>
        <Card className="p-4">
          <p className="font-mono text-[0.65rem] tracking-widest text-neutral-500 uppercase">
            Email
          </p>
          <p className="mt-1 truncate text-sm" title={customer.email ?? undefined}>
            {customer.email ?? "—"}
          </p>
        </Card>
        <Card className="p-4">
          <p className="font-mono text-[0.65rem] tracking-widest text-neutral-500 uppercase">
            Outstanding
          </p>
          <p className="mt-1 text-sm tabular-nums">
            {outstanding > 0 ? formatMoney(outstanding, org.currency) : "—"}
          </p>
        </Card>
      </div>

      {customer.notes ? (
        <Card className="p-4">
          <p className="font-mono text-[0.65rem] tracking-widest text-neutral-500 uppercase">
            Notes
          </p>
          <p className="mt-2 text-sm whitespace-pre-wrap">{customer.notes}</p>
        </Card>
      ) : null}

      <section className="flex flex-col gap-3">
        <h2 className="text-lg font-semibold tracking-tight">
          Job history{" "}
          <span className="font-normal text-neutral-500">({customer.jobs.length})</span>
        </h2>
        {customer.jobs.length === 0 ? (
          <EmptyState
            title="No jobs yet"
            description="Every service call for this customer will show up here."
            action={
              <LinkButton href={`/dashboard/jobs/new?customerId=${customer.id}`}>
                Raise a job
              </LinkButton>
            }
          />
        ) : (
          <Card>
            <Table>
              <thead>
                <tr>
                  <Th>Job</Th>
                  <Th>Service</Th>
                  <Th>Scheduled</Th>
                  <Th>Technician</Th>
                  <Th>Status</Th>
                </tr>
              </thead>
              <tbody>
                {customer.jobs.map((job) => (
                  <tr key={job.id} className="hover:bg-neutral-50 dark:hover:bg-neutral-900">
                    <Td>
                      <Link
                        href={`/dashboard/jobs/${job.id}`}
                        className="font-medium underline-offset-4 hover:underline"
                      >
                        #{job.number}
                      </Link>
                      <span className="ml-2 text-neutral-600 dark:text-neutral-400">
                        {job.title}
                      </span>
                      <span className="ml-2 inline-block align-middle">
                        <PriorityBadge priority={job.priority} />
                      </span>
                    </Td>
                    <Td className="text-neutral-600 dark:text-neutral-400">
                      {job.serviceType?.name ?? "—"}
                    </Td>
                    <Td className="text-neutral-600 dark:text-neutral-400">
                      {job.scheduledStart
                        ? formatDate(job.scheduledStart, org.timezone)
                        : "Not scheduled"}
                    </Td>
                    <Td className="text-neutral-600 dark:text-neutral-400">
                      {job.assignedTo?.user?.name ?? "Unassigned"}
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
      </section>

      {customer.invoices.length > 0 ? (
        <section className="flex flex-col gap-3">
          <h2 className="text-lg font-semibold tracking-tight">
            Invoices{" "}
            <span className="font-normal text-neutral-500">({customer.invoices.length})</span>
          </h2>
          <Card>
            <Table>
              <thead>
                <tr>
                  <Th>Number</Th>
                  <Th>Due</Th>
                  <Th className="text-right">Total</Th>
                  <Th>Status</Th>
                </tr>
              </thead>
              <tbody>
                {customer.invoices.map((invoice) => (
                  <tr key={invoice.id} className="hover:bg-neutral-50 dark:hover:bg-neutral-900">
                    <Td>
                      <Link
                        href={`/dashboard/invoices/${invoice.id}`}
                        className="font-medium underline-offset-4 hover:underline"
                      >
                        {invoice.number}
                      </Link>
                    </Td>
                    <Td className="text-neutral-600 dark:text-neutral-400">
                      {invoice.dueAt ? formatDate(invoice.dueAt, org.timezone) : "—"}
                    </Td>
                    <Td className="text-right tabular-nums">
                      {formatMoney(invoice.totalCents, invoice.currency)}
                    </Td>
                    <Td>
                      <InvoiceStatusBadge status={invoice.status} />
                    </Td>
                  </tr>
                ))}
              </tbody>
            </Table>
          </Card>
        </section>
      ) : null}

      <p className="text-xs text-neutral-500">
        Customer since {formatDate(customer.createdAt, org.timezone)}
        {archived ? (
          <>
            {" · "}
            <Badge tone="neutral">Archived</Badge>
          </>
        ) : null}
      </p>
    </div>
  );
}
