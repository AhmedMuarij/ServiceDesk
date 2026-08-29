import { z } from "zod";

import { ask, type AiResult } from "@/lib/ai/client";
import { prisma } from "@/lib/db/prisma";
import { NotFoundError } from "@/lib/errors";
import { toMajor } from "@/lib/money";

/**
 * Drafts invoice lines from what the technician recorded.
 *
 * This one touches money, so it is the most conservative feature in the
 * module. The model may propose *descriptions* and *quantities* freely, but
 * prices only from the org's own catalog or from a figure written in the
 * notes. It is explicitly told to leave a price at zero rather than guess —
 * a zero is obviously wrong and gets fixed; a plausible invented price gets
 * sent to a customer.
 */

export type InvoiceDraft = {
  lines: Array<{
    description: string;
    kind: "LABOUR" | "PARTS" | "FEE" | "DISCOUNT" | "OTHER";
    quantity: number;
    unitPriceMajor: number;
    priceSource: "catalog" | "notes" | "unknown";
  }>;
  note: string | null;
  rationale: string;
};

const schema = z.object({
  lines: z
    .array(
      z.object({
        description: z.string().min(1).max(160),
        kind: z.enum(["LABOUR", "PARTS", "FEE", "DISCOUNT", "OTHER"]),
        quantity: z.number().int().min(1).max(99),
        unitPriceMajor: z.number().min(0).max(1_000_000),
        priceSource: z.enum(["catalog", "notes", "unknown"]),
      }),
    )
    .min(1)
    .max(8),
  note: z.string().max(400).nullable(),
  rationale: z.string().min(1).max(300),
});

export async function draftInvoice(input: {
  organizationId: string;
  jobId: string;
}): Promise<AiResult<InvoiceDraft>> {
  const job = await prisma.job.findFirst({
    where: { id: input.jobId, organizationId: input.organizationId },
    select: {
      number: true,
      title: true,
      description: true,
      customerSummary: true,
      customer: { select: { name: true } },
      serviceType: { select: { name: true, defaultPriceCents: true } },
      notes: { orderBy: { createdAt: "asc" }, select: { body: true } },
    },
  });
  if (!job) throw new NotFoundError("Job not found");

  const org = await prisma.organization.findUnique({
    where: { id: input.organizationId },
    select: { name: true, currency: true },
  });

  const catalog = await prisma.serviceType.findMany({
    where: { organizationId: input.organizationId, isActive: true },
    orderBy: { name: "asc" },
    select: { name: true, defaultPriceCents: true },
  });

  const currency = org?.currency ?? "PKR";

  const cachedSystem = `You draft invoice lines for ${org?.name ?? "a field service business"}. A human reviews and edits every line before anything is sent, but they are busy and will trust a plausible-looking number, so being wrong is worse than being incomplete.

Your price list (amounts in ${currency}):
${catalog.map((service) => `- ${service.name}: ${toMajor(service.defaultPriceCents)}`).join("\n") || "- (nothing priced yet)"}

Rules about money — these matter more than anything else:
- Use a price from the list above when the line corresponds to one of those services. Mark it priceSource "catalog".
- Use a price written in the technician's notes when there is one. Mark it "notes".
- Otherwise put 0 and mark it "unknown". Never estimate, never use a typical market rate, never carry a number over from a different line. A zero is obviously incomplete and the reviewer will fill it in; an invented price looks finished and gets sent.

Rules about lines:
- The main line is the service that was actually booked, at its list price. There is exactly one of these.
- Work done during that same visit is **not** a second service call, even when it resembles another entry on the price list. A gas top-up during a repair visit is materials, not a "Gas refilling" callout — the customer is already paying for the visit. Billing two full services for one visit charges the callout twice, which is the single worst mistake you can make here.
- Only bill a second full service if the notes describe a genuinely separate job — a different unit, a different visit, or work the customer separately asked for.
- After the main line, add lines for parts or materials the notes actually mention, priced from the notes or left at 0.
- Quantities only when the notes state them. Otherwise 1.
- Descriptions are for the customer, not the technician: "Refrigerant gas (450g R410)" rather than "charged 450".
- Do not invent parts. If the notes say the filter was cleaned, that is labour, not a part.
- "note" is an optional line for the invoice footer if the notes suggest something the customer should know about payment or warranty. Usually null.
- "rationale" tells the reviewer in one sentence what you priced and what you left at zero for them.`;

  const notes = job.notes.length
    ? job.notes.map((note) => `- ${note.body}`).join("\n")
    : "(no notes)";

  const user = `Job #${job.number} for ${job.customer.name}
Service booked: ${job.serviceType?.name ?? "not specified"}${
    job.serviceType ? ` (list price ${toMajor(job.serviceType.defaultPriceCents)} ${currency})` : ""
  }
Reported problem: ${job.title}
${job.description ? `Detail at intake: ${job.description}` : ""}

Technician's notes:
${notes}
${job.customerSummary ? `\nAgreed summary of the work:\n${job.customerSummary}` : ""}

Draft the invoice lines.`;

  return ask({
    organizationId: input.organizationId,
    feature: "INVOICE_DRAFT",
    cachedSystem,
    user,
    schema,
  });
}
