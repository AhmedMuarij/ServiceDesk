"use server";

import { AI_MODEL } from "@/lib/ai/config";
import { draftInvoice } from "@/lib/ai/features/draft-invoice";
import { createSuggestion, rejectSuggestion } from "@/lib/db/ai";
import { acceptSuggestion } from "@/lib/db/ai";
import { requireRole } from "@/lib/db/scope";
import { ForbiddenError, NotFoundError, UnauthorizedError } from "@/lib/errors";

export type DraftLine = {
  description: string;
  kind: "LABOUR" | "PARTS" | "FEE" | "DISCOUNT" | "OTHER";
  quantity: number;
  unitPriceMajor: number;
  priceSource: "catalog" | "notes" | "unknown";
};

export type InvoiceDraftSuggestion = {
  id: string;
  lines: DraftLine[];
  note: string | null;
  rationale: string;
};

export type DraftResult =
  | { ok: true; suggestion: InvoiceDraftSuggestion }
  | { ok: false; kind: "unavailable" | "error"; message: string };

export async function suggestInvoiceDraftAction(input: {
  jobId: string;
}): Promise<DraftResult> {
  let orgId: string;
  try {
    ({ orgId } = await requireRole("MANAGER"));
  } catch (error) {
    if (error instanceof UnauthorizedError || error instanceof ForbiddenError) {
      return { ok: false, kind: "error", message: "You can't do that." };
    }
    throw error;
  }

  let result;
  try {
    result = await draftInvoice({ organizationId: orgId, jobId: input.jobId });
  } catch (error) {
    if (error instanceof NotFoundError) {
      return { ok: false, kind: "error", message: "That job no longer exists." };
    }
    throw error;
  }

  if (!result.ok) {
    const unavailable =
      result.reason === "no_key" ||
      result.reason === "org_disabled" ||
      result.reason === "feature_disabled" ||
      result.reason === "over_budget" ||
      result.reason === "rate_limited";
    return {
      ok: false,
      kind: unavailable ? "unavailable" : "error",
      message: result.message,
    };
  }

  const suggestion = await createSuggestion({
    feature: "INVOICE_DRAFT",
    jobId: input.jobId,
    payload: { lines: result.data.lines, note: result.data.note },
    rationale: result.data.rationale,
    model: AI_MODEL,
  });

  return { ok: true, suggestion: { id: suggestion.id, ...result.data } };
}

/**
 * Recorded only. The lines land in the invoice form, and the invoice is
 * created by the ordinary createInvoiceAction when the user submits it —
 * with its own validation and its own arithmetic in computeTotals.
 */
export async function decideInvoiceDraftAction(input: {
  id: string;
  accept: boolean;
}): Promise<{ ok: boolean }> {
  try {
    await requireRole("MANAGER");
    if (input.accept) await acceptSuggestion(input.id);
    else await rejectSuggestion(input.id);
    return { ok: true };
  } catch {
    return { ok: false };
  }
}
