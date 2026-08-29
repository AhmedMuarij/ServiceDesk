"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { invalid, toActionState, type ActionState } from "@/lib/actions";
import {
  cancelInvoice,
  createInvoice,
  markInvoicePaid,
  sendInvoice,
  updateDraftInvoice,
} from "@/lib/db/invoices";
import { requireRole } from "@/lib/db/scope";
import { invoiceSchema, invoiceUpdateSchema, readItems } from "@/lib/validation/invoice";

function revalidate(id?: string) {
  revalidatePath("/dashboard/invoices");
  revalidatePath("/dashboard");
  if (id) revalidatePath(`/dashboard/invoices/${id}`);
}

export async function createInvoiceAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const parsed = invoiceSchema.safeParse({
    jobId: formData.get("jobId"),
    taxRatePercent: formData.get("taxRatePercent"),
    notes: formData.get("notes"),
    items: readItems(formData),
  });
  if (!parsed.success) return invalid(parsed.error);

  let id: string;
  try {
    await requireRole("MANAGER");
    const invoice = await createInvoice({
      jobId: parsed.data.jobId,
      items: parsed.data.items,
      // Percent in the UI, basis points in storage.
      taxRateBps: Math.round(parsed.data.taxRatePercent * 100),
      notes: parsed.data.notes,
    });
    id = invoice.id;
  } catch (error) {
    return toActionState(error);
  }

  revalidate(id);
  redirect(`/dashboard/invoices/${id}`);
}

export async function updateInvoiceAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const parsed = invoiceUpdateSchema.safeParse({
    id: formData.get("id"),
    taxRatePercent: formData.get("taxRatePercent"),
    notes: formData.get("notes"),
    items: readItems(formData),
  });
  if (!parsed.success) return invalid(parsed.error);

  try {
    await requireRole("MANAGER");
    await updateDraftInvoice({
      id: parsed.data.id,
      items: parsed.data.items,
      taxRateBps: Math.round(parsed.data.taxRatePercent * 100),
      notes: parsed.data.notes,
    });
  } catch (error) {
    return toActionState(error);
  }

  revalidate(parsed.data.id);
  redirect(`/dashboard/invoices/${parsed.data.id}`);
}

export async function sendInvoiceAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const id = formData.get("id");
  if (typeof id !== "string" || !id) return { error: "Missing invoice." };

  try {
    await requireRole("MANAGER");
    await sendInvoice(id);
  } catch (error) {
    return toActionState(error);
  }

  revalidate(id);
  return { success: "Invoice sent." };
}

export async function markPaidAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const id = formData.get("id");
  if (typeof id !== "string" || !id) return { error: "Missing invoice." };

  try {
    await requireRole("MANAGER");
    await markInvoicePaid(id);
  } catch (error) {
    return toActionState(error);
  }

  revalidate(id);
  return { success: "Marked as paid." };
}

export async function cancelInvoiceAction(formData: FormData): Promise<void> {
  const id = formData.get("id");
  if (typeof id !== "string" || !id) return;

  await requireRole("MANAGER");
  await cancelInvoice(id);
  revalidate(id);
}
