import { z } from "zod";

const itemKind = z.enum(["LABOUR", "PARTS", "FEE", "DISCOUNT", "OTHER"]);

export const invoiceItemSchema = z.object({
  description: z.string().trim().min(1, "Describe the line").max(200),
  kind: itemKind,
  quantity: z.coerce.number().int().min(1).max(9999),
  unitPriceMajor: z.coerce.number().min(-1_000_000).max(1_000_000),
});

/**
 * Line items arrive as repeated form fields (itemDescription, itemKind, …)
 * read with formData.getAll(), so the rows stay index-aligned without any
 * bracket-name parsing.
 */
export const invoiceSchema = z.object({
  jobId: z.string().min(1, "An invoice belongs to a job"),
  taxRatePercent: z.coerce.number().min(0).max(100),
  notes: z
    .string()
    .trim()
    .max(1000)
    .optional()
    .transform((value) => (value ? value : undefined)),
  items: z.array(invoiceItemSchema).min(1, "Add at least one line"),
});

export const invoiceUpdateSchema = invoiceSchema.omit({ jobId: true }).extend({
  id: z.string().min(1),
});

export type InvoiceItemInput = z.infer<typeof invoiceItemSchema>;

/** Pulls the repeated item fields out of a FormData into aligned rows. */
export function readItems(formData: FormData) {
  const descriptions = formData.getAll("itemDescription");
  const kinds = formData.getAll("itemKind");
  const quantities = formData.getAll("itemQuantity");
  const prices = formData.getAll("itemUnitPrice");

  return descriptions
    .map((description, index) => ({
      description: String(description),
      kind: String(kinds[index] ?? "LABOUR"),
      quantity: String(quantities[index] ?? "1"),
      unitPriceMajor: String(prices[index] ?? "0"),
    }))
    // A blank row is someone who added a line and changed their mind.
    .filter((row) => row.description.trim().length > 0);
}
