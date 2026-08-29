"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { invalid, toActionState, type ActionState } from "@/lib/actions";
import {
  createCustomer,
  setCustomerArchived,
  updateCustomer,
} from "@/lib/db/customers";
import { requireRole } from "@/lib/db/scope";
import { customerSchema } from "@/lib/validation/customer";

export async function createCustomerAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const parsed = customerSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return invalid(parsed.error);

  let id: string;
  try {
    await requireRole("MANAGER");
    ({ id } = await createCustomer(parsed.data));
  } catch (error) {
    return toActionState(error);
  }

  revalidatePath("/dashboard/customers");
  redirect(`/dashboard/customers/${id}`);
}

export async function updateCustomerAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const id = formData.get("id");
  if (typeof id !== "string" || !id) return { error: "Missing customer." };

  const parsed = customerSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return invalid(parsed.error);

  try {
    await requireRole("MANAGER");
    await updateCustomer(id, parsed.data);
  } catch (error) {
    return toActionState(error);
  }

  revalidatePath(`/dashboard/customers/${id}`);
  revalidatePath("/dashboard/customers");
  redirect(`/dashboard/customers/${id}`);
}

export async function archiveCustomerAction(formData: FormData): Promise<void> {
  const id = formData.get("id");
  const archived = formData.get("archived") === "true";
  if (typeof id !== "string" || !id) return;

  await requireRole("MANAGER");
  await setCustomerArchived(id, archived);

  revalidatePath(`/dashboard/customers/${id}`);
  revalidatePath("/dashboard/customers");
}
