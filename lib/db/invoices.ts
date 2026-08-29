import { ForbiddenError, NotFoundError } from "@/lib/errors";
import { computeTotals, toCents } from "@/lib/money";
import { enqueueNotifications } from "@/lib/notifications/enqueue";
import type { InvoiceItemInput } from "@/lib/validation/invoice";
import type { InvoiceStatus, Prisma } from "@prisma/client";

import { prisma } from "./prisma";
import { getScope } from "./scope";

export const INVOICES_PER_PAGE = 25;

function formatNumber(prefix: string, sequence: number): string {
  return `${prefix}-${String(sequence).padStart(4, "0")}`;
}

function toRows(items: InvoiceItemInput[]) {
  return items.map((item, index) => {
    const unitPriceCents = toCents(item.unitPriceMajor);
    return {
      description: item.description,
      kind: item.kind,
      quantity: item.quantity,
      unitPriceCents,
      amountCents: item.quantity * unitPriceCents,
      position: index,
    };
  });
}

export async function listInvoices({
  status,
  page = 1,
}: { status?: InvoiceStatus; page?: number } = {}) {
  const { orgId } = await getScope();
  const where: Prisma.InvoiceWhereInput = {
    organizationId: orgId,
    ...(status ? { status } : {}),
  };

  const [invoices, total, outstanding] = await Promise.all([
    prisma.invoice.findMany({
      where,
      orderBy: { sequence: "desc" },
      skip: (page - 1) * INVOICES_PER_PAGE,
      take: INVOICES_PER_PAGE,
      select: {
        id: true,
        number: true,
        status: true,
        totalCents: true,
        amountPaidCents: true,
        currency: true,
        issuedAt: true,
        dueAt: true,
        customer: { select: { id: true, name: true } },
        job: { select: { id: true, number: true, title: true } },
      },
    }),
    prisma.invoice.count({ where }),
    prisma.invoice.aggregate({
      where: { organizationId: orgId, status: { in: ["SENT", "OVERDUE"] } },
      _sum: { totalCents: true },
    }),
  ]);

  return {
    invoices,
    total,
    page,
    pageCount: Math.max(1, Math.ceil(total / INVOICES_PER_PAGE)),
    outstandingCents: outstanding._sum.totalCents ?? 0,
  };
}

export async function getInvoice(id: string) {
  const { orgId } = await getScope();
  const invoice = await prisma.invoice.findFirst({
    where: { id, organizationId: orgId },
    include: {
      items: { orderBy: { position: "asc" } },
      customer: true,
      job: {
        select: {
          id: true,
          number: true,
          title: true,
          completedAt: true,
          customerSummary: true,
          serviceType: { select: { name: true } },
        },
      },
    },
  });
  if (!invoice) throw new NotFoundError("Invoice not found");
  return invoice;
}

/** A completed job that hasn't been invoiced yet, ready to prefill a draft. */
export async function getInvoiceableJob(jobId: string) {
  const { orgId } = await getScope();
  const job = await prisma.job.findFirst({
    where: { id: jobId, organizationId: orgId },
    select: {
      id: true,
      number: true,
      title: true,
      status: true,
      customer: { select: { id: true, name: true } },
      serviceType: { select: { name: true, defaultPriceCents: true } },
      invoice: { select: { id: true } },
    },
  });
  if (!job) throw new NotFoundError("Job not found");
  return job;
}

/** Completed jobs with no invoice — the picker on /invoices/new. */
export async function uninvoicedJobs() {
  const { orgId } = await getScope();
  return prisma.job.findMany({
    where: { organizationId: orgId, status: "COMPLETED", invoice: { is: null } },
    orderBy: { completedAt: "desc" },
    select: {
      id: true,
      number: true,
      title: true,
      customer: { select: { name: true } },
      serviceType: { select: { name: true, defaultPriceCents: true } },
    },
  });
}

export async function createInvoice(input: {
  jobId: string;
  items: InvoiceItemInput[];
  taxRateBps: number;
  notes?: string;
}) {
  const { orgId } = await getScope();

  return prisma.$transaction(async (tx) => {
    const job = await tx.job.findFirst({
      where: { id: input.jobId, organizationId: orgId },
      select: {
        id: true,
        status: true,
        customerId: true,
        invoice: { select: { id: true } },
      },
    });
    if (!job) throw new NotFoundError("Job not found");
    // The schema's unique jobId would catch this too; the message is better here.
    if (job.invoice) throw new ForbiddenError("That job already has an invoice.");
    if (job.status !== "COMPLETED") {
      throw new ForbiddenError("Only a completed job can be invoiced.");
    }

    const org = await tx.organization.update({
      where: { id: orgId },
      data: { nextInvoiceNumber: { increment: 1 } },
      select: { nextInvoiceNumber: true, invoicePrefix: true, currency: true },
    });
    const sequence = org.nextInvoiceNumber - 1;

    const rows = toRows(input.items);
    const totals = computeTotals(rows, input.taxRateBps);

    return tx.invoice.create({
      data: {
        organizationId: orgId,
        sequence,
        number: formatNumber(org.invoicePrefix, sequence),
        customerId: job.customerId,
        jobId: job.id,
        currency: org.currency,
        taxRateBps: input.taxRateBps,
        ...totals,
        notes: input.notes ?? null,
        items: { create: rows },
      },
      select: { id: true },
    });
  });
}

