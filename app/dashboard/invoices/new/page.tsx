import type { Metadata } from "next";
import Link from "next/link";

import { checkAvailability } from "@/lib/ai/client";
import { Card, EmptyState, LinkButton, PageHeader } from "@/components/ui/primitives";
import { getInvoiceableJob, uninvoicedJobs } from "@/lib/db/invoices";
import { getOrgSettings } from "@/lib/db/organization";
import { requireDashboardAccess } from "@/lib/db/scope";
import { NotFoundError } from "@/lib/errors";
import { toMajor } from "@/lib/money";

import { createInvoiceAction } from "../actions";
import { InvoiceForm } from "../invoice-form";

export const metadata: Metadata = { title: "New invoice" };

export default async function NewInvoicePage(props: PageProps<"/dashboard/invoices/new">) {
  await requireDashboardAccess();
  const search = await props.searchParams;
  const org = await getOrgSettings();
  const jobId = typeof search.jobId === "string" ? search.jobId : undefined;

  if (!jobId) {
    const jobs = await uninvoicedJobs();
    return (
      <div className="flex flex-col gap-6">
        <PageHeader
          title="New invoice"
          description="Pick the completed job you're billing for."
        />
        {jobs.length === 0 ? (
          <EmptyState
            title="Nothing to invoice"
            description="An invoice is raised against a completed job. Finish a job and it will appear here."
            action={<LinkButton href="/dashboard/jobs">Go to jobs</LinkButton>}
          />
        ) : (
          <Card className="divide-y divide-neutral-200 dark:divide-neutral-800">
            {jobs.map((job) => (
              <Link
                key={job.id}
                href={`/dashboard/invoices/new?jobId=${job.id}`}
                className="flex items-center justify-between gap-4 px-4 py-3 hover:bg-neutral-50 dark:hover:bg-neutral-900"
              >
                <div>
                  <p className="font-medium">
                    #{job.number} {job.title}
                  </p>
                  <p className="text-sm text-neutral-500">
                    {job.customer.name}
                    {job.serviceType ? ` · ${job.serviceType.name}` : ""}
                  </p>
                </div>
                <span className="text-sm text-neutral-400">Invoice →</span>
              </Link>
            ))}
          </Card>
        )}
      </div>
    );
  }

  let job: Awaited<ReturnType<typeof getInvoiceableJob>>;
  try {
    job = await getInvoiceableJob(jobId);
  } catch (error) {
    if (error instanceof NotFoundError) {
      return (
        <div className="flex flex-col gap-6">
          <PageHeader title="New invoice" />
          <EmptyState title="Job not found" description="It may have been cancelled." />
        </div>
      );
    }
    throw error;
  }

  if (job.invoice) {
    return (
      <div className="flex flex-col gap-6">
        <PageHeader title="Already invoiced" />
        <EmptyState
          title={`Job #${job.number} has an invoice`}
          description="Module 1 keeps it to one invoice per job."
          action={
            <LinkButton href={`/dashboard/invoices/${job.invoice.id}`}>
              Open the invoice
            </LinkButton>
          }
        />
      </div>
    );
  }

  if (job.status !== "COMPLETED") {
    return (
      <div className="flex flex-col gap-6">
        <PageHeader title="Not finished yet" />
        <EmptyState
          title={`Job #${job.number} isn't complete`}
          description="Mark the work done first — the invoice should reflect what actually happened."
          action={<LinkButton href={`/dashboard/jobs/${job.id}`}>Open the job</LinkButton>}
        />
      </div>
    );
  }

  const draftAi = await checkAvailability(org.id, "INVOICE_DRAFT");

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={`Invoice for job #${job.number}`}
        description={`${job.customer.name} · ${job.title}`}
      />
      <InvoiceForm
        action={createInvoiceAction}
        currency={org.currency}
        jobId={job.id}
        initialItems={[
          {
            description: job.serviceType?.name ?? job.title,
            kind: "LABOUR",
            quantity: 1,
            unitPriceMajor: toMajor(job.serviceType?.defaultPriceCents ?? 0),
          },
        ]}
        initialTaxPercent={org.defaultTaxRateBps / 100}
        submitLabel="Create draft"
        cancelHref={`/dashboard/jobs/${job.id}`}
        aiJobId={draftAi.available ? job.id : undefined}
      />
    </div>
  );
}
