"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { invalid, toActionState, type ActionState } from "@/lib/actions";
import { requireRole } from "@/lib/db/scope";
import {
  cancelInvite,
  inviteMember,
  setMemberStatus,
  updateMemberRole,
  updateTechnicianProfile,
} from "@/lib/db/team";
import {
  inviteSchema,
  memberRoleSchema,
  technicianProfileSchema,
} from "@/lib/validation/team";

const PATH = "/dashboard/team";

export async function inviteMemberAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const parsed = inviteSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return invalid(parsed.error);

  try {
    await requireRole("ADMIN");
    await inviteMember(parsed.data.email, parsed.data.role);
  } catch (error) {
    return toActionState(error);
  }

  revalidatePath(PATH);
  redirect(PATH);
}

export async function updateMemberRoleAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const parsed = memberRoleSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return invalid(parsed.error);

  try {
    await requireRole("ADMIN");
    await updateMemberRole(parsed.data.id, parsed.data.role);
  } catch (error) {
    return toActionState(error);
  }

  revalidatePath(PATH);
  revalidatePath(`${PATH}/${parsed.data.id}`);
  return { success: "Role updated." };
}

export async function updateTechnicianProfileAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const parsed = technicianProfileSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return invalid(parsed.error);

  try {
    await requireRole("ADMIN");
    const { id, ...profile } = parsed.data;
    await updateTechnicianProfile(id, profile);
  } catch (error) {
    return toActionState(error);
  }

  revalidatePath(`${PATH}/${parsed.data.id}`);
  return { success: "Saved." };
}

export async function setMemberStatusAction(formData: FormData): Promise<void> {
  const id = formData.get("id");
  const suspended = formData.get("suspended") === "true";
  if (typeof id !== "string" || !id) return;

  await requireRole("ADMIN");
  await setMemberStatus(id, suspended);
  revalidatePath(PATH);
  revalidatePath(`${PATH}/${id}`);
}

export async function cancelInviteAction(formData: FormData): Promise<void> {
  const id = formData.get("id");
  if (typeof id !== "string" || !id) return;

  await requireRole("ADMIN");
  await cancelInvite(id);
  revalidatePath(PATH);
}
