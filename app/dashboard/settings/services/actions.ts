"use server";

import { revalidatePath } from "next/cache";

import { invalid, toActionState, type ActionState } from "@/lib/actions";
import { requireRole } from "@/lib/db/scope";
import {
  createServiceType,
  setServiceTypeActive,
  updateServiceType,
} from "@/lib/db/service-types";
import { toCents } from "@/lib/money";
import { serviceTypeSchema } from "@/lib/validation/organization";

const PATH = "/dashboard/settings/services";

export async function createServiceTypeAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const parsed = serviceTypeSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return invalid(parsed.error);

  try {
    await requireRole("ADMIN");
    await createServiceType({
      name: parsed.data.name,
      defaultDurationMinutes: parsed.data.defaultDurationMinutes,
      defaultPriceCents: toCents(parsed.data.defaultPriceMajor),
    });
  } catch (error) {
    // A duplicate name trips the (organizationId, name) unique index.
    if (
      typeof error === "object" &&
      error !== null &&
      (error as { code?: string }).code === "P2002"
    ) {
      return { error: "You already have a service with that name." };
    }
    return toActionState(error);
  }

  revalidatePath(PATH);
  return { success: "Service added." };
}

export async function updateServiceTypeAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const id = formData.get("id");
  if (typeof id !== "string" || !id) return { error: "Missing service." };

  const parsed = serviceTypeSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return invalid(parsed.error);

  try {
    await requireRole("ADMIN");
    await updateServiceType(id, {
      name: parsed.data.name,
      defaultDurationMinutes: parsed.data.defaultDurationMinutes,
      defaultPriceCents: toCents(parsed.data.defaultPriceMajor),
    });
  } catch (error) {
    return toActionState(error);
  }

  revalidatePath(PATH);
  return { success: "Saved." };
}

export async function toggleServiceTypeAction(formData: FormData): Promise<void> {
  const id = formData.get("id");
  const active = formData.get("active") === "true";
  if (typeof id !== "string" || !id) return;

  await requireRole("ADMIN");
  await setServiceTypeActive(id, active);
  revalidatePath(PATH);
}
