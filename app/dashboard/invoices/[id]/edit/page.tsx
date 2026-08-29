import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { EmptyState, LinkButton, PageHeader } from "@/components/ui/primitives";
import { getInvoice } from "@/lib/db/invoices";
import { getOrgSettings } from "@/lib/db/organization";
import { requireDashboardAccess } from "@/lib/db/scope";
import { NotFoundError } from "@/lib/errors";
import { toMajor } from "@/lib/money";

import { updateInvoiceAction } from "../../actions";
import { InvoiceForm } from "../../invoice-form";

export const metadata: Metadata = { title: "Edit invoice" };

export default async function EditInvoicePage(
  props: PageProps<"/dashboard/invoices/[id]/edit">,
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

  if (invoice.status !== "DRAFT") {
    return (
      <div className="flex flex-col gap-6">
        <PageHeader title={`Invoice ${invoice.number}`} />
        <EmptyState
          title="Sent invoices can't be edited"
          description="An invoice is a record of what was sent. Cancel it and raise a new one if the amount was wrong."
          action={
            <LinkButton href={`/dashboard/invoices/${id}`}>Back to the invoice</LinkButton>
          }
        />
      </div>
    );
  }

  const org = await getOrgSettings();

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={`Edit ${invoice.number}`}
        description={`${invoice.customer.name} · job #${invoice.job.number}`}
      />
      <InvoiceForm
        action={updateInvoiceAction}
        currency={invoice.currency}
        invoiceId={invoice.id}
        initialItems={invoice.items.map((item) => ({
          description: item.description,
          kind: item.kind,
          quantity: item.quantity,
          unitPriceMajor: toMajor(item.unitPriceCents),
        }))}
        initialTaxPercent={invoice.taxRateBps / 100}
        initialNotes={invoice.notes ?? undefined}
        submitLabel="Save draft"
        cancelHref={`/dashboard/invoices/${id}`}
      />
      <p className="text-xs text-neutral-500">
        Prices here are a snapshot. Changing a service type&apos;s price later
        won&apos;t alter this invoice — {org.name} bills what was agreed.
      </p>
    </div>
  );
}