export async function updateDraftInvoice(input: {
  id: string;
  items: InvoiceItemInput[];
  taxRateBps: number;
  notes?: string;
}) {
  const { orgId } = await getScope();

  await prisma.$transaction(async (tx) => {
    const invoice = await tx.invoice.findFirst({
      where: { id: input.id, organizationId: orgId },
      select: { id: true, status: true },
    });
    if (!invoice) throw new NotFoundError("Invoice not found");
    if (invoice.status !== "DRAFT") {
      throw new ForbiddenError("Only a draft can be edited. Cancel it and raise a new one.");
    }

    const rows = toRows(input.items);
    const totals = computeTotals(rows, input.taxRateBps);

    await tx.invoiceItem.deleteMany({ where: { invoiceId: input.id } });
    await tx.invoice.update({
      where: { id: input.id },
      data: {
        taxRateBps: input.taxRateBps,
        ...totals,
        notes: input.notes ?? null,
        items: { create: rows },
      },
    });
  });
}

export async function sendInvoice(id: string) {
  const { orgId } = await getScope();

  await prisma.$transaction(async (tx) => {
    const invoice = await tx.invoice.findFirst({
      where: { id, organizationId: orgId },
      select: {
        id: true,
        number: true,
        status: true,
        totalCents: true,
        currency: true,
        customer: { select: { name: true, email: true } },
        job: { select: { id: true, number: true, title: true } },
      },
    });
    if (!invoice) throw new NotFoundError("Invoice not found");
    if (invoice.status !== "DRAFT") throw new ForbiddenError("This invoice has already been sent.");

    const org = await tx.organization.findUniqueOrThrow({
      where: { id: orgId },
      select: { name: true, invoiceDueDays: true, timezone: true },
    });

    const issuedAt = new Date();
    const dueAt = new Date(issuedAt.getTime() + org.invoiceDueDays * 86_400_000);

    await tx.invoice.update({
      where: { id },
      data: { status: "SENT", issuedAt, dueAt, sentAt: issuedAt },
    });

    await enqueueNotifications(tx, {
      organizationId: orgId,
      type: "INVOICE_SENT",
      subject: `Invoice ${invoice.number} from ${org.name}`,
      payload: {
        invoiceNumber: invoice.number,
        totalFormatted: new Intl.NumberFormat("en", {
          style: "currency",
          currency: invoice.currency,
        }).format(invoice.totalCents / 100),
        dueDate: new Intl.DateTimeFormat("en", {
          timeZone: org.timezone,
          day: "numeric",
          month: "short",
          year: "numeric",
        }).format(dueAt),
        customerName: invoice.customer.name,
        jobNumber: invoice.job.number,
        jobTitle: invoice.job.title,
        orgName: org.name,
        timezone: org.timezone,
      },
      invoiceId: id,
      jobId: invoice.job.id,
      recipients: [
        { kind: "CUSTOMER", email: invoice.customer.email, name: invoice.customer.name },
      ],
    });
  });
}

export async function markInvoicePaid(id: string) {
  const { orgId } = await getScope();
  const invoice = await prisma.invoice.findFirst({
    where: { id, organizationId: orgId },
    select: { status: true, totalCents: true },
  });
  if (!invoice) throw new NotFoundError("Invoice not found");
  if (invoice.status === "PAID") return;
  if (invoice.status === "DRAFT") {
    throw new ForbiddenError("Send the invoice before marking it paid.");
  }

  await prisma.invoice.update({
    where: { id },
    data: {
      status: "PAID",
      paidAt: new Date(),
      amountPaidCents: invoice.totalCents,
    },
  });
}

export async function cancelInvoice(id: string) {
  const { orgId } = await getScope();
  const { count } = await prisma.invoice.updateMany({
    // Cancel, never delete: deleting a numbered invoice puts a hole in the
    // sequence, which is exactly what an auditor asks about.
    where: { id, organizationId: orgId, status: { not: "PAID" } },
    data: { status: "CANCELLED" },
  });
  if (count === 0) throw new NotFoundError("Invoice not found, or already paid");
}
