import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { InvoiceStatusBadge } from "@/components/status-badge";
import {
  Button,
  Card,
  LinkButton,
  PageHeader,
  Table,
  Td,
  Th,
} from "@/components/ui/primitives";
import { getInvoice } from "@/lib/db/invoices";
import { getOrgSettings } from "@/lib/db/organization";
import { requireDashboardAccess } from "@/lib/db/scope";
import { formatDate } from "@/lib/dates";
import { NotFoundError } from "@/lib/errors";
import { formatMoney, formatTaxRate } from "@/lib/money";

import { cancelInvoiceAction } from "../actions";
import { MarkPaidButton, SendInvoiceButton } from "./invoice-actions";

export const metadata: Metadata = { title: "Invoice" };

export default async function InvoicePage(props: PageProps<"/dashboard/invoices/[id]">) {
  const { id } = await props.params;
  await requireDashboardAccess();

  let invoice: Awaited<ReturnType<typeof getInvoice>>;
  try {
    invoice = await getInvoice(id);
  } catch (error) {
    if (error instanceof NotFoundError) notFound();
    throw error;
  }

  const org = await getOrgSettings();
  const isDraft = invoice.status === "DRAFT";
  const isOpen = invoice.status === "SENT" || invoice.status === "OVERDUE";

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={invoice.number}
        description={`${invoice.customer.name} · job #${invoice.job.number}`}
        actions={
          <>
            <LinkButton variant="secondary" href={`/dashboard/invoices/${id}/print`}>
              Print
            </LinkButton>
            {isDraft ? (
              <LinkButton variant="secondary" href={`/dashboard/invoices/${id}/edit`}>
                Edit
              </LinkButton>
            ) : null}
            {invoice.status !== "PAID" && invoice.status !== "CANCELLED" ? (
              <form action={cancelInvoiceAction}>
                <input type="hidden" name="id" value={invoice.id} />
                <Button variant="danger" type="submit">
                  Cancel
                </Button>
              </form>
            ) : null}
          </>
        }
      />

      <div className="flex flex-wrap items-center gap-3">
        <InvoiceStatusBadge status={invoice.status} />
        {invoice.issuedAt ? (
          <span className="text-xs text-neutral-500">
            Issued {formatDate(invoice.issuedAt, org.timezone)}
          </span>
        ) : null}
        {invoice.dueAt ? (
          <span className="text-xs text-neutral-500">
            Due {formatDate(invoice.dueAt, org.timezone)}
          </span>
        ) : null}
        {invoice.paidAt ? (
          <span className="text-xs text-green-700 dark:text-green-400">
            Paid {formatDate(invoice.paidAt, org.timezone)}
          </span>
        ) : null}
      </div>

      {isDraft || isOpen ? (
        <Card className="flex flex-wrap items-start gap-4 p-5">
          {isDraft ? (
            <SendInvoiceButton
              invoiceId={invoice.id}
              hasEmail={Boolean(invoice.customer.email)}
            />
          ) : null}
          {isOpen ? <MarkPaidButton invoiceId={invoice.id} /> : null}
          <p className="max-w-sm text-xs text-neutral-500">
            {isDraft
              ? "Sending queues the customer's email and starts the clock on the due date."
              : "Module 1 tracks payment manually — no gateway is connected."}
          </p>
        </Card>
      ) : null}

      <Card>
        <Table>
          <thead>
            <tr>
              <Th>Description</Th>
              <Th>Type</Th>
              <Th className="text-right">Qty</Th>
              <Th className="text-right">Unit</Th>
              <Th className="text-right">Amount</Th>
            </tr>
          </thead>
          <tbody>
            {invoice.items.map((item) => (
              <tr key={item.id}>
                <Td>{item.description}</Td>
                <Td className="text-neutral-600 dark:text-neutral-400">
                  {item.kind.toLowerCase()}
                </Td>
                <Td className="text-right tabular-nums">{item.quantity}</Td>
                <Td className="text-right tabular-nums">
                  {formatMoney(item.unitPriceCents, invoice.currency)}
                </Td>
                <Td className="text-right tabular-nums">
                  {formatMoney(item.amountCents, invoice.currency)}
                </Td>
              </tr>
            ))}
          </tbody>
        </Table>

        <div className="flex justify-end px-3 py-4">
          <dl className="w-56 text-sm tabular-nums">
            <div className="flex justify-between py-1">
              <dt className="text-neutral-500">Subtotal</dt>
              <dd>{formatMoney(invoice.subtotalCents, invoice.currency)}</dd>
            </div>
            <div className="flex justify-between py-1">
              <dt className="text-neutral-500">
                Tax {formatTaxRate(invoice.taxRateBps)}
              </dt>
              <dd>{formatMoney(invoice.taxCents, invoice.currency)}</dd>
            </div>
            <div className="flex justify-between border-t border-neutral-200 py-1 font-semibold dark:border-neutral-800">
              <dt>Total</dt>
              <dd>{formatMoney(invoice.totalCents, invoice.currency)}</dd>
            </div>
          </dl>
        </div>
      </Card>

      {invoice.notes ? (
        <Card className="p-5">
          <p className="font-mono text-[0.65rem] tracking-widest text-neutral-500 uppercase">
            Notes
          </p>
          <p className="mt-2 text-sm whitespace-pre-wrap">{invoice.notes}</p>
        </Card>
      ) : null}

      <p className="text-xs text-neutral-500">
        Billing{" "}
        <Link
          href={`/dashboard/jobs/${invoice.job.id}`}
          className="underline underline-offset-4"
        >
          job #{invoice.job.number} — {invoice.job.title}
        </Link>
        {invoice.job.completedAt
          ? `, completed ${formatDate(invoice.job.completedAt, org.timezone)}`
          : ""}
        .
      </p>
    </div>
  );
}
