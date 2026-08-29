import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { getInvoice } from "@/lib/db/invoices";
import { getOrgSettings } from "@/lib/db/organization";
import { requireDashboardAccess } from "@/lib/db/scope";
import { formatDate } from "@/lib/dates";
import { NotFoundError } from "@/lib/errors";
import { formatMoney, formatTaxRate } from "@/lib/money";
import { INVOICE_STATUS_LABEL } from "@/lib/status";

export const metadata: Metadata = { title: "Invoice" };

/**
 * Print-styled HTML rather than a generated PDF — Module 1 deliberately stops
 * short of a PDF pipeline. Browsers save this to PDF perfectly well.
 * The dashboard chrome is hidden by the `print:hidden` rules in the shell.
 */
export default async function PrintInvoicePage(
  props: PageProps<"/dashboard/invoices/[id]/print">,
) {
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

  return (
    <div className="mx-auto max-w-2xl">
      <div className="mb-6 flex items-center justify-between gap-4 print:hidden">
        <Link
          href={`/dashboard/invoices/${id}`}
          className="text-sm underline underline-offset-4"
        >
          ← Back to the invoice
        </Link>
        <span className="text-xs text-neutral-500">
          Use your browser&apos;s print dialog to save as PDF.
        </span>
      </div>

      <article className="rounded-lg border border-neutral-200 bg-white p-8 text-neutral-900 print:rounded-none print:border-0 print:p-0 dark:border-neutral-800">
        <header className="flex flex-wrap items-start justify-between gap-6 border-b border-neutral-200 pb-6">
          <div>
            <h1 className="text-lg font-semibold">{org.name}</h1>
            <address className="mt-1 text-sm not-italic text-neutral-600">
              {[org.addressLine, org.city, org.country].filter(Boolean).join(", ")}
              {org.phone ? <span className="block">{org.phone}</span> : null}
              {org.email ? <span className="block">{org.email}</span> : null}
            </address>
          </div>
          <div className="text-right">
            <p className="font-mono text-xs tracking-widest text-neutral-500 uppercase">
              Invoice
            </p>
            <p className="text-lg font-semibold">{invoice.number}</p>
            {invoice.status !== "SENT" && invoice.status !== "PAID" ? (
              <p className="mt-1 font-mono text-xs tracking-wider text-neutral-500 uppercase">
                {INVOICE_STATUS_LABEL[invoice.status]}
              </p>
            ) : null}
          </div>
        </header>

        <section className="grid gap-6 border-b border-neutral-200 py-6 sm:grid-cols-2">
          <div>
            <p className="font-mono text-[0.65rem] tracking-widest text-neutral-500 uppercase">
              Billed to
            </p>
            <p className="mt-1 font-medium">{invoice.customer.name}</p>
            <address className="text-sm not-italic text-neutral-600">
              {[invoice.customer.addressLine, invoice.customer.city]
                .filter(Boolean)
                .join(", ")}
              {invoice.customer.email ? (
                <span className="block">{invoice.customer.email}</span>
              ) : null}
            </address>
          </div>
          <dl className="text-sm sm:text-right">
            <div className="flex justify-between sm:justify-end sm:gap-4">
              <dt className="text-neutral-500">Issued</dt>
              <dd>
                {invoice.issuedAt ? formatDate(invoice.issuedAt, org.timezone) : "—"}
              </dd>
            </div>
            <div className="flex justify-between sm:justify-end sm:gap-4">
              <dt className="text-neutral-500">Due</dt>
              <dd>{invoice.dueAt ? formatDate(invoice.dueAt, org.timezone) : "—"}</dd>
            </div>
            <div className="flex justify-between sm:justify-end sm:gap-4">
              <dt className="text-neutral-500">Job</dt>
              <dd>#{invoice.job.number}</dd>
            </div>
          </dl>
        </section>

        {invoice.job.customerSummary ? (
          <section className="border-b border-neutral-200 py-5">
            <p className="font-mono text-[0.65rem] tracking-widest text-neutral-500 uppercase">
              Work performed
            </p>
            <p className="mt-1.5 text-sm whitespace-pre-wrap text-neutral-700">
              {invoice.job.customerSummary}
            </p>
          </section>
        ) : null}

        <table className="w-full border-collapse py-6 text-sm">
          <thead>
            <tr className="border-b border-neutral-300">
              <th className="py-2 text-left font-medium text-neutral-500">Description</th>
              <th className="py-2 text-right font-medium text-neutral-500">Qty</th>
              <th className="py-2 text-right font-medium text-neutral-500">Unit</th>
              <th className="py-2 text-right font-medium text-neutral-500">Amount</th>
            </tr>
          </thead>
          <tbody>
            {invoice.items.map((item) => (
              <tr key={item.id} className="border-b border-neutral-100">
                <td className="py-2">{item.description}</td>
                <td className="py-2 text-right tabular-nums">{item.quantity}</td>
                <td className="py-2 text-right tabular-nums">
                  {formatMoney(item.unitPriceCents, invoice.currency)}
                </td>
                <td className="py-2 text-right tabular-nums">
                  {formatMoney(item.amountCents, invoice.currency)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        <div className="flex justify-end pt-4">
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
            <div className="flex justify-between border-t-2 border-neutral-900 py-1 text-base font-semibold">
              <dt>Total</dt>
              <dd>{formatMoney(invoice.totalCents, invoice.currency)}</dd>
            </div>
          </dl>
        </div>

        {invoice.notes || org.invoiceFooter ? (
          <footer className="mt-8 border-t border-neutral-200 pt-4 text-sm text-neutral-600">
            {invoice.notes ? <p className="whitespace-pre-wrap">{invoice.notes}</p> : null}
            {org.invoiceFooter ? (
              <p className="mt-2 whitespace-pre-wrap">{org.invoiceFooter}</p>
            ) : null}
          </footer>
        ) : null}
      </article>
    </div>
  );
}
