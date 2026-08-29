import type { Metadata } from "next";
import Link from "next/link";

import { InvoiceStatusBadge } from "@/components/status-badge";
import {
  Card,
  EmptyState,
  LinkButton,
  PageHeader,
  Table,
  Td,
  Th,
} from "@/components/ui/primitives";
import { listInvoices } from "@/lib/db/invoices";
import { getOrgSettings } from "@/lib/db/organization";
import { formatDate } from "@/lib/dates";
import { formatMoney } from "@/lib/money";
import { INVOICE_STATUS_LABEL } from "@/lib/status";
import type { InvoiceStatus } from "@prisma/client";

export const metadata: Metadata = { title: "Invoices" };

const STATUSES: InvoiceStatus[] = ["DRAFT", "SENT", "PAID", "OVERDUE", "CANCELLED"];

export default async function InvoicesPage(props: PageProps<"/dashboard/invoices">) {
  const search = await props.searchParams;
  const status = STATUSES.includes(search.status as InvoiceStatus)
    ? (search.status as InvoiceStatus)
    : undefined;
  const page = Math.max(1, Number(search.page) || 1);

  const [{ invoices, total, pageCount, outstandingCents }, org] = await Promise.all([
    listInvoices({ status, page }),
    getOrgSettings(),
  ]);

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Invoices"
        description={
          outstandingCents > 0
            ? `${formatMoney(outstandingCents, org.currency)} outstanding`
            : "Nothing outstanding"
        }
        actions={<LinkButton href="/dashboard/invoices/new">New invoice</LinkButton>}
      />

      <div className="flex flex-wrap items-center gap-1">
        <Link
          href="/dashboard/invoices"
          className={
            status
              ? "rounded-md border border-neutral-300 px-3 py-1 text-sm hover:bg-neutral-100 dark:border-neutral-700 dark:hover:bg-neutral-900"
              : "rounded-md bg-neutral-900 px-3 py-1 text-sm text-white dark:bg-neutral-100 dark:text-neutral-900"
          }
        >
          All
        </Link>
        {STATUSES.map((value) => (
          <Link
            key={value}
            href={`/dashboard/invoices?status=${value}`}
            className={
              status === value
                ? "rounded-md bg-neutral-900 px-3 py-1 text-sm text-white dark:bg-neutral-100 dark:text-neutral-900"
                : "rounded-md border border-neutral-300 px-3 py-1 text-sm hover:bg-neutral-100 dark:border-neutral-700 dark:hover:bg-neutral-900"
            }
          >
            {INVOICE_STATUS_LABEL[value]}
          </Link>
        ))}
      </div>

      {invoices.length === 0 ? (
        <EmptyState
          title={status ? `No ${INVOICE_STATUS_LABEL[status].toLowerCase()} invoices` : "No invoices yet"}
          description="Invoices are raised from completed jobs, with the line items prefilled from the service type."
          action={<LinkButton href="/dashboard/invoices/new">New invoice</LinkButton>}
        />
      ) : (
        <Card>
          <Table>
            <thead>
              <tr>
                <Th>Number</Th>
                <Th>Customer</Th>
                <Th>Job</Th>
                <Th>Due</Th>
                <Th className="text-right">Total</Th>
                <Th>Status</Th>
              </tr>
            </thead>
            <tbody>
              {invoices.map((invoice) => (
                <tr key={invoice.id} className="hover:bg-neutral-50 dark:hover:bg-neutral-900">
                  <Td className="font-mono text-xs">
                    <Link
                      href={`/dashboard/invoices/${invoice.id}`}
                      className="underline-offset-4 hover:underline"
                    >
                      {invoice.number}
                    </Link>
                  </Td>
                  <Td>
                    <Link
                      href={`/dashboard/customers/${invoice.customer.id}`}
                      className="underline-offset-4 hover:underline"
                    >
                      {invoice.customer.name}
                    </Link>
                  </Td>
                  <Td className="text-neutral-600 dark:text-neutral-400">
                    <Link
                      href={`/dashboard/jobs/${invoice.job.id}`}
                      className="underline-offset-4 hover:underline"
                    >
                      #{invoice.job.number}
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
      )}

      {pageCount > 1 ? (
        <div className="flex items-center gap-4 text-sm">
          {page > 1 ? (
            <Link
              href={`/dashboard/invoices?${new URLSearchParams({ status: status ?? "", page: String(page - 1) })}`}
              className="underline underline-offset-4"
            >
              Previous
            </Link>
          ) : null}
          <span className="text-neutral-500">
            Page {page} of {pageCount} · {total} total
          </span>
          {page < pageCount ? (
            <Link
              href={`/dashboard/invoices?${new URLSearchParams({ status: status ?? "", page: String(page + 1) })}`}
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
